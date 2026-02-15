/**
 * TrendRadar v2 Server
 * Topic-based trend intelligence dashboard
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { refreshTopics, getTopics, getTopicsByCategory, getTopicDetail } from './aggregator';
import { getStorageStats, getTopicTimeline } from './storage';
import { CATEGORIES } from './types';
import type { TopicCategory } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 5180;
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

let lastRefresh: Date | null = null;
let isRefreshing = false;

// Initial refresh
(async () => {
  console.log('[Server] Initial data refresh...');
  await refreshTopics();
  lastRefresh = new Date();
})();

// Auto-refresh
setInterval(async () => {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    await refreshTopics();
    lastRefresh = new Date();
  } finally {
    isRefreshing = false;
  }
}, REFRESH_INTERVAL);

// MIME types
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Send JSON response
function sendJSON(res: ServerResponse, data: object, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// Parse URL and query params
function parseURL(url: string): { path: string; query: Record<string, string> } {
  const [path, queryString] = url.split('?');
  const query: Record<string, string> = {};

  if (queryString) {
    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      query[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }

  return { path, query };
}

// Handle API routes
function handleAPI(path: string, query: Record<string, string>, res: ServerResponse): boolean {
  // GET /api/topics - All topics with optional category filter
  if (path === '/api/topics') {
    const category = query.category as TopicCategory | undefined;
    const topics = category ? getTopicsByCategory(category) : getTopics();

    sendJSON(res, {
      topics,
      count: topics.length,
      lastRefresh: lastRefresh?.toISOString(),
      categories: CATEGORIES,
    });
    return true;
  }

  // GET /api/history/:topic - Topic timeline data
  if (path.startsWith('/api/history/')) {
    const topicName = decodeURIComponent(path.replace('/api/history/', ''));
    const timeline = getTopicTimeline(topicName);
    sendJSON(res, { topic: topicName, timeline });
    return true;
  }

  // GET /api/topics/:id - Single topic detail
  if (path.startsWith('/api/topics/')) {
    const id = path.replace('/api/topics/', '');
    const { topic, mentions, timeline } = getTopicDetail(id);

    if (!topic) {
      sendJSON(res, { error: 'Topic not found' }, 404);
      return true;
    }

    sendJSON(res, { topic, mentions, timeline });
    return true;
  }

  // GET /api/categories - Category list
  if (path === '/api/categories') {
    sendJSON(res, { categories: CATEGORIES });
    return true;
  }

  // POST /api/refresh - Manual refresh
  if (path === '/api/refresh') {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshTopics()
        .then(() => {
          lastRefresh = new Date();
        })
        .finally(() => {
          isRefreshing = false;
        });
    }
    sendJSON(res, { status: 'refreshing' });
    return true;
  }

  // GET /api/health - Health check
  if (path === '/api/health') {
    const stats = getStorageStats();
    const topics = getTopics();

    sendJSON(res, {
      status: 'ok',
      uptime: process.uptime(),
      lastRefresh: lastRefresh?.toISOString(),
      isRefreshing,
      topicCount: topics.length,
      mentionCount: stats.mentionCount,
      oldestMention: stats.oldestMention,
      newestMention: stats.newestMention,
    });
    return true;
  }

  return false;
}

// Handle static files
function handleStatic(path: string, res: ServerResponse): boolean {
  const publicDir = join(__dirname, '..', 'public');
  const filePath = join(publicDir, path === '/' ? 'index.html' : path);

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath);
    const ext = '.' + (filePath.split('.').pop() || 'html');
    const contentType = mimeTypes[ext] || 'text/plain';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return true;
  } catch (error) {
    console.error('Error serving static file:', error);
    return false;
  }
}

// Create server
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const { path, query } = parseURL(req.url || '/');

  // Handle API routes
  if (path.startsWith('/api/')) {
    if (!handleAPI(path, query, res)) {
      sendJSON(res, { error: 'Not found' }, 404);
    }
    return;
  }

  // Handle static files
  if (!handleStatic(path, res)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║              🔮 TrendRadar v2                            ║
║          Trend Intelligence Dashboard                    ║
╠══════════════════════════════════════════════════════════╣
║  Dashboard:  http://localhost:${PORT}                       ║
║  API:        http://localhost:${PORT}/api/topics            ║
║  Refresh:    Every 5 minutes                             ║
╚══════════════════════════════════════════════════════════╝
`);
});

export default server;
