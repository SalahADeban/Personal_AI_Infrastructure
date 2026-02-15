/**
 * GitHub Trending Collector
 * Fetches trending repositories and developers from GitHub
 * Excellent early signal for developer interest in new tech
 */

import type { Mention, CollectorResult, SourceTier } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';

// Time windows for trending (earlier = more early signal)
type TimeWindow = 'daily' | 'weekly' | 'monthly';

interface TrendingConfig {
  window: TimeWindow;
  tier: SourceTier;
  limit: number;
}

const TRENDING_CONFIGS: TrendingConfig[] = [
  { window: 'daily', tier: 'early', limit: 25 },    // Daily = most recent/early
  { window: 'weekly', tier: 'rising', limit: 15 },  // Weekly = rising
];

// Language filters for tech categories (empty string = all languages)
const LANGUAGE_FILTERS = [
  '',              // All languages
  'typescript',   // TypeScript (web/fullstack)
  'python',       // Python (AI/ML/Data)
  'rust',         // Rust (systems)
  'go',           // Go (infrastructure)
];

// Parse GitHub trending page HTML to extract repos
function parseGitHubTrending(html: string): Array<{
  repo: string;
  owner: string;
  description: string;
  language: string;
  stars: number;
  starsToday: number;
}> {
  const repos: Array<{
    repo: string;
    owner: string;
    description: string;
    language: string;
    stars: number;
    starsToday: number;
  }> = [];

  // Simple extraction: find all href="/owner/repo" patterns
  // Filter out known non-repo paths
  const skipPaths = [
    'trending', 'sponsors', 'search', 'explore', 'apps',
    'settings', 'marketplace', 'collections', 'topics',
    'features', 'security', 'customer-stories', 'readme',
    'pricing', 'enterprise', 'team', 'about', 'contact',
  ];

  const hrefMatches = html.match(/href="\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)"/g) || [];

  for (const match of hrefMatches) {
    const urlMatch = match.match(/href="\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)"/);
    if (!urlMatch) continue;

    const owner = urlMatch[1];
    const repo = urlMatch[2];

    // Skip non-repo paths
    if (skipPaths.includes(owner.toLowerCase())) continue;
    if (repo.includes('.')) continue; // Skip file paths like .github
    if (owner.length < 2 || repo.length < 2) continue;

    // Skip if already added
    if (repos.some(r => r.owner === owner && r.repo === repo)) continue;

    // Try to extract stars today from nearby text
    const starsMatch = html.match(new RegExp(
      `${owner}/${repo}[\\s\\S]{0,500}?([\\d,]+)\\s+stars\\s+today`,
      'i'
    ));
    const starsToday = parseInt(starsMatch?.[1]?.replace(/,/g, '') || '0', 10);

    repos.push({
      owner,
      repo,
      description: '',
      language: '',
      stars: 0,
      starsToday,
    });

    // Limit to 30 repos
    if (repos.length >= 30) break;
  }

  return repos;
}

// Fetch trending repos for a specific time window
async function fetchTrendingRepos(
  window: TimeWindow,
  tier: SourceTier,
  limit: number,
  language: string = ''
): Promise<Mention[]> {
  const mentions: Mention[] = [];
  const sourceIcon = '⬛';

  try {
    const langParam = language ? `/${language}` : '';
    const url = `https://github.com/trending${langParam}?since=${window}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return mentions;

    const html = await res.text();
    const repos = parseGitHubTrending(html);

    for (let i = 0; i < Math.min(repos.length, limit); i++) {
      const repo = repos[i];
      const fullName = `${repo.owner}/${repo.repo}`;

      // Extract entities from repo name and description
      const text = repo.description
        ? `${repo.repo}: ${repo.description}`
        : repo.repo;
      const entities = extractEntityNames(text);

      // Add repo name as entity if meaningful
      const repoWords = repo.repo.split(/[-_]/).filter(w => w.length > 2);
      for (const word of repoWords) {
        if (!entities.includes(word) && word.length > 2) {
          entities.push(word);
        }
      }

      // Calculate engagement based on position and stars today
      const positionBonus = (limit - i) * 2;
      const starsBonus = Math.min(repo.starsToday, 100);
      const engagement = positionBonus + starsBonus;

      // Tier boost for daily trending
      const tierMultiplier = tier === 'early' ? 2 : 1;

      mentions.push({
        id: `github-${window}-${i}-${Date.now()}`,
        source: `GitHub/Trending/${window}`,
        sourceIcon,
        text: text.slice(0, 280),
        url: `https://github.com/${fullName}`,
        timestamp: new Date().toISOString(),
        engagement: engagement * tierMultiplier,
        entities,
        sourceTier: tier,
        feedType: `trending-${window}`,
        sentiment: analyzeSentiment(text.slice(0, 280)),
      });
    }
  } catch (error) {
    // Silent fail
  }

  return mentions;
}

export async function collectGitHub(): Promise<CollectorResult> {
  const mentions: Mention[] = [];
  const source = 'github';

  try {
    console.log('[GitHub] Fetching trending repos...');

    // Fetch trending for each time window (in parallel)
    const promises: Promise<Mention[]>[] = [];

    for (const config of TRENDING_CONFIGS) {
      // Fetch all languages
      promises.push(fetchTrendingRepos(config.window, config.tier, config.limit));

      // Also fetch specific languages for deeper coverage
      for (const lang of LANGUAGE_FILTERS.slice(1)) {
        promises.push(fetchTrendingRepos(config.window, config.tier, 5, lang));
      }
    }

    const results = await Promise.all(promises);
    for (const result of results) {
      mentions.push(...result);
    }

    // Deduplicate by repo URL
    const seen = new Set<string>();
    const deduped = mentions.filter(m => {
      if (seen.has(m.url)) return false;
      seen.add(m.url);
      return true;
    });

    // Log stats
    const earlyCount = deduped.filter(m => m.sourceTier === 'early').length;
    const risingCount = deduped.filter(m => m.sourceTier === 'rising').length;

    console.log(`[GitHub] Collected ${deduped.length} mentions:`);
    console.log(`  - Early signals: ${earlyCount}`);
    console.log(`  - Rising: ${risingCount}`);

    return {
      source,
      mentions: deduped,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[GitHub] Error:', error);
    return {
      source,
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}
