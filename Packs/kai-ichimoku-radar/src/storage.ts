/**
 * IchimokuRadar Storage — JSON file persistence
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  Config,
  SignalState,
  OHLCVData,
  SignalSnapshot,
  SignalHistoryPoint,
  Timeframe,
} from './types';
import { DEFAULT_WATCHLIST } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const OHLCV_DIR = join(DATA_DIR, 'ohlcv');
const HISTORY_DIR = join(DATA_DIR, 'history');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(OHLCV_DIR)) mkdirSync(OHLCV_DIR, { recursive: true });
if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });

const CONFIG_FILE = join(DATA_DIR, 'config.json');
const SIGNALS_FILE = join(DATA_DIR, 'signals.json');

// ============ CONFIG ============

const DEFAULT_CONFIG: Config = {
  watchlist: DEFAULT_WATCHLIST,
  timeframes: ['1D', '1M'],
  webhookUrl: '',
  refreshIntervals: {
    daily: 4 * 60 * 60 * 1000,
    monthly: 24 * 60 * 60 * 1000,
  },
  signalThresholds: {
    crossingZero: true,
    magnitude: 50,
  },
};

export function loadConfig(): Config {
  try {
    if (!existsSync(CONFIG_FILE)) {
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ============ SIGNALS ============

export function loadSignals(): SignalState[] {
  try {
    if (!existsSync(SIGNALS_FILE)) return [];
    return JSON.parse(readFileSync(SIGNALS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveSignals(signals: SignalState[]): void {
  writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2));
  console.log(`[Storage] Saved ${signals.length} signals`);
}

// ============ OHLCV ============

export function loadOHLCV(asset: string, timeframe: string): OHLCVData | null {
  const file = join(OHLCV_DIR, `${asset}_${timeframe}.json`);
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveOHLCV(data: OHLCVData): void {
  const file = join(OHLCV_DIR, `${data.asset}_${data.timeframe}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`[Storage] Saved ${data.candles.length} candles for ${data.asset} ${data.timeframe}`);
}

export function getOHLCVCacheInfo(asset: string, timeframe: string): { lastFetch: string | null; candleCount: number } {
  const data = loadOHLCV(asset, timeframe);
  if (!data) return { lastFetch: null, candleCount: 0 };
  return { lastFetch: data.lastUpdated, candleCount: data.candles.length };
}

// ============ SIGNAL HISTORY ============

export function saveSignalSnapshot(signals: SignalState[]): void {
  const snapshot: SignalSnapshot = {
    timestamp: new Date().toISOString(),
    signals: signals.map(s => ({
      asset: s.asset,
      timeframe: s.timeframe as Timeframe,
      score: s.score,
      label: s.label,
      price: s.price,
    })),
  };

  const dateStr = new Date().toISOString().slice(0, 13).replace(/[-:T]/g, '');
  const file = join(HISTORY_DIR, `snapshot_${dateStr}.json`);
  writeFileSync(file, JSON.stringify(snapshot, null, 2));
}

export function loadSignalHistory(asset: string, timeframe: string): SignalHistoryPoint[] {
  const points: SignalHistoryPoint[] = [];

  try {
    const files = readdirSync(HISTORY_DIR)
      .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
      .sort();

    for (const file of files) {
      const data: SignalSnapshot = JSON.parse(readFileSync(join(HISTORY_DIR, file), 'utf-8'));
      const sig = data.signals.find(s => s.asset === asset && s.timeframe === timeframe);
      if (sig) {
        points.push({
          timestamp: data.timestamp,
          score: sig.score,
          price: sig.price,
          label: sig.label,
        });
      }
    }
  } catch {
    // return whatever we have
  }

  return points;
}
