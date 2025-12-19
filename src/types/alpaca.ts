import type { StockDetails } from '@/types';

export interface AlpacaTrade {
  t?: string;
  p?: number;
  s?: number;
}

export interface AlpacaQuote {
  t?: string;
  bp?: number;
  bs?: number;
  ap?: number;
  as?: number;
}

export interface AlpacaAsset {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name?: string | null;
  status?: string | null;
  tradable?: boolean;
}

export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface AlpacaSnapshotResponse {
  symbol: string;
  latestTrade?: AlpacaTrade;
  latestQuote?: AlpacaQuote;
  minuteBar?: AlpacaBar;
  dailyBar?: AlpacaBar;
  weeklyBar?: AlpacaBar;
  monthlyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
}

export type AlpacaStockSnapshot = AlpacaSnapshotResponse;

export interface AlpacaOptionsSnapshot {
  symbol: string;
  impliedVolatility?: number;
  impliedVolatilityChange?: number;
  historicalVolatility?: number;
  ivRank?: number;
  ivPercentile?: number;
  impliedVolatilityHigh?: number;
  impliedVolatilityLow?: number;
  updatedAt?: string;
}

export interface AlpacaNewsItem {
  id: number;
  headline: string;
  summary?: string;
  url: string;
  source?: string;
  created_at: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface AlpacaNewsResponse {
  news: AlpacaNewsItem[];
}

export interface AlpacaBarResponse {
  bars: AlpacaBar[];
  symbol: string;
  next_page_token?: string | null;
}

export interface StockDetailsPayload extends StockDetails {
  cacheTtlSeconds?: number;
}

export interface StockDetailsBuildResult {
  details: StockDetails;
  warnings: string[];
}

export interface AlpacaOptionsSnapshotResponse {
  snapshots: Record<string, AlpacaOptionsSnapshot>;
}

export interface AlpacaStockSnapshotResult {
  snapshot: AlpacaStockSnapshot;
}
