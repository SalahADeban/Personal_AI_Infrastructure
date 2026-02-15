/**
 * Twitter/X Trends Collector v2
 * Fetches Twitter trending topics via public sources (no auth required)
 * Enhanced with source tier tagging - trending = mainstream signals
 *
 * NOTE: Direct Twitter API access requires auth. Nitter instances are blocked.
 * This collector uses public trend aggregator sites as a fallback.
 */

import type { Mention, CollectorResult, SourceTier } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';

// Scrape trends from Trends24.in (public Twitter trends tracker)
async function fetchTrends24(): Promise<string[]> {
  const trends: string[] = [];

  try {
    const res = await fetch('https://trends24.in/united-states/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) return [];

    const html = await res.text();

    // Extract trend names from the HTML
    // Trends24 uses <a class="trend-link" ...>trend name</a>
    const trendMatches = html.match(/<a[^>]*class="[^"]*trend-link[^"]*"[^>]*>([^<]+)<\/a>/gi) || [];

    for (const match of trendMatches) {
      const name = match.match(/>([^<]+)</)?.[1]?.trim();
      if (name && name.length > 1 && !trends.includes(name)) {
        trends.push(name);
      }
    }

    // Also try to match trends in list items
    const listMatches = html.match(/<li[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi) || [];
    for (const match of listMatches) {
      const name = match.match(/>([^<]+)</)?.[1]?.trim();
      if (name && name.length > 1 && !name.includes('trend') && !trends.includes(name)) {
        trends.push(name);
      }
    }

  } catch (error) {
    console.error('[Twitter] Trends24 error:', error);
  }

  return trends.slice(0, 30);
}

// Scrape from GetDayTrends (backup source)
async function fetchGetDayTrends(): Promise<string[]> {
  const trends: string[] = [];

  try {
    const res = await fetch('https://getdaytrends.com/united-states/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) return [];

    const html = await res.text();

    // Extract trends from table rows
    const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi) || [];

    for (const match of rowMatches) {
      const name = match.match(/<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
      if (name && name.length > 1 && !trends.includes(name)) {
        trends.push(name);
      }
    }

  } catch (error) {
    console.error('[Twitter] GetDayTrends error:', error);
  }

  return trends.slice(0, 20);
}

// Determine source tier based on trend position
// Top trends = more established (mainstream), lower = potentially still rising
function getTrendTier(position: number, totalTrends: number): SourceTier {
  const percentile = position / totalTrends;
  // Top 20% = fully mainstream
  if (percentile <= 0.2) return 'mainstream';
  // Middle 40% = rising
  if (percentile <= 0.6) return 'rising';
  // Bottom 40% = could be early (just starting to trend)
  return 'rising'; // Note: Twitter trends are inherently mainstream, best we can do
}

export async function collectTwitterTrends(): Promise<CollectorResult> {
  const mentions: Mention[] = [];
  const source = 'twitter';
  const sourceIcon = '𝕏';

  try {
    console.log('[Twitter] Fetching trends (no auth)...');

    // Try multiple sources in parallel
    const [trends24, dayTrends] = await Promise.all([
      fetchTrends24(),
      fetchGetDayTrends(),
    ]);

    // Merge and deduplicate
    const allTrends = [...new Set([...trends24, ...dayTrends])];

    console.log(`[Twitter] Found ${allTrends.length} trends`);

    // Convert to mentions with tier tagging
    for (let i = 0; i < allTrends.length; i++) {
      const trend = allTrends[i];

      // Clean up hashtags for entity extraction
      const cleanTrend = trend.replace(/^#/, '');
      const entities = extractEntityNames(cleanTrend);

      // Also add the trend itself as an entity
      if (!entities.includes(cleanTrend) && cleanTrend.length > 2) {
        entities.push(cleanTrend);
      }

      // Determine tier based on position
      const tier = getTrendTier(i, allTrends.length);

      // Engagement based on position (higher position = more engagement)
      const engagement = Math.max(allTrends.length - i, 1) * 100;

      mentions.push({
        id: `twitter-trend-${i}-${Date.now()}`,
        source: 'X/Trending',
        sourceIcon,
        text: trend,
        url: `https://x.com/search?q=${encodeURIComponent(trend)}`,
        timestamp: new Date().toISOString(),
        engagement,
        entities,
        sourceTier: tier, // Twitter trends are mostly mainstream
        feedType: 'trending',
        sentiment: analyzeSentiment(trend),
      });
    }

    // Log stats
    const risingCount = mentions.filter(m => m.sourceTier === 'rising').length;
    const mainstreamCount = mentions.filter(m => m.sourceTier === 'mainstream').length;

    console.log(`[Twitter] Collected ${mentions.length} trend mentions:`);
    console.log(`  - Rising: ${risingCount}`);
    console.log(`  - Mainstream: ${mainstreamCount}`);

    return {
      source,
      mentions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Twitter] Error:', error);
    return {
      source,
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}
