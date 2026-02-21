import { getConfig } from "../config";

export interface MarketPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap?: number;
  volume_24h?: number;
  last_updated: string;
}

export interface MarketResponse {
  prices: MarketPrice[];
  timestamp: string;
  source: string;
}

const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Asset ID to symbol mapping
const ASSET_SYMBOLS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  "jupiter-exchange-solana": "JUP",
  dogecoin: "DOGE",
  cardano: "ADA",
};

export async function fetchMarketPrices(): Promise<MarketResponse | null> {
  const config = getConfig();
  const assets = config.sources.market.assets;
  const timeout = config.sources.market.timeout;

  if (!assets || assets.length === 0) {
    console.log("[market] No assets configured");
    return { prices: [], timestamp: new Date().toISOString(), source: "none" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const ids = assets.join(",");
    const url = `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        console.error("[market] CoinGecko rate limited");
        return null;
      }
      console.error(`[market] HTTP ${response.status} from CoinGecko`);
      return null;
    }

    const data = await response.json();

    const prices: MarketPrice[] = data.map((coin: any) => ({
      id: coin.id,
      symbol: ASSET_SYMBOLS[coin.id] || coin.symbol.toUpperCase(),
      name: coin.name,
      current_price: coin.current_price,
      price_change_24h: coin.price_change_24h,
      price_change_percentage_24h: coin.price_change_percentage_24h,
      market_cap: coin.market_cap,
      volume_24h: coin.total_volume,
      last_updated: coin.last_updated,
    }));

    return {
      prices,
      timestamp: new Date().toISOString(),
      source: "coingecko",
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("[market] Timeout fetching from CoinGecko");
    } else {
      console.error("[market] Error:", error.message);
    }
    return null;
  }
}

export function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  }
  return `$${price.toFixed(4)}`;
}

export function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

export function getChangeEmoji(change: number): string {
  if (change > 5) return "🚀";
  if (change > 0) return "📈";
  if (change < -5) return "💥";
  if (change < 0) return "📉";
  return "➡️";
}
