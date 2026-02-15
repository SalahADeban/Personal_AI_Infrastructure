/**
 * IchimokuRadar Server — Port 5181
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { refreshAllSignals } from './refresh';
import { loadConfig, loadSignals, loadOHLCV, loadSignalHistory, getOHLCVCacheInfo } from './storage';
import type { Timeframe } from './types';
import { DEFAULT_WATCHLIST } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 5181;
const REFRESH_CHECK_INTERVAL = 5 * 60 * 1000; // check every 5 min

let lastRefreshDaily: Date | null = null;
let lastRefreshMonthly: Date | null = null;
let isRefreshing = false;

// Initial refresh
(async () => {
  console.log('[Server] Initial signal refresh...');
  try {
    await refreshAllSignals();
    lastRefreshDaily = new Date();
    lastRefreshMonthly = new Date();
  } catch (err) {
    console.error('[Server] Initial refresh failed:', err);
  }
})();

// Auto-refresh timer
setInterval(async () => {
  if (isRefreshing) return;
  const config = loadConfig();
  const now = Date.now();

  if (lastRefreshDaily && (now - lastRefreshDaily.getTime()) > config.refreshIntervals.daily) {
    isRefreshing = true;
    try {
      await refreshAllSignals();
      lastRefreshDaily = new Date();
      lastRefreshMonthly = new Date();
    } finally {
      isRefreshing = false;
    }
  }
}, REFRESH_CHECK_INTERVAL);

// MIME types
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function sendJSON(res: ServerResponse, data: object, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function parseURL(url: string): { path: string; query: Record<string, string> } {
  const [path, qs] = url.split('?');
  const query: Record<string, string> = {};
  if (qs) {
    for (const pair of qs.split('&')) {
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return { path, query };
}

function handleAPI(path: string, res: ServerResponse): boolean {
  // GET /api/signals
  if (path === '/api/signals') {
    const signals = loadSignals();
    const config = loadConfig();
    sendJSON(res, {
      signals,
      lastRefresh: lastRefreshDaily?.toISOString() || null,
      config: { watchlist: config.watchlist, timeframes: config.timeframes },
    });
    return true;
  }

  // GET /api/signals/:asset/:timeframe
  const sigMatch = path.match(/^\/api\/signals\/([A-Za-z]+)\/(1[DM])$/);
  if (sigMatch) {
    const asset = sigMatch[1].toUpperCase();
    const timeframe = sigMatch[2] as Timeframe;
    const signals = loadSignals();
    const signal = signals.find(s => s.asset === asset && s.timeframe === timeframe);

    if (!signal) {
      sendJSON(res, { error: 'Signal not found' }, 404);
      return true;
    }

    const ohlcvData = loadOHLCV(asset, timeframe);
    const history = loadSignalHistory(asset, timeframe);
    sendJSON(res, { signal, ohlcv: ohlcvData?.candles?.slice(-80) || [], history });
    return true;
  }

  // POST /api/refresh
  if (path === '/api/refresh') {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshAllSignals()
        .then(() => {
          lastRefreshDaily = new Date();
          lastRefreshMonthly = new Date();
        })
        .finally(() => { isRefreshing = false; });
    }
    sendJSON(res, { status: 'refreshing' });
    return true;
  }

  // GET /api/health
  if (path === '/api/health') {
    const signals = loadSignals();
    const cacheStatus = [];
    for (const asset of DEFAULT_WATCHLIST) {
      for (const tf of ['1D', '1M'] as Timeframe[]) {
        cacheStatus.push({ asset: asset.symbol, timeframe: tf, ...getOHLCVCacheInfo(asset.symbol, tf) });
      }
    }
    sendJSON(res, {
      status: 'ok',
      uptime: process.uptime(),
      lastRefresh: { daily: lastRefreshDaily?.toISOString(), monthly: lastRefreshMonthly?.toISOString() },
      signalCount: signals.length,
      isRefreshing,
      cacheStatus,
    });
    return true;
  }

  // GET /api/config
  if (path === '/api/config') {
    sendJSON(res, loadConfig());
    return true;
  }

  return false;
}

function handleStatic(path: string, res: ServerResponse): boolean {
  const publicDir = join(__dirname, '..', 'public');
  const filePath = join(publicDir, path === '/' ? 'index.html' : path);
  if (!existsSync(filePath)) return false;

  try {
    const content = readFileSync(filePath);
    const ext = '.' + (filePath.split('.').pop() || 'html');
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const { path } = parseURL(req.url || '/');

  if (path.startsWith('/api/')) {
    if (!handleAPI(path, res)) {
      sendJSON(res, { error: 'Not found' }, 404);
    }
    return;
  }

  if (!handleStatic(path, res)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║            📊 IchimokuRadar v1.0                         ║
║         Ichimoku Signal Intelligence                     ║
╠══════════════════════════════════════════════════════════╣
║  Dashboard:  http://localhost:${PORT}                       ║
║  API:        http://localhost:${PORT}/api/signals            ║
║  Refresh:    Daily: 4h | Monthly: 24h                   ║
╚══════════════════════════════════════════════════════════╝
`);
});

export default server;
