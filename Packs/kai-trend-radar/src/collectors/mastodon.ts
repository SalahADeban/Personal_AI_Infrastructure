/**
 * Mastodon Collector v2
 * Fetches trending hashtags, posts from accounts, and public timelines
 * Enhanced with source tier tagging for early signal detection
 */

import type { Mention, CollectorResult, SourceTier } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';
import { fetchRSS } from './rss';

// Account tiers for early signal detection
interface AccountConfig {
  instance: string;
  handle: string;
  tier: 1 | 2 | 3;  // 1 = builders, 2 = early adopters, 3 = mainstream
  category: string;
}

// Instance configs for trending hashtags
interface InstanceConfig {
  domain: string;
  tier: 1 | 2 | 3;
  focus: string;  // tech, security, foss, general
}

// Tech-focused instances for early signals
const INSTANCES: InstanceConfig[] = [
  // ═══════════════════════════════════════════════════════════════
  // TIER 1 - Niche Tech Communities (EARLIEST)
  // ═══════════════════════════════════════════════════════════════
  { domain: 'hachyderm.io', tier: 1, focus: 'tech' },          // Tech professionals
  { domain: 'infosec.exchange', tier: 1, focus: 'security' },  // Security researchers
  { domain: 'fosstodon.org', tier: 1, focus: 'foss' },         // Open source devs
  { domain: 'techhub.social', tier: 1, focus: 'tech' },        // Tech enthusiasts

  // ═══════════════════════════════════════════════════════════════
  // TIER 2 - Early Adopter Communities
  // ═══════════════════════════════════════════════════════════════
  { domain: 'mastodon.gamedev.place', tier: 2, focus: 'gamedev' },
  { domain: 'sigmoid.social', tier: 2, focus: 'ai' },          // AI/ML researchers
  { domain: 'mathstodon.xyz', tier: 2, focus: 'science' },     // Scientists

  // ═══════════════════════════════════════════════════════════════
  // TIER 3 - General (validation signals)
  // ═══════════════════════════════════════════════════════════════
  { domain: 'mastodon.social', tier: 3, focus: 'general' },    // Largest instance
];

// Tiered accounts to monitor
const ACCOUNTS: AccountConfig[] = [
  // ═══════════════════════════════════════════════════════════════
  // TIER 1 - Builders & Researchers (EARLIEST)
  // ═══════════════════════════════════════════════════════════════
  { instance: 'mastodon.social', handle: 'Gargron', tier: 1, category: 'protocol' },   // Mastodon creator
  { instance: 'hachyderm.io', handle: 'nova', tier: 1, category: 'tech' },
  { instance: 'infosec.exchange', handle: 'briankrebs', tier: 1, category: 'security' },
  { instance: 'fosstodon.org', handle: 'kde', tier: 1, category: 'foss' },

  // AI/ML researchers
  { instance: 'sigmoid.social', handle: 'ylecun', tier: 1, category: 'ai' },

  // ═══════════════════════════════════════════════════════════════
  // TIER 2 - Tech Journalists & Thought Leaders
  // ═══════════════════════════════════════════════════════════════
  { instance: 'mastodon.social', handle: 'aral', tier: 2, category: 'privacy' },
  { instance: 'mastodon.social', handle: 'pluralistic', tier: 2, category: 'tech' },  // Cory Doctorow
  { instance: 'techhub.social', handle: 'techhub', tier: 2, category: 'news' },

  // Security researchers
  { instance: 'infosec.exchange', handle: 'troyhunt', tier: 2, category: 'security' },

  // ═══════════════════════════════════════════════════════════════
  // TIER 3 - Mainstream Tech Accounts
  // ═══════════════════════════════════════════════════════════════
  { instance: 'mastodon.social', handle: 'mozilla', tier: 3, category: 'tech' },
  { instance: 'fosstodon.org', handle: 'linux', tier: 3, category: 'foss' },
];

// Map tier to source tier
function getTierSourceTier(tier: number): SourceTier {
  if (tier === 1) return 'early';
  if (tier === 2) return 'rising';
  return 'mainstream';
}

// Fetch trending hashtags from an instance
async function fetchTrendingTags(instance: InstanceConfig): Promise<Mention[]> {
  const mentions: Mention[] = [];
  const sourceIcon = '🐘';

  try {
    const res = await fetch(
      `https://${instance.domain}/api/v1/trends/tags?limit=10`,
      {
        headers: { 'User-Agent': 'TrendRadar/2.0' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return mentions;

    const tags = await res.json() as any[];

    for (let i = 0; i < Math.min(tags.length, 10); i++) {
      const tag = tags[i];
      const name = tag.name || '';
      if (!name) continue;

      // Calculate engagement from usage history
      const history = tag.history || [];
      const recentUses = history.slice(0, 2).reduce((sum: number, h: any) =>
        sum + parseInt(h.uses || '0', 10), 0);
      const recentAccounts = history.slice(0, 2).reduce((sum: number, h: any) =>
        sum + parseInt(h.accounts || '0', 10), 0);

      const entities = extractEntityNames(name);

      // Tier-based engagement multiplier
      const tierMultiplier = 4 - instance.tier;

      mentions.push({
        id: `mastodon-tag-${instance.domain}-${name}-${Date.now()}`,
        source: `Mastodon/${instance.domain}/Trending`,
        sourceIcon,
        text: `#${name} trending on ${instance.domain}`,
        url: `https://${instance.domain}/tags/${name}`,
        timestamp: new Date().toISOString(),
        engagement: (recentUses + recentAccounts) * tierMultiplier,
        entities: [...entities, name],
        sourceTier: getTierSourceTier(instance.tier),
        feedType: 'trending-tag',
        sentiment: analyzeSentiment(`#${name} trending on ${instance.domain}`),
      });
    }
  } catch (error) {
    // Silent fail for individual instances
  }

  return mentions;
}

// Fetch trending statuses from an instance
async function fetchTrendingStatuses(instance: InstanceConfig): Promise<Mention[]> {
  const mentions: Mention[] = [];
  const sourceIcon = '🐘';

  try {
    const res = await fetch(
      `https://${instance.domain}/api/v1/trends/statuses?limit=5`,
      {
        headers: { 'User-Agent': 'TrendRadar/2.0' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return mentions;

    const statuses = await res.json() as any[];

    for (let i = 0; i < Math.min(statuses.length, 5); i++) {
      const status = statuses[i];
      const content = status.content || '';
      // Strip HTML tags
      const text = content.replace(/<[^>]*>/g, '').trim();
      if (!text || text.length < 20) continue;

      const author = status.account?.acct || 'unknown';
      const entities = extractEntityNames(text);

      const engagement =
        (status.favourites_count || 0) +
        (status.reblogs_count || 0) * 2 +
        (status.replies_count || 0);

      const tierMultiplier = 4 - instance.tier;

      mentions.push({
        id: `mastodon-status-${instance.domain}-${i}-${Date.now()}`,
        source: `Mastodon/${instance.domain}`,
        sourceIcon,
        text: text.slice(0, 280),
        url: status.url || `https://${instance.domain}/@${author}`,
        timestamp: status.created_at || new Date().toISOString(),
        engagement: engagement * tierMultiplier,
        entities,
        sourceTier: getTierSourceTier(instance.tier),
        feedType: 'trending-status',
        sentiment: analyzeSentiment(text.slice(0, 280)),
      });
    }
  } catch (error) {
    // Silent fail
  }

  return mentions;
}

// Fetch posts from a specific account via RSS
async function fetchAccountPosts(account: AccountConfig): Promise<Mention[]> {
  const mentions: Mention[] = [];
  const sourceIcon = '🐘';

  try {
    const items = await fetchRSS(`https://${account.instance}/@${account.handle}.rss`);

    for (let i = 0; i < Math.min(items.length, 3); i++) {
      const item = items[i];
      const text = item.title || item.description || '';
      // Strip HTML
      const cleanText = text.replace(/<[^>]*>/g, '').trim();
      if (!cleanText || cleanText.length < 20) continue;

      const entities = extractEntityNames(cleanText);

      // Tier-based engagement multiplier
      const tierMultiplier = 4 - account.tier;
      const baseEngagement = 10 - i; // Position bonus

      mentions.push({
        id: `mastodon-${account.handle}-${i}-${Date.now()}`,
        source: `Mastodon/@${account.handle}`,
        sourceIcon,
        text: cleanText.slice(0, 280),
        url: item.link || `https://${account.instance}/@${account.handle}`,
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        engagement: baseEngagement * tierMultiplier,
        entities,
        sourceTier: getTierSourceTier(account.tier),
        feedType: `tier-${account.tier}`,
        sentiment: analyzeSentiment(cleanText.slice(0, 280)),
      });
    }
  } catch (error) {
    // Silent fail for individual accounts
  }

  return mentions;
}

export async function collectMastodon(): Promise<CollectorResult> {
  const mentions: Mention[] = [];
  const source = 'mastodon';

  try {
    console.log('[Mastodon] Fetching trending tags, statuses, and accounts...');

    // 1. Fetch trending hashtags from all instances (in parallel)
    const tagPromises = INSTANCES.map(instance => fetchTrendingTags(instance));
    const tagResults = await Promise.all(tagPromises);
    for (const results of tagResults) {
      mentions.push(...results);
    }

    // 2. Fetch trending statuses from all instances (in parallel)
    const statusPromises = INSTANCES.map(instance => fetchTrendingStatuses(instance));
    const statusResults = await Promise.all(statusPromises);
    for (const results of statusResults) {
      mentions.push(...results);
    }

    // 3. Fetch from tiered accounts (in parallel)
    const accountPromises = ACCOUNTS.map(account => fetchAccountPosts(account));
    const accountResults = await Promise.all(accountPromises);
    for (const results of accountResults) {
      mentions.push(...results);
    }

    // Log stats
    const earlyCount = mentions.filter(m => m.sourceTier === 'early').length;
    const risingCount = mentions.filter(m => m.sourceTier === 'rising').length;
    const mainstreamCount = mentions.filter(m => m.sourceTier === 'mainstream').length;

    console.log(`[Mastodon] Collected ${mentions.length} mentions:`);
    console.log(`  - Early signals: ${earlyCount}`);
    console.log(`  - Rising: ${risingCount}`);
    console.log(`  - Mainstream: ${mainstreamCount}`);

    return {
      source,
      mentions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Mastodon] Error:', error);
    return {
      source,
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}
