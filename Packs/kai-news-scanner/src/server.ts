/**
 * NewsScanner Server — Port 5182
 * RSS news aggregation API
 */

import Parser from 'rss-parser';

const PORT = 5182;

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsScanner/1.0)' },
});

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
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'Reuters', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best' },
  ],
};

interface NewsItem {
  title: string;
  link: string;
  source: string;
  topic: string;
  date: string;
  summary: string;
}

// Cache
let newsCache: { items: NewsItem[]; timestamp: number } = { items: [], timestamp: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchFeed(feed: { name: string; url: string }, topic: string): Promise<NewsItem[]> {
  try {
    const result = await parser.parseURL(feed.url);
    return (result.items || []).slice(0, 5).map((item) => ({
      title: item.title || 'No title',
      link: item.link || '',
      source: feed.name,
      topic,
      date: item.pubDate || new Date().toISOString(),
      summary: (item.contentSnippet || item.content || '').slice(0, 200).replace(/<[^>]*>/g, ''),
    }));
  } catch (error) {
    console.error(`[news] Failed: ${feed.name} - ${(error as Error).message}`);
    return [];
  }
}

async function fetchAllNews(): Promise<NewsItem[]> {
  // Check cache
  if (Date.now() - newsCache.timestamp < CACHE_TTL && newsCache.items.length > 0) {
    console.log('[news] Returning cached news');
    return newsCache.items;
  }

  console.log('[news] Fetching fresh news...');
  const items: NewsItem[] = [];

  for (const [topic, feeds] of Object.entries(FEEDS)) {
    for (const feed of feeds) {
      const feedItems = await fetchFeed(feed, topic);
      items.push(...feedItems);
    }
  }

  // Sort by date
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Update cache
  newsCache = { items, timestamp: Date.now() };
  console.log(`[news] Cached ${items.length} items`);

  return items;
}

async function fetchByTopic(topic: string): Promise<NewsItem[]> {
  const feeds = FEEDS[topic];
  if (!feeds) return [];

  const items: NewsItem[] = [];
  for (const feed of feeds) {
    const feedItems = await fetchFeed(feed, topic);
    items.push(...feedItems);
  }

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };

    // Health check
    if (path === '/api/health') {
      return Response.json({
        status: 'ok',
        topics: Object.keys(FEEDS),
        cacheAge: Date.now() - newsCache.timestamp,
        cachedItems: newsCache.items.length,
      }, { headers });
    }

    // Get all news
    if (path === '/api/news') {
      const items = await fetchAllNews();
      const topic = url.searchParams.get('topic');
      const filtered = topic ? items.filter(i => i.topic === topic) : items;
      return Response.json({
        items: filtered,
        count: filtered.length,
        topics: Object.keys(FEEDS),
        timestamp: new Date().toISOString(),
      }, { headers });
    }

    // Get news by topic
    const topicMatch = path.match(/^\/api\/news\/(\w+)$/);
    if (topicMatch) {
      const topic = topicMatch[1].toLowerCase();
      if (!FEEDS[topic]) {
        return Response.json({ error: 'Unknown topic', available: Object.keys(FEEDS) }, { status: 404, headers });
      }
      const items = await fetchByTopic(topic);
      return Response.json({ topic, items, count: items.length }, { headers });
    }

    // Force refresh
    if (path === '/api/refresh' && req.method === 'POST') {
      newsCache = { items: [], timestamp: 0 };
      const items = await fetchAllNews();
      return Response.json({ refreshed: true, count: items.length }, { headers });
    }

    // Serve dashboard
    if (path === '/' || path === '/index.html') {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NewsScanner</title>
  <style>
    :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --muted: #8b949e; --accent: #58a6ff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 20px; max-width: 900px; margin: 0 auto; }
    h1 { margin-bottom: 20px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    .tab { padding: 8px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; color: var(--muted); }
    .tab:hover, .tab.active { border-color: var(--accent); color: var(--accent); }
    .news-item { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .news-item h3 { font-size: 16px; margin-bottom: 8px; }
    .news-item h3 a { color: var(--text); text-decoration: none; }
    .news-item h3 a:hover { color: var(--accent); }
    .meta { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .summary { font-size: 14px; color: var(--muted); }
    .topic-tag { display: inline-block; padding: 2px 8px; background: var(--border); border-radius: 4px; font-size: 11px; margin-right: 8px; }
    .loading { text-align: center; padding: 40px; color: var(--muted); }
  </style>
</head>
<body>
  <h1>📰 NewsScanner</h1>
  <div class="tabs">
    <div class="tab active" data-topic="all">All</div>
    <div class="tab" data-topic="tech">Tech</div>
    <div class="tab" data-topic="crypto">Crypto</div>
    <div class="tab" data-topic="world">World</div>
  </div>
  <div id="news"><div class="loading">Loading news...</div></div>
  <script>
    let currentTopic = 'all';
    async function loadNews(topic) {
      currentTopic = topic;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.topic === topic));
      document.getElementById('news').innerHTML = '<div class="loading">Loading...</div>';
      const url = topic === 'all' ? '/api/news' : '/api/news/' + topic;
      const res = await fetch(url);
      const data = await res.json();
      document.getElementById('news').innerHTML = data.items.map(item => \`
        <div class="news-item">
          <h3><a href="\${item.link}" target="_blank">\${item.title}</a></h3>
          <div class="meta"><span class="topic-tag">\${item.topic}</span>\${item.source} · \${new Date(item.date).toLocaleDateString()}</div>
          <div class="summary">\${item.summary}</div>
        </div>
      \`).join('') || '<div class="loading">No news found</div>';
    }
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => loadNews(t.dataset.topic)));
    loadNews('all');
  </script>
</body>
</html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers });
  },
});

console.log("[NewsScanner] Server running on http://localhost:" + PORT);
