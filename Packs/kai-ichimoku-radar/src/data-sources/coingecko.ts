/**
 * Crypto OHLCV Fetcher
 *
 * Daily: CoinGecko /market_chart (free, 365 days max)
 * Monthly: CryptoCompare /histoday (free, 2000 days) → aggregate to monthly
 *
 * CoinGecko free tier limits historical data to 365 days, which is enough
 * for daily Ichimoku (52+ candles) but not monthly (need 52 months = ~4.3 years).
 * CryptoCompare provides 2000 daily candles for free, giving ~66 monthly candles.
 */

import type { OHLCVCandle } from '../types';

const CG_BASE = 'https://api.coingecko.com/api/v3';
const CC_BASE = 'https://min-api.cryptocompare.com/data/v2';

export async function fetchCryptoOHLCV(
  coingeckoId: string,
  timeframe: '1D' | '1M',
  symbol?: string,
): Promise<OHLCVCandle[]> {
  try {
    if (timeframe === '1D') {
      return await fetchDailyCandles(coingeckoId);
    }
    // Monthly: use CryptoCompare (needs symbol like BTC, ETH)
    const sym = symbol || coingeckoIdToSymbol(coingeckoId);
    return await fetchMonthlyCandles(sym);
  } catch (err) {
    console.error(`[Crypto] Error fetching ${coingeckoId}:`, err);
    return [];
  }
}

/** Map CoinGecko IDs to CryptoCompare symbols */
function coingeckoIdToSymbol(id: string): string {
  const map: Record<string, string> = {
    bitcoin: 'BTC',
    ethereum: 'ETH',
    solana: 'SOL',
    'jupiter-exchange-solana': 'JUP',
  };
  return map[id] || id.toUpperCase();
}

/**
 * Daily candles via CoinGecko /market_chart (365 days).
 */
async function fetchDailyCandles(coingeckoId: string): Promise<OHLCVCandle[]> {
  const url = `${CG_BASE}/coins/${coingeckoId}/market_chart?vs_currency=usd&days=365&interval=daily`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error(`[CoinGecko] HTTP ${res.status} for ${coingeckoId} daily`);
    return [];
  }

  const data = await res.json();
  const prices: number[][] = data.prices;
  if (!Array.isArray(prices) || prices.length < 2) return [];

  const candles: OHLCVCandle[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prevPrice = prices[i - 1][1];
    const currPrice = prices[i][1];
    const high = Math.max(prevPrice, currPrice) * 1.005;
    const low = Math.min(prevPrice, currPrice) * 0.995;

    candles.push({
      timestamp: prices[i][0],
      open: prevPrice,
      high,
      low,
      close: currPrice,
      volume: 0,
    });
  }

  console.log(`[CoinGecko] Fetched ${candles.length} daily candles for ${coingeckoId}`);
  return candles;
}

/**
 * Monthly candles via CryptoCompare /histoday (2000 days) → aggregate to monthly.
 * CryptoCompare free tier provides 2000 daily candles with real OHLCV data.
 */
async function fetchMonthlyCandles(symbol: string): Promise<OHLCVCandle[]> {
  const url = `${CC_BASE}/histoday?fsym=${symbol}&tsym=USD&limit=2000`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    console.error(`[CryptoCompare] HTTP ${res.status} for ${symbol} monthly`);
    return [];
  }

  const data = await res.json();
  if (data.Response === 'Error') {
    console.error(`[CryptoCompare] API error for ${symbol}:`, data.Message);
    return [];
  }

  const dailyData: any[] = data.Data?.Data || [];
  if (dailyData.length < 2) return [];

  // Build daily candles from CryptoCompare OHLCV
  const daily: OHLCVCandle[] = dailyData
    .filter((d: any) => d.open > 0 && d.close > 0)
    .map((d: any) => ({
      timestamp: d.time * 1000, // CryptoCompare uses seconds
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volumefrom || 0,
    }));

  // Aggregate to monthly
  const monthMap = new Map<string, OHLCVCandle[]>();
  for (const c of daily) {
    const d = new Date(c.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(c);
  }

  const monthly: OHLCVCandle[] = [];
  for (const [, group] of monthMap) {
    group.sort((a, b) => a.timestamp - b.timestamp);
    monthly.push({
      timestamp: group[0].timestamp,
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }

  const sorted = monthly.sort((a, b) => a.timestamp - b.timestamp);
  console.log(`[CryptoCompare] Fetched ${sorted.length} monthly candles for ${symbol}`);
  return sorted;
}
