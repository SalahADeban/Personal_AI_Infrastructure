/**
 * Collectors Index
 * Exports all collector functions
 */

export { collectHackerNews } from './hackernews';
export { collectReddit } from './reddit';
export { collectBluesky } from './bluesky';
export { collectMastodon } from './mastodon';
export { collectGoogleTrends } from './google';
export { collectTechNews, fetchRSS } from './rss';
export { collectTwitterTrends } from './twitter';
export { collectGitHub } from './github';

import type { CollectorResult } from '../types';
import { collectHackerNews } from './hackernews';
import { collectReddit } from './reddit';
import { collectBluesky } from './bluesky';
import { collectMastodon } from './mastodon';
import { collectGoogleTrends } from './google';
import { collectTechNews } from './rss';
import { collectTwitterTrends } from './twitter';
import { collectGitHub } from './github';

// Run all Node.js collectors in parallel
export async function collectAll(): Promise<CollectorResult[]> {
  console.log('[Collectors] Running all collectors...');

  const results = await Promise.all([
    collectHackerNews(),
    collectReddit(),
    collectBluesky(),
    collectMastodon(),
    collectGoogleTrends(),
    collectTechNews(),
    collectTwitterTrends(),
    collectGitHub(),
  ]);

  const totalMentions = results.reduce((sum, r) => sum + r.mentions.length, 0);
  console.log(`[Collectors] Total: ${totalMentions} mentions from ${results.length} sources`);

  return results;
}
