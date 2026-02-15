/**
 * Yahoo Finance OHLCV Fetcher via public chart API
 *
 * Uses Yahoo's v8 chart endpoint directly instead of yahoo-finance2
 * to avoid deprecated method issues.
 */

import type { OHLCVCandle } from '../types';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

export async function fetchStockOHLCV(
  yahooSymbol: string,
  timeframe: '1D' | '1M',
): Promise<OHLCVCandle[]> {
  try {
    if (timeframe === '1D') {
      return await fetchDaily(yahooSymbol);
    }
    return await fetchMonthly(yahooSymbol);
  } catch (err) {
    console.error(`[Yahoo] Error fetching ${yahooSymbol}:`, err);
    return [];
  }
}

async function fetchDaily(symbol: string): Promise<OHLCVCandle[]> {
  // 1y of daily candles gives ~252 trading days
  const url = `${BASE}/${symbol}?interval=1d&range=1y`;
  return await fetchAndParse(url, symbol, '1D');
}

async function fetchMonthly(symbol: string): Promise<OHLCVCandle[]> {
  // 10y of monthly candles gives ~120 candles
  const url = `${BASE}/${symbol}?interval=1mo&range=10y`;
  return await fetchAndParse(url, symbol, '1M');
}

async function fetchAndParse(
  url: string,
  symbol: string,
  timeframe: string,
): Promise<OHLCVCandle[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error(`[Yahoo] HTTP ${res.status} for ${symbol} ${timeframe}`);
    return [];
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) {
    console.error(`[Yahoo] No chart result for ${symbol}`);
    return [];
  }

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) {
    console.error(`[Yahoo] No quote data for ${symbol}`);
    return [];
  }

  const opens: (number | null)[] = quote.open || [];
  const highs: (number | null)[] = quote.high || [];
  const lows: (number | null)[] = quote.low || [];
  const closes: (number | null)[] = quote.close || [];
  const volumes: (number | null)[] = quote.volume || [];

  const candles: OHLCVCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (o == null || h == null || l == null || c == null) continue;

    candles.push({
      timestamp: timestamps[i] * 1000, // Yahoo returns seconds, we use ms
      open: o,
      high: h,
      low: l,
      close: c,
      volume: volumes[i] || 0,
    });
  }

  console.log(`[Yahoo] Fetched ${candles.length} ${timeframe} candles for ${symbol}`);
  return candles;
}
