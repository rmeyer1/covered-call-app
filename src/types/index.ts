import type { VisionAnalysisResult } from '@/lib/vision';

export type PortfolioAssetType = 'equity' | 'option';

export interface Stock {
  ticker: string;
  shares: number;
}

export type ExpiryMode = 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface ExpirySelection {
  mode: ExpiryMode;
  /**
   * Count of interval units (weeks, months, years) to look ahead. Defaults to 1 when omitted.
   */
  count?: number;
  /**
   * Raw days-ahead fallback for "custom" selections or legacy persisted values.
   */
  daysAhead?: number;
}

export interface Suggestion {
  otmPercent: number;
  strike: number;
  premium: number;
  delta: number;
  yieldMonthly: string;
  yieldAnnualized: string;
  expiration: string;
  theta?: number;
  gamma?: number;
  vega?: number;
  impliedVolatility?: number;
  dte?: number;
}

export interface SuggestionsData {
  currentPrice: number;
  suggestions: Suggestion[];
  selectedExpiration?: string;
  logoUrl?: string | null;
}

export type GetSuggestionsResponse = SuggestionsData;
export type ApiError = { error: string; status?: number; details?: string };

export type SortKey = 'otmPercent' | 'strike' | 'premium' | 'delta';

// Long Calls types
export interface LongCallSuggestion {
  strike: number;
  premium: number;
  delta?: number | null;
  theta?: number | null;
  gamma?: number | null;
  vega?: number | null;
  impliedVolatility?: number | null;
  intrinsic: number;
  extrinsic: number;
  breakeven: number;
  dte: number;
}

export interface LongCallData {
  currentPrice: number;
  selectedExpiration: string;
  suggestions: LongCallSuggestion[];
  logoUrl?: string | null;
}

// Cash-Secured Puts types
export interface CashSecuredPutSuggestion {
  strike: number;
  premium: number;
  bid?: number | null;
  ask?: number | null;
  delta?: number | null;
  theta?: number | null;
  gamma?: number | null;
  vega?: number | null;
  impliedVolatility?: number | null;
  returnPct: string; // period return on collateral, %
  returnAnnualized: string; // annualized %
  breakeven: number;
  dte: number;
}

export interface CashSecuredPutData {
  currentPrice: number;
  selectedExpiration: string;
  suggestions: CashSecuredPutSuggestion[];
  logoUrl?: string | null;
}

// Long Puts types
export interface LongPutSuggestion {
  strike: number;
  premium: number;
  delta?: number | null;
  theta?: number | null;
  gamma?: number | null;
  vega?: number | null;
  impliedVolatility?: number | null;
  intrinsic: number;
  extrinsic: number;
  breakeven: number;
  dte: number;
}

export interface LongPutData {
  currentPrice: number;
  selectedExpiration: string;
  suggestions: LongPutSuggestion[];
  logoUrl?: string | null;
}

export interface DraftHolding {
  id: string;
  ticker: string;
  shares: number | null;
  assetType?: PortfolioAssetType;
  optionStrike?: number | null;
  optionExpiration?: string | null;
  optionRight?: 'call' | 'put' | null;
  costBasis?: number | null;
  marketValue?: number | null;
  confidence?: number | null;
  source?: string;
  uploadId?: string | null;
  uploadName?: string | null;
}

export interface DraftRow extends DraftHolding {
  selected: boolean;
  costBasisSource?: 'ocr' | 'manual' | 'history' | 'derived';
  parseMode?: 'gemini' | 'heuristic' | 'hybrid';
}

export interface RemoteDraft {
  id?: string;
  ticker?: string | null;
  share_qty?: number | string | null;
  asset_type?: PortfolioAssetType | null;
  option_strike?: number | string | null;
  option_expiration?: string | null;
  option_right?: 'call' | 'put' | null;
  cost_basis?: number | string | null;
  market_value?: number | string | null;
  confidence?: number | string | null;
  source?: string | null;
  selected?: boolean;
}

export interface PortfolioHoldingRow {
  id: string;
  user_id: string;
  ticker: string;
  share_qty: number;
  type?: PortfolioAssetType | null;
  option_strike?: number | null;
  option_expiration?: string | null;
  option_right?: 'call' | 'put' | null;
  cost_basis?: number | null;
  market_value?: number | null;
  confidence?: number | null;
  source?: string | null;
  upload_id?: string | null;
  draft_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioHolding {
  id: string;
  userId: string;
  ticker: string;
  shareQty: number;
  type?: PortfolioAssetType | null;
  optionStrike?: number | null;
  optionExpiration?: string | null;
  optionRight?: 'call' | 'put' | null;
  costBasis?: number | null;
  marketValue?: number | null;
  livePrice?: number | null;
  liveValue?: number | null;
  liveGain?: number | null;
  liveGainPercent?: number | null;
  confidence?: number | null;
  source?: string | null;
  uploadId?: string | null;
  draftId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioHoldingSnapshot {
  ticker: string;
  lastPrice: number | null;
  prevClose?: number | null;
  change?: number | null;
  changePercent?: number | null;
  updatedAt?: string | null;
}

export interface PortfolioHoldingsResponse {
  holdings: PortfolioHoldingRow[];
  snapshots?: Record<string, PortfolioHoldingSnapshot>;
  stats?: {
    totalValue?: number | null;
    totalCost?: number | null;
    totalGain?: number | null;
  };
}

export type VisionTokenBoundingBox =
  VisionAnalysisResult['paragraphs'][number]['tokens'][number]['boundingBox'];

export interface OcrTokenCandidate {
  raw: string;
  text: string;
  confidence: number;
  index: number;
  boundingBox?: VisionTokenBoundingBox;
}

export interface OcrNumericCandidate extends OcrTokenCandidate {
  value: number;
}

export interface StockValueRange {
  low: number | null;
  high: number | null;
  asOf?: string | null;
}

export interface StockValueRangePosition extends StockValueRange {
  current: number | null;
  percentile?: number | null;
}

export interface StockVolumeSnapshot {
  today?: number | null;
  overnight?: number | null;
  average30Day?: number | null;
  options?: number | null;
}

export interface StockBidAskQuote {
  bidPrice?: number | null;
  bidSize?: number | null;
  askPrice?: number | null;
  askSize?: number | null;
  spread?: number | null;
  asOf?: string | null;
}

export interface StockDetailsSummary {
  lastPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  lastTradeTime?: string | null;
  dayRange?: StockValueRange;
  fiftyTwoWeekRange?: StockValueRangePosition;
  volume?: StockVolumeSnapshot;
  bidAsk?: StockBidAskQuote;
  marketStatus?: 'pre' | 'open' | 'post' | 'closed';
  asOf: string;
}

export interface StockDetailsVolatility {
  impliedVolatility?: number | null;
  impliedVolatilityLow?: number | null;
  impliedVolatilityHigh?: number | null;
  impliedVolatilityPercentile?: number | null;
  impliedVolatilityRank?: number | null;
  historicalVolatility?: number | null;
  dataAsOf?: string | null;
  source?: string;
}

export interface StockDetailsFundamentals {
  nextEarningsDate?: string | null;
  exDividendDate?: string | null;
  marketCap?: number | null;
  peRatio?: number | null;
  dividendYield?: number | null;
  float?: number | null;
  sharesOutstanding?: number | null;
  beta?: number | null;
  sector?: string | null;
  industry?: string | null;
  employees?: number | null;
  headquarters?: string | null;
  foundedYear?: number | null;
  description?: string | null;
  website?: string | null;
  updatedAt?: string | null;
}

export interface StockHeadline {
  id: string;
  title: string;
  summary?: string | null;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
}

export interface StockDetailsSources {
  summary: string;
  volatility?: string;
  fundamentals?: string;
  headlines?: string;
}

export interface StockDetails {
  symbol: string;
  asOf: string;
  summary: StockDetailsSummary;
  volatility?: StockDetailsVolatility;
  fundamentals?: StockDetailsFundamentals;
  headlines?: StockHeadline[];
  sources: StockDetailsSources;
  warnings?: string[];
  isPartial?: boolean;
}
