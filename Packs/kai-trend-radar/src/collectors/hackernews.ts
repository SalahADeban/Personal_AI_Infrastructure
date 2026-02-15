/**
 * HackerNews Collector
 * Fetches top stories from HN API
 */

import type { Mention, CollectorResult } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';

const HN_API = 'https://hacker-news.firebaseio.com/v0';

interface HNStory {
  id: number;
  title: string;
  url?: string;
  score: number;
  descendants?: number;
  time: number;
  by: string;
}

export async function collectHackerNews(): Promise<CollectorResult> {
  const mentions: Mention[] = [];
  const source = 'hackernews';
  const sourceIcon = '🟠';

  try {
    console.log('[HN] Fetching top stories...');

    // Get top story IDs
    const res = await fetch(`${HN_API}/topstories.json`);
    const ids = (await res.json()) as number[];
    const topIds = ids.slice(0, 30);

    // Fetch story details in parallel
    const stories = await Promise.all(
      topIds.map(async (id): Promise<HNStory | null> => {
        try {
          const storyRes = await fetch(`${HN_API}/item/${id}.json`);
          return storyRes.json();
        } catch {
          return null;
        }
      })
    );

    // Convert to mentions
    for (const story of stories) {
      if (!story || !story.title) continue;

      const entities = extractEntityNames(story.title);

      mentions.push({
        id: `hn-${story.id}`,
        source,
        sourceIcon,
        text: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        timestamp: new Date(story.time * 1000).toISOString(),
        engagement: story.score + (story.descendants || 0),
        entities,
        sentiment: analyzeSentiment(story.title),
      });
    }

    console.log(`[HN] Collected ${mentions.length} mentions`);

    return {
      source,
      mentions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[HN] Error:', error);
    return {
      source,
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}
