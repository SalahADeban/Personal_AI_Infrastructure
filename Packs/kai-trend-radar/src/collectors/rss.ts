/**
 * RSS Feed Utilities & Tech News Collector
 */

import type { Mention, CollectorResult } from '../types';
import { extractEntityNames } from '../extractor';
import { analyzeSentiment } from '../sentiment';

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

// Clean HTML entities and tags from content
function cleanContent(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse RSS/Atom feed using regex
function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];

  const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>|<entry[^>]*>[\s\S]*?<\/entry>/gi) || [];

  for (const item of itemMatches) {
    const rawTitle = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
    const link = item.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim()
                || item.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '';
    const pubDate = item.match(/<pubDate[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i)?.[1]?.trim()
                   || item.match(/<published[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/published>/i)?.[1]?.trim();
    const rawDescription = item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim()
                       || item.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i)?.[1]?.trim();

    if (rawTitle || link || rawDescription) {
      items.push({
        title: cleanContent(rawTitle),
        link,
        pubDate,
        description: rawDescription ? cleanContent(rawDescription).slice(0, 200) : undefined,
      });
    }
  }

  return items;
}

// Fetch RSS feed
export async function fetchRSS(url: string): Promise<RSSItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TrendRadar/2.0' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml);
  } catch (error) {
    console.error(`[RSS] Error fetching ${url}:`, error);
    return [];
  }
}

// Tech news feeds
const TECH_FEEDS = [
  // Major Tech News
  { url: 'https://techcrunch.com/feed/', name: 'TechCrunch', icon: '💚', source: 'techcrunch' },
  { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', name: 'Ars Technica', icon: '🟤', source: 'arstechnica' },
  { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge', icon: '🟣', source: 'verge' },
  { url: 'https://www.wired.com/feed/rss', name: 'Wired', icon: '⚪', source: 'wired' },
  { url: 'https://www.engadget.com/rss.xml', name: 'Engadget', icon: '🔵', source: 'engadget' },
  { url: 'https://www.zdnet.com/news/rss.xml', name: 'ZDNet', icon: '🔴', source: 'zdnet' },
  { url: 'https://www.cnet.com/rss/news/', name: 'CNET', icon: '🟡', source: 'cnet' },

  // AI Focused
  { url: 'https://www.artificialintelligence-news.com/feed/', name: 'AI News', icon: '🤖', source: 'ainews' },
  { url: 'https://www.marktechpost.com/feed/', name: 'MarkTechPost', icon: '📊', source: 'marktechpost' },
  { url: 'https://venturebeat.com/category/ai/feed/', name: 'VentureBeat AI', icon: '🚀', source: 'venturebeat' },

  // Business/Finance Tech
  { url: 'https://www.reuters.com/technology/rss', name: 'Reuters Tech', icon: '📰', source: 'reuters' },
  { url: 'https://feeds.bloomberg.com/technology/news.rss', name: 'Bloomberg Tech', icon: '💼', source: 'bloomberg' },

  // Crypto
  { url: 'https://cointelegraph.com/rss', name: 'CoinTelegraph', icon: '₿', source: 'cointelegraph' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk', icon: '🪙', source: 'coindesk' },
];

export async function collectTechNews(): Promise<CollectorResult> {
  const mentions: Mention[] = [];

  try {
    console.log('[TechNews] Fetching from feeds...');

    for (const feed of TECH_FEEDS) {
      try {
        const items = await fetchRSS(feed.url);

        for (let i = 0; i < Math.min(items.length, 15); i++) {
          const item = items[i];
          if (!item.title) continue;

          const entities = extractEntityNames(item.title);

          mentions.push({
            id: `${feed.source}-${i}-${Date.now()}`,
            source: feed.name,
            sourceIcon: feed.icon,
            text: item.title,
            url: item.link || '',
            timestamp: item.pubDate
              ? new Date(item.pubDate).toISOString()
              : new Date().toISOString(),
            entities,
            sentiment: analyzeSentiment(item.title),
          });
        }
      } catch (error) {
        console.error(`[TechNews] Error fetching ${feed.name}:`, error);
      }
    }

    console.log(`[TechNews] Collected ${mentions.length} mentions`);

    return {
      source: 'technews',
      mentions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[TechNews] Error:', error);
    return {
      source: 'technews',
      mentions: [],
      timestamp: new Date().toISOString(),
      error: String(error),
    };
  }
}
