import { fetchIchimokuSignals, formatSignalForDisplay, type IchimokuSignal } from "../sources/ichimoku";
import { fetchMarketPrices, formatPrice, formatChange, type MarketPrice } from "../sources/market";
import { getRecentAlerts, readHistoryEvents, type HistoryEvent } from "../sources/history";
import { getConfig } from "../config";

export interface MorningBrief {
  title: string;
  date: string;
  timestamp: string;
  sections: {
    market_snapshot: MarketSnapshot;
    active_signals: ActiveSignal[];
    overnight_alerts: OvernightAlert[];
    todays_focus: string[];
  };
  raw: {
    prices: MarketPrice[];
    signals: IchimokuSignal[];
    alerts: HistoryEvent[];
  };
}

export interface MarketSnapshot {
  assets: {
    symbol: string;
    price: string;
    change: string;
    signal?: string;
    score?: number;
  }[];
}

export interface ActiveSignal {
  asset: string;
  timeframe: string;
  label: string;
  score: number;
  details: string;
}

export interface OvernightAlert {
  time: string;
  message: string;
}

export async function generateMorningBrief(): Promise<MorningBrief> {
  const config = getConfig();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: config.timezone,
  });

  // Fetch all data sources in parallel
  const [ichimokuData, marketData] = await Promise.all([
    fetchIchimokuSignals(),
    fetchMarketPrices(),
  ]);

  const signals = ichimokuData?.signals || [];
  const prices = marketData?.prices || [];
  const events = readHistoryEvents(now);
  const alerts = getRecentAlerts(events, 12);

  // Build market snapshot with signals
  const signalMap = new Map<string, IchimokuSignal>();
  for (const sig of signals) {
    const key = `${sig.asset}_${sig.timeframe}`;
    signalMap.set(key, sig);
  }

  const marketSnapshot: MarketSnapshot = {
    assets: prices.map((p) => {
      // Find daily signal for this asset
      const sig = signalMap.get(`${p.symbol}_1D`) || signalMap.get(`${p.symbol}_daily`);
      return {
        symbol: p.symbol,
        price: formatPrice(p.current_price),
        change: formatChange(p.price_change_percentage_24h),
        signal: sig?.label,
        score: sig?.score,
      };
    }),
  };

  // Active signals (non-neutral)
  const activeSignals: ActiveSignal[] = signals
    .filter((s) => Math.abs(s.score) > 15) // Only show significant signals
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 5)
    .map((s) => ({
      asset: s.asset,
      timeframe: s.timeframe,
      label: s.label,
      score: s.score,
      details: buildSignalDetails(s),
    }));

  // Overnight alerts
  const overnightAlerts: OvernightAlert[] = alerts.map((a) => ({
    time: new Date(a.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: config.timezone,
    }),
    message: a.data?.message || a.data?.summary || "Alert triggered",
  }));

  // Today's focus - derive from signals
  const todaysFocus = deriveTodaysFocus(signals, prices);

  return {
    title: "Morning Brief",
    date: dateStr,
    timestamp: now.toISOString(),
    sections: {
      market_snapshot: marketSnapshot,
      active_signals: activeSignals,
      overnight_alerts: overnightAlerts,
      todays_focus: todaysFocus,
    },
    raw: {
      prices,
      signals,
      alerts,
    },
  };
}

function buildSignalDetails(signal: IchimokuSignal): string {
  const parts: string[] = [];
  const details = signal.details || {};

  if (details.price_vs_cloud) {
    parts.push(`Price ${details.price_vs_cloud}`);
  }
  if (details.tk_cross) {
    parts.push(`TK ${details.tk_cross}`);
  }
  if (details.kumo_twist) {
    parts.push("Kumo twist detected");
  }
  if (details.chikou_position) {
    parts.push(`Chikou ${details.chikou_position}`);
  }

  return parts.join(", ") || "Standard signal";
}

function deriveTodaysFocus(signals: IchimokuSignal[], prices: MarketPrice[]): string[] {
  const focus: string[] = [];

  // Find strongest bearish signals
  const bearish = signals.filter((s) => s.score < -30).sort((a, b) => a.score - b.score);
  if (bearish.length > 0) {
    const strongest = bearish[0];
    const price = prices.find((p) => p.symbol === strongest.asset);
    if (price) {
      focus.push(`Watch ${strongest.asset} support levels — strong bearish signal (${strongest.score})`);
    }
  }

  // Find strongest bullish signals
  const bullish = signals.filter((s) => s.score > 30).sort((a, b) => b.score - a.score);
  if (bullish.length > 0) {
    const strongest = bullish[0];
    focus.push(`${strongest.asset} momentum continuation — bullish signal (+${strongest.score})`);
  }

  // Check for kumo twists
  const twists = signals.filter((s) => s.details?.kumo_twist);
  for (const twist of twists.slice(0, 2)) {
    focus.push(`${twist.asset} (${twist.timeframe}) — Kumo twist detected, watch for trend change`);
  }

  // Check for big movers
  const bigMovers = prices.filter((p) => Math.abs(p.price_change_percentage_24h) > 5);
  for (const mover of bigMovers.slice(0, 2)) {
    const direction = mover.price_change_percentage_24h > 0 ? "up" : "down";
    focus.push(
      `${mover.symbol} ${direction} ${Math.abs(mover.price_change_percentage_24h).toFixed(1)}% — monitor for continuation`
    );
  }

  if (focus.length === 0) {
    focus.push("Markets relatively quiet — watch for breakouts");
  }

  return focus.slice(0, 4);
}

export function getBriefSummary(brief: MorningBrief): string {
  const { sections } = brief;
  const signalCount = sections.active_signals.length;
  const alertCount = sections.overnight_alerts.length;

  let summary = `${brief.date}: `;

  if (signalCount > 0) {
    const bullish = sections.active_signals.filter((s) => s.score > 0).length;
    const bearish = signalCount - bullish;
    summary += `${signalCount} active signals (${bullish} bullish, ${bearish} bearish)`;
  } else {
    summary += "No significant signals";
  }

  if (alertCount > 0) {
    summary += `, ${alertCount} overnight alerts`;
  }

  return summary;
}
