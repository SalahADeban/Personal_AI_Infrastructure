/**
 * Google Trends Collector
 * Fetches trending searches via Google Trends RSS feed
 * Note: For full pytrends support, use the Python collector
 */

import type { Mention, CollectorResult } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';
import { fetchRSS } from './rss';

const GOOGLE_TRENDS_RSS = 'https://trends.google.com/trending/rss?geo=US';

export async function collectGoogleTrends(): Promise<CollectorResult> {
  const mentions: Mention[] = [];
  const source = 'google';
  const sourceIcon = '🔍';

  try {
    console.log('[Google] Fetching trending searches...');

    const items = await fetchRSS(GOOGLE_TRENDS_RSS);

    for (let i = 0; i < Math.min(items.length, 20); i++) {
      const item = items[i];
      if (!item.title) continue;

      const entities = extractEntityNames(item.title);

      // Add the trend itself as an entity
      if (!entities.includes(item.title)) {
        entities.push(item.title);
      }

      mentions.push({
        id: `google-${i}-${Date.now()}`,
        source: 'Google Trends',
        sourceIcon,
        text: item.title,
        url: item.link || `https://trends.google.com/trends/explore?q=${encodeURIComponent(item.title)}`,
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        entities,
        sentiment: analyzeSentiment(item.title),
      });
    }

    console.log(`[Google] Collected ${mentions.length} mentions`);

    return {
      source,
      mentions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Google] Error:', error);
    return {
      source,
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}
