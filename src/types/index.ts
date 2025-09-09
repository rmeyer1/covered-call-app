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
