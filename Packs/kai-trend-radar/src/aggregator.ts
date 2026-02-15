/**
 * TrendRadar v2 Aggregator
 * Aggregates mentions into trending topics with velocity scoring
 */

import type {
  Mention,
  Topic,
  ContextSnippet,
  SourceCount,
  TopicCategory,
  VelocityLabel,
  CollectorResult,
  SourceTier,
  TimelinePoint,
} from './types';
import {
  loadMentions,
  addMentions,
  loadTopics,
  saveTopics,
  getHistoricalMentionCount,
  getHistoricalSentimentScore,
  saveHistorySnapshot,
  getTopicTimeline,
} from './storage';
import { collectAll } from './collectors';
import { normalizeEntityName, getEntityCategory } from './extractor';
import { aggregateSentiment, detectSentimentTrend } from './sentiment';

// Minimum mentions to be considered a topic
const MIN_MENTIONS = 2;
// Maximum topics to display
const MAX_TOPICS = 100;
// Hours to look back for historical comparison
const VELOCITY_HOURS = 6;

interface PlatformData {
  platform: string;
  firstSeen: string;
  count: number;
}

interface EntityAggregation {
  name: string;
  normalizedName: string;
  category: TopicCategory;
  mentions: Mention[];
  sources: Set<string>;
  // Early signal tracking
  tierCounts: { early: number; rising: number; mainstream: number };
  firstSeen: { source: string; timestamp: string } | null;
  // Cross-platform tracking
  platforms: Map<string, PlatformData>;
}

// Extract platform name from source string
function getPlatformFromSource(source: string): string {
  const s = source.toLowerCase();

  // Reddit variations
  if (s.startsWith('r/') || s.includes('reddit')) return 'reddit';

  // Twitter/X variations
  if (s.includes('twitter') || s.includes('x/') || s === 'x' || s.includes('trending')) return 'twitter';

  // Other platforms
  if (s.includes('hackernews') || s === 'hn') return 'hackernews';
  if (s.includes('bluesky')) return 'bluesky';
  if (s.includes('mastodon')) return 'mastodon';
  if (s.includes('google')) return 'google';
  if (s.includes('tiktok')) return 'tiktok';

  // News sources grouped as 'news'
  if (s.includes('techcrunch') || s.includes('verge') || s.includes('arstechnica') ||
      s.includes('zdnet') || s.includes('wired') || s.includes('engadget') ||
      s.includes('cointelegraph') || s.includes('coindesk')) return 'news';

  return source.split('/')[0].toLowerCase();
}

// Calculate cross-platform correlation score
function calculateCrossPlatformScore(
  platforms: Map<string, PlatformData>,
  mentionCount: number
): { score: number; isCrossPlatform: boolean; platformList: string[]; timeline: PlatformData[] } {
  const platformList = Array.from(platforms.keys());
  const platformCount = platformList.length;
  const timeline = Array.from(platforms.values()).sort(
    (a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime()
  );

  // Need 3+ platforms to be considered cross-platform
  const isCrossPlatform = platformCount >= 3;

  let score = 0;

  if (isCrossPlatform) {
    // Base score: 20 points per platform beyond 2
    score += (platformCount - 2) * 20;

    // Bonus for rapid spread (all platforms within 2 hours)
    if (timeline.length >= 3) {
      const first = new Date(timeline[0].firstSeen).getTime();
      const last = new Date(timeline[timeline.length - 1].firstSeen).getTime();
      const spreadTimeHours = (last - first) / (1000 * 60 * 60);

      if (spreadTimeHours <= 2) {
        score += 30; // Rapid spread bonus
      } else if (spreadTimeHours <= 6) {
        score += 15; // Moderate spread bonus
      }
    }

    // Bonus for balanced distribution across platforms
    const avgMentionsPerPlatform = mentionCount / platformCount;
    const minMentions = Math.min(...Array.from(platforms.values()).map(p => p.count));
    if (minMentions >= avgMentionsPerPlatform * 0.3) {
      score += 20; // Well-distributed mentions
    }
  }

  return { score, isCrossPlatform, platformList, timeline };
}

// Calculate velocity score
function calculateVelocity(
  currentCount: number,
  previousCount: number
): { velocity: number; velocityLabel: VelocityLabel; velocityPercent: number } {
  // New topic
  if (previousCount === 0) {
    return {
      velocity: 3,
      velocityLabel: 'new',
      velocityPercent: 100,
    };
  }

  const percentChange = ((currentCount - previousCount) / previousCount) * 100;

  let velocity: number;
  let velocityLabel: VelocityLabel;

  if (percentChange > 200) {
    velocity = 3;
    velocityLabel = 'exploding';
  } else if (percentChange > 100) {
    velocity = 2;
    velocityLabel = 'rising-fast';
  } else if (percentChange > 25) {
    velocity = 1;
    velocityLabel = 'rising';
  } else if (percentChange > -25) {
    velocity = 0;
    velocityLabel = 'stable';
  } else if (percentChange > -50) {
    velocity = -1;
    velocityLabel = 'declining';
  } else {
    velocity = -2;
    velocityLabel = 'falling';
  }

  return {
    velocity,
    velocityLabel,
    velocityPercent: Math.round(percentChange),
  };
}

// Calculate composite score
function calculateScore(
  mentionCount: number,
  sourceDiversity: number,
  velocity: number,
  avgEngagement: number,
  earlySignalBonus: number = 0
): number {
  // Base score from mention count
  const mentionScore = Math.log10(mentionCount + 1) * 100;

  // Diversity multiplier (more sources = more credible)
  const diversityMultiplier = Math.log2(sourceDiversity + 1);

  // Velocity multiplier
  const velocityMultiplier = 1 + (velocity * 0.2);

  // Engagement bonus
  const engagementBonus = Math.log10(avgEngagement + 1) * 10;

  // Early signal bonus (additive)
  const baseScore = (mentionScore * diversityMultiplier * velocityMultiplier) + engagementBonus;

  return Math.round(baseScore + earlySignalBonus);
}

// Calculate early signal score
// High score = high velocity from low base (the "catching fire" pattern)
function calculateEarlySignalScore(
  mentionCount: number,
  velocity: number,
  tierCounts: { early: number; rising: number; mainstream: number },
  sourceDiversity: number,
  previousCount: number
): { score: number; isEarlySignal: boolean } {
  // Early signal criteria:
  // 1. Low total mentions (< 50) but growing
  // 2. High proportion from early/rising sources
  // 3. Multiple sources (cross-platform validation)
  // 4. New or rapidly growing

  const earlyRatio = (tierCounts.early + tierCounts.rising) / Math.max(mentionCount, 1);
  const isLowVolume = mentionCount < 50;
  const isGrowing = velocity >= 1; // rising, rising-fast, exploding, or new
  const hasMultipleSources = sourceDiversity >= 2;
  const isNew = previousCount === 0;

  // Calculate early signal score
  let score = 0;

  // Bonus for early/rising source ratio (max 50 points)
  score += earlyRatio * 50;

  // Bonus for being new (30 points)
  if (isNew) score += 30;

  // Bonus for high velocity with low volume (max 40 points)
  if (isLowVolume && isGrowing) {
    score += velocity * 10 + 10;
  }

  // Bonus for cross-platform validation (max 20 points)
  if (hasMultipleSources) {
    score += Math.min(sourceDiversity * 5, 20);
  }

  // Determine if this qualifies as an early signal
  const isEarlySignal = (
    score >= 40 && // Minimum threshold
    isGrowing &&
    (earlyRatio >= 0.3 || isNew) && // At least 30% from early sources, or brand new
    (isLowVolume || isNew) // Either low volume or new
  );

  return { score: Math.round(score), isEarlySignal };
}

// Get top context snippets for a topic
function getTopContext(mentions: Mention[], maxSnippets: number = 5): ContextSnippet[] {
  // Sort by engagement (highest first)
  const sorted = [...mentions].sort((a, b) =>
    (b.engagement || 0) - (a.engagement || 0)
  );

  return sorted.slice(0, maxSnippets).map(m => ({
    text: m.text.slice(0, 200),
    source: m.source,
    sourceIcon: m.sourceIcon,
    url: m.url,
    timestamp: m.timestamp,
    engagement: m.engagement,
  }));
}

// Get source counts
function getSourceCounts(mentions: Mention[]): SourceCount[] {
  const counts = new Map<string, { source: string; icon: string; count: number }>();

  for (const m of mentions) {
    const key = m.source.split('/')[0]; // Normalize source name
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { source: m.source, icon: m.sourceIcon, count: 1 });
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

// Aggregate mentions into topics
export function aggregateTopics(mentions: Mention[]): Topic[] {
  console.log(`[Aggregator] Processing ${mentions.length} mentions...`);

  // Group mentions by entity
  const entityMap = new Map<string, EntityAggregation>();

  for (const mention of mentions) {
    for (const entityName of mention.entities) {
      const normalizedName = normalizeEntityName(entityName);

      if (!normalizedName || normalizedName.length < 2) continue;

      let agg = entityMap.get(normalizedName);
      if (!agg) {
        agg = {
          name: entityName,
          normalizedName,
          category: getEntityCategory(entityName),
          mentions: [],
          sources: new Set(),
          tierCounts: { early: 0, rising: 0, mainstream: 0 },
          firstSeen: null,
          platforms: new Map(),
        };
        entityMap.set(normalizedName, agg);
      }

      agg.mentions.push(mention);
      agg.sources.add(mention.source);

      // Track source tier counts
      const tier = mention.sourceTier || 'mainstream';
      agg.tierCounts[tier]++;

      // Track first seen (earliest timestamp)
      if (!agg.firstSeen || new Date(mention.timestamp) < new Date(agg.firstSeen.timestamp)) {
        agg.firstSeen = {
          source: mention.source,
          timestamp: mention.timestamp,
        };
      }

      // Track platform data
      const platform = getPlatformFromSource(mention.source);
      const existingPlatform = agg.platforms.get(platform);
      if (!existingPlatform) {
        agg.platforms.set(platform, {
          platform,
          firstSeen: mention.timestamp,
          count: 1,
        });
      } else {
        existingPlatform.count++;
        // Update firstSeen if this mention is earlier
        if (new Date(mention.timestamp) < new Date(existingPlatform.firstSeen)) {
          existingPlatform.firstSeen = mention.timestamp;
        }
      }
    }
  }

  // Convert to topics
  const topics: Topic[] = [];

  for (const [, agg] of entityMap) {
    // Skip topics with too few mentions
    if (agg.mentions.length < MIN_MENTIONS) continue;

    const sourceDiversity = agg.sources.size;
    const mentionCount = agg.mentions.length;

    // Get historical data for velocity
    const previousCount = getHistoricalMentionCount(agg.normalizedName, VELOCITY_HOURS);
    const { velocity, velocityLabel, velocityPercent } = calculateVelocity(mentionCount, previousCount);

    // Calculate average engagement
    const totalEngagement = agg.mentions.reduce((sum, m) => sum + (m.engagement || 0), 0);
    const avgEngagement = totalEngagement / agg.mentions.length;

    // Calculate early signal score
    const { score: earlySignalScore, isEarlySignal } = calculateEarlySignalScore(
      mentionCount,
      velocity,
      agg.tierCounts,
      sourceDiversity,
      previousCount
    );

    // Calculate cross-platform score
    const {
      score: crossPlatformScore,
      isCrossPlatform,
      platformList,
      timeline: platformTimeline
    } = calculateCrossPlatformScore(agg.platforms, mentionCount);

    // Calculate sentiment
    const sentiment = aggregateSentiment(agg.mentions);
    const historicalSentiment = getHistoricalSentimentScore(agg.normalizedName, VELOCITY_HOURS);
    const sentimentTrend = historicalSentiment !== null
      ? detectSentimentTrend(sentiment.sentimentScore, historicalSentiment)
      : 'stable' as const;

    // Calculate composite score (with early signal and cross-platform bonuses)
    const earlyBonus = isEarlySignal ? earlySignalScore * 0.5 : 0; // 50% of early score as bonus
    const crossPlatformBonus = isCrossPlatform ? crossPlatformScore * 0.5 : 0; // 50% of cross-platform score as bonus
    const totalBonus = earlyBonus + crossPlatformBonus;
    const score = calculateScore(mentionCount, sourceDiversity, velocity, avgEngagement, totalBonus);

    topics.push({
      id: agg.normalizedName,
      name: agg.name,
      normalizedName: agg.normalizedName,
      category: agg.category,
      score,
      velocity,
      velocityLabel,
      velocityPercent,
      mentionCount,
      sourceDiversity,
      sources: getSourceCounts(agg.mentions),
      context: getTopContext(agg.mentions),
      relatedTopics: [], // populated after all topics built
      timeline: getTopicTimeline(agg.normalizedName),
      lastUpdated: new Date().toISOString(),
      // Early signal fields
      isEarlySignal,
      earlySignalScore,
      firstSeenSource: agg.firstSeen?.source,
      firstSeenAt: agg.firstSeen?.timestamp,
      sourceTierBreakdown: agg.tierCounts,
      // Cross-platform fields
      isCrossPlatform,
      platformCount: platformList.length,
      platforms: platformList,
      crossPlatformScore,
      platformTimeline,
      // Sentiment fields
      sentimentScore: sentiment.sentimentScore,
      sentimentLabel: sentiment.sentimentLabel,
      sentimentBreakdown: sentiment.sentimentBreakdown,
      sentimentTrend,
    });
  }

  // Build co-occurrence related topics
  const topicNameSet = new Set(topics.map(t => t.normalizedName));
  for (const topic of topics) {
    const agg = entityMap.get(topic.normalizedName);
    if (!agg) continue;

    const cooccurrence = new Map<string, number>();
    for (const mention of agg.mentions) {
      for (const entity of mention.entities) {
        const normalized = normalizeEntityName(entity);
        if (!normalized || normalized === topic.normalizedName) continue;
        if (!topicNameSet.has(normalized)) continue;
        cooccurrence.set(normalized, (cooccurrence.get(normalized) || 0) + 1);
      }
    }

    topic.relatedTopics = Array.from(cooccurrence.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
  }

  // Sort by score (highest first)
  topics.sort((a, b) => b.score - a.score);

  // Limit to max topics
  const trimmed = topics.slice(0, MAX_TOPICS);

  // Log stats
  const earlySignals = trimmed.filter(t => t.isEarlySignal);
  const crossPlatform = trimmed.filter(t => t.isCrossPlatform);
  console.log(`[Aggregator] Generated ${trimmed.length} topics from ${entityMap.size} entities`);
  console.log(`[Aggregator] Early signals: ${earlySignals.length} | Cross-platform: ${crossPlatform.length}`);

  return trimmed;
}

// Main refresh function - collect, extract, aggregate
export async function refreshTopics(): Promise<Topic[]> {
  console.log('[Aggregator] Refreshing topics...');

  try {
    // Collect new mentions
    const results = await collectAll();

    // Flatten mentions
    const newMentions: Mention[] = [];
    for (const result of results) {
      newMentions.push(...result.mentions);
    }

    // Add to storage (deduplicates)
    addMentions(newMentions);

    // Load all mentions (includes historical)
    const allMentions = loadMentions();

    // Filter to recent window (last 24 hours for aggregation)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentMentions = allMentions.filter(m =>
      new Date(m.timestamp).getTime() > cutoff
    );

    // Aggregate into topics
    const topics = aggregateTopics(recentMentions);

    // Save topics
    saveTopics(topics);

    // Save history snapshot for velocity calculation
    saveHistorySnapshot(topics);

    console.log(`[Aggregator] Refresh complete: ${topics.length} topics`);

    return topics;
  } catch (error) {
    console.error('[Aggregator] Refresh error:', error);
    return loadTopics(); // Return cached topics on error
  }
}

// Get current topics (from cache)
export function getTopics(): Topic[] {
  return loadTopics();
}

// Get topics by category
export function getTopicsByCategory(category: TopicCategory): Topic[] {
  return loadTopics().filter(t => t.category === category);
}

// Get single topic with all mentions and timeline
export function getTopicDetail(id: string): { topic: Topic | null; mentions: Mention[]; timeline: TimelinePoint[] } {
  const topics = loadTopics();
  const topic = topics.find(t => t.id === id || t.normalizedName === id);

  if (!topic) {
    return { topic: null, mentions: [], timeline: [] };
  }

  const allMentions = loadMentions();
  const topicMentions = allMentions.filter(m =>
    m.entities.some(e => normalizeEntityName(e) === topic.normalizedName)
  );

  const timeline = getTopicTimeline(topic.normalizedName);

  return { topic, mentions: topicMentions, timeline };
}
