/**
 * IchimokuRadar — Ichimoku Kinko Hyo Calculation Engine
 *
 * Standard periods: Tenkan=9, Kijun=26, Senkou B=52, Displacement=26
 */

import type { OHLCVCandle, IchimokuValues, IchimokuSeries } from './types';

const TENKAN_PERIOD = 9;
const KIJUN_PERIOD = 26;
const SENKOU_B_PERIOD = 52;
const DISPLACEMENT = 26;

/** (highest high + lowest low) / 2 over the last `period` candles ending at `endIdx` */
function highLowMid(candles: OHLCVCandle[], endIdx: number, period: number): number | null {
  if (endIdx < period - 1) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    if (candles[i].high > high) high = candles[i].high;
    if (candles[i].low < low) low = candles[i].low;
  }
  return (high + low) / 2;
}

/**
 * Calculate full Ichimoku values for the latest candle.
 * Requires at least 52 candles.
 */
export function calculateIchimoku(candles: OHLCVCandle[]): IchimokuValues | null {
  const n = candles.length;
  if (n < SENKOU_B_PERIOD) return null;

  const idx = n - 1;
  const price = candles[idx].close;

  const tenkanSen = highLowMid(candles, idx, TENKAN_PERIOD)!;
  const kijunSen = highLowMid(candles, idx, KIJUN_PERIOD)!;

  // Current Senkou spans (these were calculated 26 periods ago, now displaced forward to today)
  const pastIdx = idx - DISPLACEMENT;
  let senkouSpanA: number;
  let senkouSpanB: number;
  if (pastIdx >= SENKOU_B_PERIOD - 1) {
    const pastTenkan = highLowMid(candles, pastIdx, TENKAN_PERIOD)!;
    const pastKijun = highLowMid(candles, pastIdx, KIJUN_PERIOD)!;
    senkouSpanA = (pastTenkan + pastKijun) / 2;
    senkouSpanB = highLowMid(candles, pastIdx, SENKOU_B_PERIOD)!;
  } else {
    // Fallback: use current values
    senkouSpanA = (tenkanSen + kijunSen) / 2;
    senkouSpanB = highLowMid(candles, idx, SENKOU_B_PERIOD)!;
  }

  // Future Senkou spans (today's values displaced 26 periods forward)
  const futureSenkouA = (tenkanSen + kijunSen) / 2;
  const futureSenkouB = highLowMid(candles, idx, SENKOU_B_PERIOD)!;

  // Chikou span = current close (to be plotted 26 periods back)
  const chikouSpan = price;

  const cloudTop = Math.max(senkouSpanA, senkouSpanB);
  const cloudBottom = Math.min(senkouSpanA, senkouSpanB);
  const cloudColor = senkouSpanA >= senkouSpanB ? 'green' as const : 'red' as const;
  const futureCloudColor = futureSenkouA >= futureSenkouB ? 'green' as const : 'red' as const;

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    futureSenkouA,
    futureSenkouB,
    chikouSpan,
    currentPrice: price,
    cloudTop,
    cloudBottom,
    cloudColor,
    futureCloudColor,
  };
}

/**
 * Calculate Ichimoku series arrays for charting.
 * Returns arrays aligned to the candle array indices.
 */
export function calculateIchimokuSeries(candles: OHLCVCandle[]): IchimokuSeries {
  const n = candles.length;
  const tenkan: (number | null)[] = new Array(n).fill(null);
  const kijun: (number | null)[] = new Array(n).fill(null);
  const senkouA: (number | null)[] = new Array(n + DISPLACEMENT).fill(null);
  const senkouB: (number | null)[] = new Array(n + DISPLACEMENT).fill(null);
  const chikou: (number | null)[] = new Array(n).fill(null);
  const closes: number[] = candles.map(c => c.close);
  const timestamps: number[] = candles.map(c => c.timestamp);

  for (let i = 0; i < n; i++) {
    // Tenkan
    if (i >= TENKAN_PERIOD - 1) {
      tenkan[i] = highLowMid(candles, i, TENKAN_PERIOD);
    }

    // Kijun
    if (i >= KIJUN_PERIOD - 1) {
      kijun[i] = highLowMid(candles, i, KIJUN_PERIOD);
    }

    // Senkou Span A & B (displaced forward by 26)
    if (i >= KIJUN_PERIOD - 1) {
      const t = highLowMid(candles, i, TENKAN_PERIOD)!;
      const k = highLowMid(candles, i, KIJUN_PERIOD)!;
      senkouA[i + DISPLACEMENT] = (t + k) / 2;
    }
    if (i >= SENKOU_B_PERIOD - 1) {
      senkouB[i + DISPLACEMENT] = highLowMid(candles, i, SENKOU_B_PERIOD);
    }

    // Chikou (displaced back by 26)
    if (i - DISPLACEMENT >= 0) {
      chikou[i - DISPLACEMENT] = candles[i].close;
    }
  }

  return { tenkan, kijun, senkouA: senkouA.slice(0, n), senkouB: senkouB.slice(0, n), chikou, closes, timestamps };
}

/** Detect Kumo twist: cloud color changed from previous to current candle */
export function detectKumoTwist(
  candles: OHLCVCandle[],
): 'bullish' | 'bearish' | null {
  const n = candles.length;
  if (n < SENKOU_B_PERIOD + 1) return null;

  const currA = (highLowMid(candles, n - 1, TENKAN_PERIOD)! + highLowMid(candles, n - 1, KIJUN_PERIOD)!) / 2;
  const currB = highLowMid(candles, n - 1, SENKOU_B_PERIOD)!;
  const prevA = (highLowMid(candles, n - 2, TENKAN_PERIOD)! + highLowMid(candles, n - 2, KIJUN_PERIOD)!) / 2;
  const prevB = highLowMid(candles, n - 2, SENKOU_B_PERIOD)!;

  const prevColor = prevA >= prevB ? 'green' : 'red';
  const currColor = currA >= currB ? 'green' : 'red';

  if (prevColor !== currColor) {
    return currColor === 'green' ? 'bullish' : 'bearish';
  }
  return null;
}

/** Detect TK cross: Tenkan crossed Kijun between previous and current candle */
export function detectTKCross(
  candles: OHLCVCandle[],
): 'bullish' | 'bearish' | null {
  const n = candles.length;
  if (n < KIJUN_PERIOD + 1) return null;

  const currTenkan = highLowMid(candles, n - 1, TENKAN_PERIOD)!;
  const currKijun = highLowMid(candles, n - 1, KIJUN_PERIOD)!;
  const prevTenkan = highLowMid(candles, n - 2, TENKAN_PERIOD)!;
  const prevKijun = highLowMid(candles, n - 2, KIJUN_PERIOD)!;

  const prevDiff = prevTenkan - prevKijun;
  const currDiff = currTenkan - currKijun;

  if (prevDiff <= 0 && currDiff > 0) return 'bullish';
  if (prevDiff >= 0 && currDiff < 0) return 'bearish';
  return null;
}
