import { getConfig } from "../config";

export interface IchimokuSignal {
  asset: string;
  timeframe: string;
  signal: string;
  score: number;
  label: string;
  details: {
    price_vs_cloud?: string;
    tk_cross?: string;
    chikou_position?: string;
    kumo_twist?: boolean;
    cloud_color?: string;
  };
  timestamp: string;
}

export interface IchimokuResponse {
  signals: IchimokuSignal[];
  timestamp: string;
  source: string;
}

export async function fetchIchimokuSignals(): Promise<IchimokuResponse | null> {
  const config = getConfig();
  const url = config.sources.ichimoku.url;
  const timeout = config.sources.ichimoku.timeout;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[ichimoku] HTTP ${response.status} from ${url}`);
      return null;
    }

    const data = await response.json();

    // Normalize response format
    if (Array.isArray(data)) {
      return {
        signals: data,
        timestamp: new Date().toISOString(),
        source: url,
      };
    }

    if (data.signals) {
      return {
        signals: data.signals,
        timestamp: data.timestamp || new Date().toISOString(),
        source: url,
      };
    }

    // Handle different API response formats
    return {
      signals: normalizeSignals(data),
      timestamp: new Date().toISOString(),
      source: url,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`[ichimoku] Timeout fetching from ${url}`);
    } else {
      console.error(`[ichimoku] Error:`, error.message);
    }
    return null;
  }
}

function normalizeSignals(data: any): IchimokuSignal[] {
  const signals: IchimokuSignal[] = [];

  // Handle nested asset structure
  if (data.assets) {
    for (const [asset, timeframes] of Object.entries(data.assets as Record<string, any>)) {
      for (const [timeframe, info] of Object.entries(timeframes as Record<string, any>)) {
        signals.push({
          asset: asset.toUpperCase(),
          timeframe,
          signal: info.signal || info.label || "UNKNOWN",
          score: info.score || info.composite_score || 0,
          label: info.label || info.signal || "UNKNOWN",
          details: {
            price_vs_cloud: info.price_vs_cloud,
            tk_cross: info.tk_cross,
            chikou_position: info.chikou_position,
            kumo_twist: info.kumo_twist,
            cloud_color: info.cloud_color,
          },
          timestamp: info.timestamp || new Date().toISOString(),
        });
      }
    }
  }

  return signals;
}

export function getSignalEmoji(signal: string): string {
  const normalized = signal.toUpperCase();
  if (normalized.includes("STRONG_BULL")) return "🟢🟢";
  if (normalized.includes("BULL")) return "🟢";
  if (normalized.includes("STRONG_BEAR")) return "🔴🔴";
  if (normalized.includes("BEAR")) return "🔴";
  return "⚪";
}

export function formatSignalForDisplay(signal: IchimokuSignal): string {
  const emoji = getSignalEmoji(signal.signal);
  return `${signal.asset} (${signal.timeframe}): ${emoji} ${signal.label} (${signal.score > 0 ? "+" : ""}${signal.score})`;
}
