/**
 * IchimokuRadar — Signal Scoring Engine
 *
 * Composite score: -100 to +100
 *   Kumo Twist    ±30
 *   TK Cross      ±25
 *   Price vs Cloud ±20
 *   Chikou Span   ±15
 *   Cloud Thickness ±10
 */

import type {
  OHLCVCandle,
  IchimokuValues,
  SignalComponents,
  SignalTrigger,
  SignalLabel,
  SignalState,
  EdgeToEdgeTrade,
  Config,
} from './types';
import { calculateIchimoku, detectKumoTwist, detectTKCross } from './ichimoku';

// ============ COMPONENT SCORING ============

function scoreKumoTwist(ich: IchimokuValues, candles: OHLCVCandle[]): { score: number; trigger: SignalTrigger | null } {
  const twist = detectKumoTwist(candles);
  if (twist) {
    return {
      score: twist === 'bullish' ? 30 : -30,
      trigger: { type: 'kumo_twist', direction: twist, description: `Kumo twist ${twist} — future cloud turned ${twist === 'bullish' ? 'green' : 'red'}` },
    };
  }
  // No twist, but still score based on future cloud color
  if (ich.futureCloudColor === 'green') return { score: 15, trigger: null };
  return { score: -15, trigger: null };
}

function scoreTKCross(ich: IchimokuValues, candles: OHLCVCandle[]): { score: number; trigger: SignalTrigger | null } {
  const cross = detectTKCross(candles);
  const aboveCloud = ich.currentPrice > ich.cloudTop;
  const belowCloud = ich.currentPrice < ich.cloudBottom;

  if (cross) {
    let score: number;
    if (cross === 'bullish') {
      score = aboveCloud ? 25 : belowCloud ? 10 : 18;
    } else {
      score = belowCloud ? -25 : aboveCloud ? -10 : -18;
    }
    const loc = aboveCloud ? ' above cloud' : belowCloud ? ' below cloud' : ' inside cloud';
    return {
      score,
      trigger: { type: 'tk_cross', direction: cross, description: `TK cross ${cross}${loc}` },
    };
  }

  // Existing TK relationship
  const diff = ich.tenkanSen - ich.kijunSen;
  if (diff > 0) return { score: 12, trigger: null };
  if (diff < 0) return { score: -12, trigger: null };
  return { score: 0, trigger: null };
}

function scorePriceVsCloud(ich: IchimokuValues): { score: number; trigger: SignalTrigger | null } {
  if (ich.currentPrice > ich.cloudTop) return { score: 20, trigger: null };
  if (ich.currentPrice < ich.cloudBottom) return { score: -20, trigger: null };
  return { score: 0, trigger: null }; // inside cloud
}

function scoreChikouSpan(candles: OHLCVCandle[]): { score: number; trigger: SignalTrigger | null } {
  const n = candles.length;
  if (n < 27) return { score: 0, trigger: null };
  const currentClose = candles[n - 1].close;
  const pastClose = candles[n - 27].close; // 26 periods ago
  if (currentClose > pastClose) return { score: 15, trigger: null };
  if (currentClose < pastClose) return { score: -15, trigger: null };
  return { score: 0, trigger: null };
}

function scoreCloudThickness(ich: IchimokuValues): { score: number; trigger: SignalTrigger | null } {
  const thickness = Math.abs(ich.senkouSpanA - ich.senkouSpanB);
  const pct = (thickness / ich.currentPrice) * 100;
  if (pct < 0.5) return { score: 0, trigger: null }; // thin cloud = weak
  const dir = ich.cloudColor === 'green' ? 1 : -1;
  return { score: dir * Math.min(Math.round(pct * 3), 10), trigger: null };
}

// ============ EDGE-TO-EDGE ============

export function detectEdgeToEdge(
  ich: IchimokuValues,
  prevSignal: SignalState | null,
): EdgeToEdgeTrade | null {
  const insideCloud = ich.currentPrice >= ich.cloudBottom && ich.currentPrice <= ich.cloudTop;
  if (!insideCloud) return null;

  // Was the price outside the cloud previously?
  const wasOutside = prevSignal
    ? (prevSignal.price > prevSignal.ichimoku.cloudTop || prevSignal.price < prevSignal.ichimoku.cloudBottom)
    : false;

  // Determine direction
  let direction: 'bullish' | 'bearish';
  let target: number;

  if (wasOutside && prevSignal) {
    // Just entered the cloud
    if (prevSignal.price < prevSignal.ichimoku.cloudBottom) {
      // Entered from below — target cloud top
      direction = 'bullish';
      target = ich.cloudTop;
    } else {
      // Entered from above — target cloud bottom
      direction = 'bearish';
      target = ich.cloudBottom;
    }
  } else if (prevSignal?.edgeToEdge?.active) {
    // Continue existing edge-to-edge trade
    return {
      ...prevSignal.edgeToEdge,
      target: prevSignal.edgeToEdge.direction === 'bullish' ? ich.cloudTop : ich.cloudBottom,
      distancePercent: Number((((prevSignal.edgeToEdge.direction === 'bullish' ? ich.cloudTop : ich.cloudBottom) - ich.currentPrice) / ich.currentPrice * 100).toFixed(2)),
    };
  } else {
    // Already inside cloud with no prior context — infer from cloud color
    direction = ich.cloudColor === 'green' ? 'bullish' : 'bearish';
    target = direction === 'bullish' ? ich.cloudTop : ich.cloudBottom;
  }

  const distancePercent = Number(((target - ich.currentPrice) / ich.currentPrice * 100).toFixed(2));

  return {
    active: true,
    entry: ich.currentPrice,
    target,
    direction,
    distancePercent,
    enteredAt: new Date().toISOString(),
  };
}

// ============ COMPOSITE SCORE ============

export function calculateSignalScore(
  ich: IchimokuValues,
  candles: OHLCVCandle[],
): { score: number; components: SignalComponents; triggers: SignalTrigger[] } {
  const triggers: SignalTrigger[] = [];

  const kumo = scoreKumoTwist(ich, candles);
  const tk = scoreTKCross(ich, candles);
  const priceCloud = scorePriceVsCloud(ich);
  const chikou = scoreChikouSpan(candles);
  const thickness = scoreCloudThickness(ich);

  if (kumo.trigger) triggers.push(kumo.trigger);
  if (tk.trigger) triggers.push(tk.trigger);
  if (priceCloud.trigger) triggers.push(priceCloud.trigger);
  if (chikou.trigger) triggers.push(chikou.trigger);
  if (thickness.trigger) triggers.push(thickness.trigger);

  const score = Math.max(-100, Math.min(100,
    kumo.score + tk.score + priceCloud.score + chikou.score + thickness.score
  ));

  return {
    score,
    components: {
      kumoTwist: kumo.score,
      tkCross: tk.score,
      priceVsCloud: priceCloud.score,
      chikouSpan: chikou.score,
      cloudThickness: thickness.score,
    },
    triggers,
  };
}

export function getSignalLabel(score: number): SignalLabel {
  if (score >= 50) return 'STRONG_BULL';
  if (score > 15) return 'BULLISH';
  if (score <= -50) return 'STRONG_BEAR';
  if (score < -15) return 'BEARISH';
  return 'NEUTRAL';
}

// ============ WEBHOOK DECISION ============

export function shouldFireWebhook(
  current: SignalState,
  prev: SignalState | null,
  config: Config,
): boolean {
  // Always fire on Kumo twist or TK cross
  if (current.triggers.some(t => t.type === 'kumo_twist' || t.type === 'tk_cross')) return true;

  // Fire on edge-to-edge entry
  if (current.edgeToEdge?.active && (!prev?.edgeToEdge?.active)) return true;

  if (!prev) return false;

  // Zero crossing
  if (config.signalThresholds.crossingZero && prev.score * current.score < 0) return true;

  // Magnitude threshold
  if (Math.abs(current.score) >= config.signalThresholds.magnitude &&
      Math.abs(prev.score) < config.signalThresholds.magnitude) return true;

  return false;
}
