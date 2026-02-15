/**
 * Bluesky Collector v2
 * Fetches trending topics, search results, and posts from Bluesky's public API
 * Enhanced with source tier tagging for early signal detection
 */

import type { Mention, CollectorResult, SourceTier } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';

const BLUESKY_API = 'https://public.api.bsky.app/xrpc';

// Account tiers for early signal detection
interface AccountConfig {
  handle: string;
  tier: 1 | 2 | 3;  // 1 = builders/researchers, 2 = early adopters, 3 = mainstream
  category: string;
}

// Tier 1: Bluesky team, protocol devs, AI researchers (earliest signals)
// Tier 2: Tech journalists, indie devs, thought leaders
// Tier 3: Mainstream tech accounts
const ACCOUNTS: AccountConfig[] = [
  // ═══════════════════════════════════════════════════════════════
  // TIER 1 - Builders & Protocol Developers (EARLIEST)
  // ═══════════════════════════════════════════════════════════════
  { handle: 'jay.bsky.team', tier: 1, category: 'protocol' },
  { handle: 'pfrazee.com', tier: 1, category: 'protocol' },
  { handle: 'why.bsky.team', tier: 1, category: 'protocol' },
  { handle: 'emily.bsky.team', tier: 1, category: 'protocol' },

  // AI/ML Researchers & Builders
  { handle: 'simonwillison.net', tier: 1, category: 'ai' },
  { handle: 'karpathy.ai', tier: 1, category: 'ai' },

  // Open Source & Developer Tools
  { handle: 'changelog.com', tier: 1, category: 'dev' },
  { handle: 'dhh.dk', tier: 1, category: 'dev' },

  // ═══════════════════════════════════════════════════════════════
  // TIER 2 - Tech Journalists & Indie Devs
  // ═══════════════════════════════════════════════════════════════
  { handle: 'caseynewton.net', tier: 2, category: 'journalism' },
  { handle: 'mjtsai.com', tier: 2, category: 'apple' },
  { handle: 'daringfireball.net', tier: 2, category: 'apple' },
  { handle: 'arstechnica.com', tier: 2, category: 'news' },
  { handle: 'theverge.com', tier: 2, category: 'news' },

  // Crypto/Web3 Early Adopters
  { handle: 'vitalik.eth', tier: 2, category: 'crypto' },

  // ═══════════════════════════════════════════════════════════════
  // TIER 3 - Mainstream Tech (validation signals)
  // ═══════════════════════════════════════════════════════════════
  { handle: 'techcrunch.com', tier: 3, category: 'news' },
  { handle: 'wired.com', tier: 3, category: 'news' },
  { handle: 'engadget.com', tier: 3, category: 'news' },
  { handle: 'bbc.com', tier: 3, category: 'news' },
];

// Keywords to search for early signals
const SEARCH_KEYWORDS = [
  'AI', 'LLM', 'GPT', 'Claude', 'OpenAI', 'Anthropic',
  'crypto', 'bitcoin', 'ethereum', 'solana',
  'startup', 'launch', 'announcing', 'released',
  'breaking', 'just dropped', 'shipped',
];

// Map tier to source tier
function getTierSourceTier(tier: number): SourceTier {
  if (tier === 1) return 'early';
  if (tier === 2) return 'rising';
  return 'mainstream';
}

// Search for posts matching keywords
async function searchBluesky(keyword: string, limit: number = 10): Promise<Mention[]> {
  const mentions: Mention[] = [];
  const sourceIcon = '🦋';

  try {
    const res = await fetch(
      `${BLUESKY_API}/app.bsky.feed.searchPosts?q=${encodeURIComponent(keyword)}&limit=${limit}&sort=latest`,
      { headers: { 'User-Agent': 'TrendRadar/2.0' } }
    );

    if (!res.ok) return mentions;

    const data = await res.json() as any;
    const posts = data.posts || [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const record = post?.record || {};
      const text = record.text || '';
      const author = post?.author?.handle || 'unknown';

      if (!text || text.length < 20) continue;

      const entities = extractEntityNames(text);
      const engagement = (post?.likeCount || 0) + (post?.repostCount || 0) * 2 + (post?.replyCount || 0);

      // Calculate freshness bonus (posts < 1 hour get boost)
      const postAge = Date.now() - new Date(record.createdAt || Date.now()).getTime();
      const isRecent = postAge < 60 * 60 * 1000; // < 1 hour

      mentions.push({
        id: `bluesky-search-${keyword}-${i}-${Date.now()}`,
        source: `Bluesky/Search`,
        sourceIcon,
        text: text.replace(/https?:\/\/\S+/g, '').slice(0, 280).trim(),
        url: `https://bsky.app/profile/${author}/post/${post.uri?.split('/').pop() || ''}`,
        timestamp: record.createdAt || new Date().toISOString(),
        engagement: isRecent ? engagement * 2 : engagement, // Freshness boost
        entities,
        sourceTier: 'rising', // Search results are rising signals
        feedType: 'search',
        sentiment: analyzeSentiment(text.replace(/https?:\/\/\S+/g, '').slice(0, 280).trim()),
      });
    }
  } catch (error) {
    // Silent fail for search
  }

  return mentions;
}

// Fetch posts from a specific account
async function fetchAccountPosts(account: AccountConfig): Promise<Mention[]> {
  const mentions: Mention[] = [];
  const sourceIcon = '🦋';

  try {
    const res = await fetch(
      `${BLUESKY_API}/app.bsky.feed.getAuthorFeed?actor=${account.handle}&limit=5`,
      { headers: { 'User-Agent': 'TrendRadar/2.0' } }
    );

    if (!res.ok) return mentions;

    const data = await res.json() as any;
    const posts = data.feed || [];

    for (let i = 0; i < Math.min(posts.length, 5); i++) {
      const item = posts[i];
      const post = item.post;
      const record = post?.record || {};
      const text = record.text || '';

      if (!text || text.length < 20) continue;

      const entities = extractEntityNames(text);
      const engagement = (post?.likeCount || 0) + (post?.repostCount || 0) * 2;

      // Tier-based engagement multiplier
      const tierMultiplier = 4 - account.tier; // Tier 1 = 3x, Tier 2 = 2x, Tier 3 = 1x

      mentions.push({
        id: `bluesky-${account.handle}-${i}-${Date.now()}`,
        source: `Bluesky/@${account.handle.split('.')[0]}`,
        sourceIcon,
        text: text.replace(/https?:\/\/\S+/g, '').slice(0, 280).trim(),
        url: `https://bsky.app/profile/${account.handle}`,
        timestamp: record.createdAt || new Date().toISOString(),
        engagement: engagement * tierMultiplier,
        entities,
        sourceTier: getTierSourceTier(account.tier),
        feedType: `tier-${account.tier}`,
        sentiment: analyzeSentiment(text.replace(/https?:\/\/\S+/g, '').slice(0, 280).trim()),
      });
    }
  } catch (error) {
    // Silent fail for individual accounts
  }

  return mentions;
}

export async function collectBluesky(): Promise<CollectorResult> {
  const mentions: Mention[] = [];
  const source = 'bluesky';
  const sourceIcon = '🦋';

  try {
    console.log('[Bluesky] Fetching trends, search, and accounts...');

    // 1. Try to get trending topics (mainstream signal)
    try {
      const trendingRes = await fetch(
        `${BLUESKY_API}/app.bsky.unspecced.getTrendingTopics`,
        { headers: { 'User-Agent': 'TrendRadar/2.0' } }
      );

      if (trendingRes.ok) {
        const trendingData = await trendingRes.json() as any;
        const topics = trendingData.topics || [];

        for (let i = 0; i < Math.min(topics.length, 15); i++) {
          const topic = topics[i];
          const entities = extractEntityNames(topic.name || topic.topic || '');

          mentions.push({
            id: `bluesky-trend-${i}-${Date.now()}`,
            source: 'Bluesky/Trending',
            sourceIcon,
            text: topic.name || topic.topic || '',
            url: `https://bsky.app/search?q=${encodeURIComponent(topic.name || topic.topic || '')}`,
            timestamp: new Date().toISOString(),
            engagement: topic.count || 0,
            entities,
            sourceTier: 'mainstream', // Trending = already mainstream
            feedType: 'trending',
            sentiment: analyzeSentiment(topic.name || topic.topic || ''),
          });
        }
      }
    } catch (error) {
      // Silent fail
    }

    // 2. Search for early signal keywords (in parallel)
    const searchPromises = SEARCH_KEYWORDS.slice(0, 8).map(kw => searchBluesky(kw, 5));
    const searchResults = await Promise.all(searchPromises);
    for (const results of searchResults) {
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

    console.log(`[Bluesky] Collected ${mentions.length} mentions:`);
    console.log(`  - Early signals: ${earlyCount}`);
    console.log(`  - Rising: ${risingCount}`);
    console.log(`  - Mainstream: ${mainstreamCount}`);

    return {
      source,
      mentions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Bluesky] Error:', error);
    return {
      source,
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}
