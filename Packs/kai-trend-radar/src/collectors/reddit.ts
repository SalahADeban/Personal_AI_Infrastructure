/**
 * Reddit Collector v2
 * Fetches from /rising, /new, and /hot with source tier tagging
 * Prioritizes early signals from niche subreddits
 */

import type { Mention, CollectorResult, SourceTier } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';
import { fetchRSS } from './rss';

// Niche subreddits organized by signal strength
// Tier 1: Bleeding edge - developers, researchers, builders (earliest signals)
// Tier 2: Early adopters - enthusiasts, power users
// Tier 3: Tech-savvy mainstream - broad tech communities

interface SubredditConfig {
  name: string;
  tier: 1 | 2 | 3;  // 1 = earliest, 3 = latest
  category: string;
}

const NICHE_SUBREDDIT_CONFIGS: SubredditConfig[] = [
  // ═══════════════════════════════════════════════════════════════
  // AI/ML - TIER 1 (Builders & Researchers - EARLIEST SIGNALS)
  // ═══════════════════════════════════════════════════════════════
  { name: 'localllama', tier: 1, category: 'ai' },        // Local LLM builders - VERY early
  { name: 'ollama', tier: 1, category: 'ai' },            // Ollama users
  { name: 'oobabooga', tier: 1, category: 'ai' },         // Text-gen-webui users
  { name: 'LangChain', tier: 1, category: 'ai' },         // LangChain devs
  { name: 'claudeai', tier: 1, category: 'ai' },          // Claude discussions
  { name: 'mlops', tier: 1, category: 'ai' },             // ML operations
  { name: 'deeplearning', tier: 1, category: 'ai' },      // Deep learning
  { name: 'computervision', tier: 1, category: 'ai' },    // Computer vision
  { name: 'LanguageTechnology', tier: 1, category: 'ai' },// NLP researchers

  // AI/ML - TIER 2 (Early Adopters)
  { name: 'openai', tier: 2, category: 'ai' },            // OpenAI community
  { name: 'chatgpt', tier: 2, category: 'ai' },           // ChatGPT users
  { name: 'stablediffusion', tier: 2, category: 'ai' },   // Image gen
  { name: 'midjourney', tier: 2, category: 'ai' },        // Midjourney
  { name: 'singularity', tier: 2, category: 'ai' },       // Future tech
  { name: 'agi', tier: 2, category: 'ai' },               // AGI discussions
  { name: 'machinelearning', tier: 2, category: 'ai' },   // ML community

  // ═══════════════════════════════════════════════════════════════
  // CRYPTO - TIER 1 (Developers & Technical)
  // ═══════════════════════════════════════════════════════════════
  { name: 'ethdev', tier: 1, category: 'crypto' },        // Ethereum devs
  { name: 'solanadev', tier: 1, category: 'crypto' },     // Solana devs
  { name: 'cryptotechnology', tier: 1, category: 'crypto' }, // Crypto tech
  { name: 'defi', tier: 1, category: 'crypto' },          // DeFi builders
  { name: 'ethfinance', tier: 1, category: 'crypto' },    // ETH finance
  { name: 'cosmosnetwork', tier: 1, category: 'crypto' }, // Cosmos ecosystem

  // Crypto - TIER 2 (Early Adopters)
  { name: 'cardano', tier: 2, category: 'crypto' },       // Cardano
  { name: 'polkadot', tier: 2, category: 'crypto' },      // Polkadot
  { name: 'algorand', tier: 2, category: 'crypto' },      // Algorand
  { name: 'avalanche', tier: 2, category: 'crypto' },     // Avalanche
  { name: 'nearprotocol', tier: 2, category: 'crypto' },  // NEAR

  // ═══════════════════════════════════════════════════════════════
  // TECH/DEV - TIER 1 (Core Developers)
  // ═══════════════════════════════════════════════════════════════
  { name: 'ExperiencedDevs', tier: 1, category: 'tech' }, // Senior devs
  { name: 'netsec', tier: 1, category: 'tech' },          // Security pros
  { name: 'ReverseEngineering', tier: 1, category: 'tech' }, // RE community
  { name: 'devops', tier: 1, category: 'tech' },          // DevOps
  { name: 'kubernetes', tier: 1, category: 'tech' },      // K8s
  { name: 'golang', tier: 1, category: 'tech' },          // Go devs
  { name: 'rust', tier: 1, category: 'tech' },            // Rust devs

  // Tech/Dev - TIER 2 (Active Developers)
  { name: 'programming', tier: 2, category: 'tech' },     // Programmers
  { name: 'webdev', tier: 2, category: 'tech' },          // Web devs
  { name: 'typescript', tier: 2, category: 'tech' },      // TS devs
  { name: 'node', tier: 2, category: 'tech' },            // Node.js
  { name: 'reactjs', tier: 2, category: 'tech' },         // React
  { name: 'nextjs', tier: 2, category: 'tech' },          // Next.js
  { name: 'sveltejs', tier: 2, category: 'tech' },        // Svelte
  { name: 'docker', tier: 2, category: 'tech' },          // Docker
  { name: 'linux', tier: 2, category: 'tech' },           // Linux
  { name: 'neovim', tier: 2, category: 'tech' },          // Neovim (dev tools)

  // Tech - TIER 3 (Tech Enthusiasts)
  { name: 'selfhosted', tier: 3, category: 'tech' },      // Self-hosting
  { name: 'homelab', tier: 3, category: 'tech' },         // Homelab
  { name: 'privacy', tier: 3, category: 'tech' },         // Privacy focused
  { name: 'degoogle', tier: 3, category: 'tech' },        // DeGoogle

  // ═══════════════════════════════════════════════════════════════
  // STARTUP/BUSINESS - TIER 1 (Founders & Builders)
  // ═══════════════════════════════════════════════════════════════
  { name: 'SaaS', tier: 1, category: 'business' },        // SaaS builders
  { name: 'Bootstrapped', tier: 1, category: 'business' },// Bootstrapped founders
  { name: 'indiebiz', tier: 1, category: 'business' },    // Indie business
  { name: 'sideproject', tier: 1, category: 'business' }, // Side projects
  { name: 'microsaas', tier: 1, category: 'business' },   // Micro SaaS

  // Business - TIER 2 (Entrepreneurs)
  { name: 'startups', tier: 2, category: 'business' },    // Startups
  { name: 'entrepreneur', tier: 2, category: 'business' },// Entrepreneurs
  { name: 'EntrepreneurRideAlong', tier: 2, category: 'business' }, // Founder journeys
  { name: 'smallbusiness', tier: 2, category: 'business' }, // Small business
  { name: 'ecommerce', tier: 2, category: 'business' },   // E-commerce

  // ═══════════════════════════════════════════════════════════════
  // HARDWARE/GAMING - TIER 2 (Product Launch Signals)
  // ═══════════════════════════════════════════════════════════════
  { name: 'hardware', tier: 2, category: 'hardware' },    // Hardware news
  { name: 'nvidia', tier: 2, category: 'hardware' },      // NVIDIA (GPU market)
  { name: 'Amd', tier: 2, category: 'hardware' },         // AMD
  { name: 'intel', tier: 2, category: 'hardware' },       // Intel
  { name: 'buildapc', tier: 3, category: 'hardware' },    // PC builders

  // ═══════════════════════════════════════════════════════════════
  // SCIENCE/RESEARCH - TIER 1 (Researchers)
  // ═══════════════════════════════════════════════════════════════
  { name: 'biotech', tier: 1, category: 'science' },      // Biotech
  { name: 'genomics', tier: 1, category: 'science' },     // Genomics
  { name: 'longevity', tier: 1, category: 'science' },    // Longevity research
  { name: 'QuantumComputing', tier: 1, category: 'science' }, // Quantum

  // Science - TIER 2 (Enthusiasts)
  { name: 'Astronomy', tier: 2, category: 'science' },    // Astronomy
  { name: 'Physics', tier: 2, category: 'science' },      // Physics
  { name: 'neuroscience', tier: 2, category: 'science' }, // Neuroscience
];

// Extract just the names for backward compatibility
const NICHE_SUBREDDITS = NICHE_SUBREDDIT_CONFIGS.map(c => c.name);

// Get tier for a subreddit (1 = earliest, 3 = latest among niche)
function getSubredditTier(name: string): number {
  const config = NICHE_SUBREDDIT_CONFIGS.find(
    c => c.name.toLowerCase() === name.toLowerCase()
  );
  return config?.tier || 3;
}

// Mainstream subreddits (lagging indicators, but high volume)
const MAINSTREAM_SUBREDDITS = [
  // News & World (high volume, mainstream)
  'worldnews',
  'news',
  'politics',
  'geopolitics',
  'economics',

  // Tech Mainstream
  'technology',
  'artificial',
  'gadgets',
  'apple',
  'android',
  'google',
  'microsoft',

  // Business & Finance Mainstream
  'business',
  'finance',
  'stocks',
  'wallstreetbets',
  'investing',

  // Crypto Mainstream
  'cryptocurrency',
  'bitcoin',
  'ethereum',
  'solana',
  'cryptomarkets',

  // Science & Future
  'science',
  'futurology',
  'space',
  'spacex',
  'teslamotors',
];

// Feed types to fetch (in priority order)
type FeedType = 'rising' | 'new' | 'hot';

interface FeedConfig {
  type: FeedType;
  tier: SourceTier;
  limit: number;
  engagementBonus: number; // Multiplier for scoring
}

const FEED_CONFIGS: FeedConfig[] = [
  { type: 'rising', tier: 'rising', limit: 15, engagementBonus: 2.0 },
  { type: 'new', tier: 'early', limit: 10, engagementBonus: 3.0 },
  { type: 'hot', tier: 'mainstream', limit: 20, engagementBonus: 1.0 },
];

async function fetchSubredditFeed(
  sub: string,
  feedType: FeedType,
  tier: SourceTier,
  limit: number,
  engagementBonus: number,
  isNiche: boolean
): Promise<Mention[]> {
  const mentions: Mention[] = [];
  const sourceIcon = '🔴';

  try {
    const url = `https://www.reddit.com/r/${sub}/${feedType}.rss`;
    const items = await fetchRSS(url);

    // Get subreddit tier for niche subs (1-3, lower = earlier signal)
    const subTier = isNiche ? getSubredditTier(sub) : 4; // 4 = mainstream

    for (let i = 0; i < Math.min(items.length, limit); i++) {
      const item = items[i];
      if (!item.title) continue;

      const entities = extractEntityNames(item.title);

      // Determine final tier based on subreddit tier and feed type
      let finalTier: SourceTier = tier;
      if (isNiche) {
        // Tier 1 subs are always 'early', Tier 2 subs are 'early' if rising/new
        if (subTier === 1) {
          finalTier = 'early';
        } else if (subTier === 2 && (feedType === 'rising' || feedType === 'new')) {
          finalTier = 'early';
        } else if (feedType === 'rising') {
          finalTier = 'rising';
        }
      }

      // Calculate engagement with bonuses
      // - Position bonus (first items score higher)
      // - Feed type bonus (new/rising score higher)
      // - Subreddit tier bonus (tier 1 subs score highest)
      const baseEngagement = 10 - i;
      const tierMultiplier = isNiche ? (4 - subTier) * 0.5 + 1 : 1; // Tier 1 = 2.5x, Tier 2 = 2x, Tier 3 = 1.5x
      const engagement = Math.round(baseEngagement * engagementBonus * tierMultiplier);

      mentions.push({
        id: `reddit-${sub}-${feedType}-${i}-${Date.now()}`,
        source: `r/${sub}`,
        sourceIcon,
        text: item.title,
        url: item.link || '',
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        engagement,
        entities,
        sourceTier: finalTier,
        feedType,
        sentiment: analyzeSentiment(item.title),
      });
    }
  } catch (error) {
    // Silent fail for individual feeds - don't spam logs
    // console.error(`[Reddit] Error fetching r/${sub}/${feedType}:`, error);
  }

  return mentions;
}

export async function collectReddit(): Promise<CollectorResult> {
  const mentions: Mention[] = [];
  const source = 'reddit';

  try {
    console.log('[Reddit] Fetching from subreddits (rising + new + hot)...');

    // Collect from niche subreddits first (early signals)
    const nichePromises: Promise<Mention[]>[] = [];
    for (const sub of NICHE_SUBREDDITS) {
      for (const config of FEED_CONFIGS) {
        // Skip /hot for niche - we only want early signals
        if (config.type === 'hot') continue;

        nichePromises.push(
          fetchSubredditFeed(
            sub,
            config.type,
            config.tier,
            config.limit,
            config.engagementBonus,
            true // isNiche
          )
        );
      }
    }

    // Collect from mainstream subreddits (all feeds)
    const mainstreamPromises: Promise<Mention[]>[] = [];
    for (const sub of MAINSTREAM_SUBREDDITS) {
      for (const config of FEED_CONFIGS) {
        mainstreamPromises.push(
          fetchSubredditFeed(
            sub,
            config.type,
            config.tier,
            config.limit,
            config.engagementBonus,
            false // isNiche
          )
        );
      }
    }

    // Run all fetches in parallel (with some concurrency control)
    const allPromises = [...nichePromises, ...mainstreamPromises];
    const results = await Promise.all(allPromises);

    // Flatten results
    for (const result of results) {
      mentions.push(...result);
    }

    // Log stats
    const earlyCount = mentions.filter(m => m.sourceTier === 'early').length;
    const risingCount = mentions.filter(m => m.sourceTier === 'rising').length;
    const mainstreamCount = mentions.filter(m => m.sourceTier === 'mainstream').length;

    console.log(`[Reddit] Collected ${mentions.length} mentions:`);
    console.log(`  - Early signals: ${earlyCount}`);
    console.log(`  - Rising: ${risingCount}`);
    console.log(`  - Mainstream: ${mainstreamCount}`);

    return {
      source,
      mentions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Reddit] Error:', error);
    return {
      source,
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}

// Export subreddit lists for reference
export { NICHE_SUBREDDITS, MAINSTREAM_SUBREDDITS };
