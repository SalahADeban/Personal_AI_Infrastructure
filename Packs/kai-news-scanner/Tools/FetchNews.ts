#!/usr/bin/env bun
/**
 * FetchNews CLI - Fetch news from RSS feeds by topic
 *
 * Usage:
 *   bun run FetchNews.ts <topic>
 *
 * Topics: tech, crypto, world, all
 */

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsScanner/1.0)',
  },
});

// RSS feed configurations by topic
const FEEDS: Record<string, { name: string; url: string }[]> = {
  tech: [
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  ],
  crypto: [
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/' },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  ],
  world: [
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best' },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  ],
};

interface NewsItem {
  title: string;
  link: string;
  source: string;
  date: string;
  summary?: string;
}

async function fetchFeed(feed: { name: string; url: string }): Promise<NewsItem[]> {
  try {
    const result = await parser.parseURL(feed.url);
    return (result.items || []).slice(0, 5).map((item) => ({
      title: item.title || 'No title',
      link: item.link || '',
      source: feed.name,
      date: item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'Unknown',
      summary: item.contentSnippet?.slice(0, 150) || item.content?.slice(0, 150) || '',
    }));
  } catch (error) {
    console.error(`  [!] Failed to fetch ${feed.name}: ${(error as Error).message}`);
    return [];
  }
}

async function fetchTopic(topic: string): Promise<NewsItem[]> {
  const feeds = FEEDS[topic];
  if (!feeds) {
    console.error(`Unknown topic: ${topic}`);
    console.error(`Available topics: ${Object.keys(FEEDS).join(', ')}, all`);
    process.exit(1);
  }

  console.log(`\n📰 Fetching ${topic.toUpperCase()} news...\n`);

  const results: NewsItem[] = [];
  for (const feed of feeds) {
    process.stdout.write(`  Fetching ${feed.name}...`);
    const items = await fetchFeed(feed);
    results.push(...items);
    console.log(` ✓ (${items.length} items)`);
  }

  return results;
}

function formatOutput(topic: string, items: NewsItem[]): void {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`## ${topic.toUpperCase()} News - ${date}`);
  console.log(`${'='.repeat(60)}\n`);

  if (items.length === 0) {
    console.log('No news items found.\n');
    return;
  }

  // Group by source
  const bySource = items.reduce((acc, item) => {
    if (!acc[item.source]) acc[item.source] = [];
    acc[item.source].push(item);
    return acc;
  }, {} as Record<string, NewsItem[]>);

  for (const [source, sourceItems] of Object.entries(bySource)) {
    console.log(`### ${source}\n`);
    for (const item of sourceItems.slice(0, 3)) {
      console.log(`- **${item.title}**`);
      if (item.summary) {
        console.log(`  ${item.summary}...`);
      }
      console.log(`  [${item.date}] ${item.link}\n`);
    }
  }
}

async function main(): Promise<void> {
  const topic = process.argv[2]?.toLowerCase();

  if (!topic) {
    console.log(`
FetchNews CLI - News aggregation tool

Usage:
  bun run FetchNews.ts <topic>

Topics:
  tech   - Tech, AI, programming news (HN, Ars Technica, TechCrunch)
  crypto - Cryptocurrency, Bitcoin, finance (CoinDesk, Bitcoin Magazine)
  world  - World news, geopolitics (Al Jazeera, Reuters, BBC)
  all    - All topics combined

Examples:
  bun run FetchNews.ts tech
  bun run FetchNews.ts crypto
  bun run FetchNews.ts all
`);
    process.exit(0);
  }

  if (topic === 'all') {
    for (const t of Object.keys(FEEDS)) {
      const items = await fetchTopic(t);
      formatOutput(t, items);
    }
  } else {
    const items = await fetchTopic(topic);
    formatOutput(topic, items);
  }

  console.log('\n✅ News scan complete\n');
}

main().catch(console.error);
