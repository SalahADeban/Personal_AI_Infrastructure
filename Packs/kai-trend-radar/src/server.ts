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
import type { TopicCategory, EnhancedTopic } from './types';

// QuantCore Integration
import { analyzeTopicQuant } from './quantcore-integration';

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

  // ============ QUANTCORE ENDPOINTS ============

  // GET /api/quant/anomalies - Topics with detected anomalies
  if (path === '/api/quant/anomalies') {
    const topics = getTopics() as EnhancedTopic[];
    const anomalies = topics
      .filter(t => t.quantAnalysis?.anomaly.isAnomaly)
      .map(t => ({
        topic: t.name,
        normalizedName: t.normalizedName,
        anomaly: t.quantAnalysis?.anomaly,
        velocity: t.velocityLabel,
        score: t.score,
      }));

    sendJSON(res, {
      anomalies,
      count: anomalies.length,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // GET /api/quant/viral - Topics with high viral probability
  if (path === '/api/quant/viral') {
    const threshold = parseFloat(query.threshold || '0.3');
    const topics = getTopics() as EnhancedTopic[];
    const viral = topics
      .filter(t => (t.quantAnalysis?.viralPrediction.probability || 0) >= threshold)
      .sort((a, b) =>
        (b.quantAnalysis?.viralPrediction.probability || 0) -
        (a.quantAnalysis?.viralPrediction.probability || 0)
      )
      .map(t => ({
        topic: t.name,
        normalizedName: t.normalizedName,
        viralPrediction: t.quantAnalysis?.viralPrediction,
        regime: t.quantAnalysis?.regime,
        score: t.score,
        mentionCount: t.mentionCount,
      }));

    sendJSON(res, {
      viral,
      count: viral.length,
      threshold,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // GET /api/quant/phases - Topics grouped by lifecycle phase
  if (path === '/api/quant/phases') {
    const topics = getTopics() as EnhancedTopic[];
    const phases: Record<string, typeof topics> = {
      discovery: [],
      growth: [],
      peak: [],
      saturation: [],
      decline: [],
    };

    for (const topic of topics) {
      const phase = topic.quantAnalysis?.regime.phase || 'growth';
      phases[phase].push(topic);
    }

    const summary = Object.entries(phases).map(([phase, list]) => ({
      phase,
      count: list.length,
      topics: list.slice(0, 10).map(t => ({
        name: t.name,
        score: t.score,
        momentum: t.quantAnalysis?.regime.momentum,
        phaseConfidence: t.quantAnalysis?.regime.phaseConfidence,
      })),
    }));

    sendJSON(res, {
      phases: summary,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // GET /api/quant/forecast/:topic - Forecast for specific topic
  const forecastMatch = path.match(/^\/api\/quant\/forecast\/(.+)$/);
  if (forecastMatch) {
    const topicName = decodeURIComponent(forecastMatch[1]);
    const { topic, timeline } = getTopicDetail(topicName);

    if (!topic) {
      sendJSON(res, { error: 'Topic not found' }, 404);
      return true;
    }

    // Run fresh QuantCore analysis
    const quantAnalysis = analyzeTopicQuant(topic, timeline);

    sendJSON(res, {
      topic: topic.name,
      normalizedName: topic.normalizedName,
      currentMentions: topic.mentionCount,
      forecast: quantAnalysis.forecast,
      regime: quantAnalysis.regime,
      viralPrediction: quantAnalysis.viralPrediction,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // GET /api/quant/analyze/:topic - Full QuantCore analysis for topic
  const analyzeMatch = path.match(/^\/api\/quant\/analyze\/(.+)$/);
  if (analyzeMatch) {
    const topicName = decodeURIComponent(analyzeMatch[1]);
    const { topic, timeline } = getTopicDetail(topicName);

    if (!topic) {
      sendJSON(res, { error: 'Topic not found' }, 404);
      return true;
    }

    // Run fresh QuantCore analysis
    const quantAnalysis = analyzeTopicQuant(topic, timeline);

    sendJSON(res, {
      topic: {
        name: topic.name,
        normalizedName: topic.normalizedName,
        score: topic.score,
        velocity: topic.velocityLabel,
        velocityPercent: topic.velocityPercent,
        mentionCount: topic.mentionCount,
        sourceDiversity: topic.sourceDiversity,
        isEarlySignal: topic.isEarlySignal,
        isCrossPlatform: topic.isCrossPlatform,
        sentimentLabel: topic.sentimentLabel,
      },
      quantAnalysis,
      timeline: timeline.slice(-48), // Last 48 hours
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // GET /api/quant/summary - Summary of all QuantCore insights
  if (path === '/api/quant/summary') {
    const topics = getTopics() as EnhancedTopic[];

    const anomalyCount = topics.filter(t => t.quantAnalysis?.anomaly.isAnomaly).length;
    const highViralCount = topics.filter(t => (t.quantAnalysis?.viralPrediction.probability || 0) > 0.5).length;

    const phaseBreakdown = {
      discovery: 0,
      growth: 0,
      peak: 0,
      saturation: 0,
      decline: 0,
    };

    for (const topic of topics) {
      const phase = topic.quantAnalysis?.regime.phase || 'growth';
      phaseBreakdown[phase]++;
    }

    // Top anomalies
    const topAnomalies = topics
      .filter(t => t.quantAnalysis?.anomaly.isAnomaly)
      .sort((a, b) =>
        (b.quantAnalysis?.anomaly.anomalyScore || 0) -
        (a.quantAnalysis?.anomaly.anomalyScore || 0)
      )
      .slice(0, 5)
      .map(t => ({
        name: t.name,
        anomalyScore: t.quantAnalysis?.anomaly.anomalyScore,
        anomalyType: t.quantAnalysis?.anomaly.anomalyType,
      }));

    // Top viral candidates
    const topViral = topics
      .filter(t => (t.quantAnalysis?.viralPrediction.probability || 0) > 0.3)
      .sort((a, b) =>
        (b.quantAnalysis?.viralPrediction.probability || 0) -
        (a.quantAnalysis?.viralPrediction.probability || 0)
      )
      .slice(0, 5)
      .map(t => ({
        name: t.name,
        viralProbability: t.quantAnalysis?.viralPrediction.probability,
        spreadPattern: t.quantAnalysis?.viralPrediction.spreadPattern,
      }));

    sendJSON(res, {
      totalTopics: topics.length,
      anomalyCount,
      highViralCount,
      phaseBreakdown,
      topAnomalies,
      topViral,
      timestamp: new Date().toISOString(),
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
║              🔮 TrendRadar v2 + QuantCore                ║
║          Trend Intelligence with Quant Analysis          ║
╠══════════════════════════════════════════════════════════╣
║  Dashboard:  http://localhost:${PORT}                       ║
║  Topics:     http://localhost:${PORT}/api/topics            ║
║  QuantCore:  http://localhost:${PORT}/api/quant/summary     ║
║  Anomalies:  http://localhost:${PORT}/api/quant/anomalies   ║
║  Viral:      http://localhost:${PORT}/api/quant/viral       ║
║  Refresh:    Every 30 minutes                            ║
╚══════════════════════════════════════════════════════════╝
`);
});

export default server;
