export interface Stock {
  ticker: string;
  shares: number;
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
}
