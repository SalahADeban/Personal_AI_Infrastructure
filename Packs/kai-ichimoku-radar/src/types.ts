/**
 * IchimokuRadar Types
 */

export type Timeframe = '1D' | '1M';
export type AssetType = 'crypto' | 'stock';
export type SignalLabel = 'STRONG_BULL' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEAR';

export interface AssetConfig {
  symbol: string;
  name: string;
  type: AssetType;
  coingeckoId?: string;
  yahooSymbol?: string;
}

export interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCVData {
  asset: string;
  timeframe: Timeframe;
  candles: OHLCVCandle[];
  lastUpdated: string;
  source: 'coingecko' | 'yahoo';
}

export interface IchimokuValues {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  futureSenkouA: number;
  futureSenkouB: number;
  chikouSpan: number;
  currentPrice: number;
  cloudTop: number;
  cloudBottom: number;
  cloudColor: 'green' | 'red';
  futureCloudColor: 'green' | 'red';
}

export interface IchimokuSeries {
  tenkan: (number | null)[];
  kijun: (number | null)[];
  senkouA: (number | null)[];
  senkouB: (number | null)[];
  chikou: (number | null)[];
  closes: number[];
  timestamps: number[];
}

export interface SignalComponents {
  kumoTwist: number;
  tkCross: number;
  priceVsCloud: number;
  chikouSpan: number;
  cloudThickness: number;
}

export interface SignalTrigger {
  type: 'kumo_twist' | 'tk_cross' | 'price_breakout' | 'chikou_cross' | 'edge_to_edge' | 'score_cross_zero' | 'score_magnitude';
  direction: 'bullish' | 'bearish';
  description: string;
}

export interface EdgeToEdgeTrade {
  active: boolean;
  entry: number;
  target: number;
  direction: 'bullish' | 'bearish';
  distancePercent: number;
  enteredAt: string;
}

export interface SignalState {
  asset: string;
  timeframe: Timeframe;
  timestamp: string;
  price: number;
  ichimoku: IchimokuValues;
  components: SignalComponents;
  score: number;
  label: SignalLabel;
  prevScore: number | null;
  triggers: SignalTrigger[];
  edgeToEdge: EdgeToEdgeTrade | null;
}

export interface Config {
  watchlist: AssetConfig[];
  timeframes: Timeframe[];
  webhookUrl: string;
  refreshIntervals: { daily: number; monthly: number };
  signalThresholds: { crossingZero: boolean; magnitude: number };
}

export interface WebhookPayload {
  asset: string;
  timeframe: Timeframe;
  signal: SignalLabel;
  score: number;
  prevScore: number;
  triggers: SignalTrigger[];
  price: number;
  timestamp: string;
  edgeToEdge: EdgeToEdgeTrade | null;
}

export interface SignalSnapshot {
  timestamp: string;
  signals: { asset: string; timeframe: Timeframe; score: number; label: SignalLabel; price: number }[];
}

export interface SignalHistoryPoint {
  timestamp: string;
  score: number;
  price: number;
  label: SignalLabel;
}

export const DEFAULT_WATCHLIST: AssetConfig[] = [
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto', coingeckoId: 'ethereum' },
  { symbol: 'SOL', name: 'Solana', type: 'crypto', coingeckoId: 'solana' },
  { symbol: 'JUP', name: 'Jupiter', type: 'crypto', coingeckoId: 'jupiter-exchange-solana' },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock', yahooSymbol: 'TSLA' },
];
