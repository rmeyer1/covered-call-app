import type {
  StockDetails,
  StockDetailsSummary,
  StockDetailsVolatility,
  StockDetailsFundamentals,
  StockHeadline,
} from '@/types';

export interface SummaryTileView {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  rangeToday: StockDetailsSummary['dayRange'] | undefined;
  range52Week: StockDetailsSummary['fiftyTwoWeekRange'] | undefined;
  volume: StockDetailsSummary['volume'] | undefined;
  bidAsk: StockDetailsSummary['bidAsk'] | undefined;
  marketStatus: StockDetailsSummary['marketStatus'] | undefined;
  asOf: string;
}

export interface VolatilityTileView {
  currentIV: number | null;
  ivLow: number | null;
  ivHigh: number | null;
  ivPercentile: number | null;
  ivRank: number | null;
  historicalVolatility: number | null;
  updatedAt: string | null;
  source: string;
}

export interface FundamentalsTileView {
  nextEarningsDate: string | null;
  exDividendDate: string | null;
  marketCap: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  float: number | null;
  sharesOutstanding: number | null;
  beta: number | null;
  sector: string | null;
  industry: string | null;
  employees: number | null;
  headquarters: string | null;
  foundedYear: number | null;
  description: string | null;
  website: string | null;
  updatedAt: string | null;
}

export interface HeadlineView {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
}

export interface StockDetailsViewModel {
  summary: SummaryTileView | null;
  volatility: VolatilityTileView | null;
  fundamentals: FundamentalsTileView | null;
  headlines: HeadlineView[];
  warnings: string[];
  sources: StockDetails['sources'];
  asOf: string;
}

export interface PositionDerivationInput {
  shares?: number | null;
  costBasis?: number | null;
  marketValue?: number | null;
  livePrice?: number | null;
}

export interface PositionDerivation {
  marketValue: number | null;
  costBasisValue: number | null;
  gain: number | null;
  gainPercent: number | null;
  portfolioPercent: number | null;
}

export function buildSummaryTile(summary?: StockDetailsSummary | null): SummaryTileView | null {
  if (!summary) return null;
  return {
    price: summary.lastPrice ?? null,
    change: summary.change ?? null,
    changePercent: summary.changePercent ?? null,
    rangeToday: summary.dayRange ?? undefined,
    range52Week: summary.fiftyTwoWeekRange ?? undefined,
    volume: summary.volume ?? undefined,
    bidAsk: summary.bidAsk ?? undefined,
    marketStatus: summary.marketStatus ?? undefined,
    asOf: summary.asOf,
  };
}

export function buildVolatilityTile(volatility?: StockDetailsVolatility | null): VolatilityTileView | null {
  if (!volatility) return null;
  return {
    currentIV: volatility.impliedVolatility ?? null,
    ivLow: volatility.impliedVolatilityLow ?? null,
    ivHigh: volatility.impliedVolatilityHigh ?? null,
    ivPercentile: volatility.impliedVolatilityPercentile ?? null,
    ivRank: volatility.impliedVolatilityRank ?? null,
    historicalVolatility: volatility.historicalVolatility ?? null,
    updatedAt: volatility.dataAsOf ?? null,
    source: volatility.source ?? 'alpaca.options.snapshots',
  };
}

export function buildFundamentalsTile(
  fundamentals?: StockDetailsFundamentals | null
): FundamentalsTileView | null {
  if (!fundamentals) return null;
  return {
    nextEarningsDate: fundamentals.nextEarningsDate ?? null,
    exDividendDate: fundamentals.exDividendDate ?? null,
    marketCap: fundamentals.marketCap ?? null,
    peRatio: fundamentals.peRatio ?? null,
    dividendYield: fundamentals.dividendYield ?? null,
    float: fundamentals.float ?? null,
    sharesOutstanding: fundamentals.sharesOutstanding ?? null,
    beta: fundamentals.beta ?? null,
    sector: fundamentals.sector ?? null,
    industry: fundamentals.industry ?? null,
    employees: fundamentals.employees ?? null,
    headquarters: fundamentals.headquarters ?? null,
    foundedYear: fundamentals.foundedYear ?? null,
    description: fundamentals.description ?? null,
    website: fundamentals.website ?? null,
    updatedAt: fundamentals.updatedAt ?? null,
  };
}

export function buildHeadlinesTile(headlines?: StockHeadline[] | null): HeadlineView[] {
  if (!headlines || !headlines.length) return [];
  return headlines.map((headline) => ({
    id: headline.id,
    title: headline.title,
    summary: headline.summary ?? null,
    url: headline.url,
    source: headline.source,
    publishedAt: headline.publishedAt,
    sentiment: headline.sentiment ?? null,
  }));
}

export function deriveStockDetailsView(details: StockDetails | null): StockDetailsViewModel | null {
  if (!details) return null;
  return {
    summary: buildSummaryTile(details.summary),
    volatility: buildVolatilityTile(details.volatility),
    fundamentals: buildFundamentalsTile(details.fundamentals),
    headlines: buildHeadlinesTile(details.headlines),
    warnings: details.warnings ?? [],
    sources: details.sources,
    asOf: details.asOf,
  };
}

export function derivePositionMetrics(
  input: PositionDerivationInput,
  totalPortfolioValue?: number | null
): PositionDerivation {
  const shares = typeof input.shares === 'number' && Number.isFinite(input.shares) ? input.shares : null;
  const costBasis = typeof input.costBasis === 'number' && Number.isFinite(input.costBasis) ? input.costBasis : null;
  const providedMarketValue =
    typeof input.marketValue === 'number' && Number.isFinite(input.marketValue) ? input.marketValue : null;
  const livePrice = typeof input.livePrice === 'number' && Number.isFinite(input.livePrice) ? input.livePrice : null;

  const marketValue = providedMarketValue ?? (shares && livePrice ? shares * livePrice : null);
  const costBasisValue = costBasis !== null && shares ? costBasis * shares : null;
  const gain = marketValue !== null && costBasisValue !== null ? marketValue - costBasisValue : null;
  const gainPercent =
    gain !== null && costBasisValue !== null && costBasisValue !== 0 ? gain / costBasisValue : null;

  const portfolioPercent =
    marketValue !== null && totalPortfolioValue
      ? marketValue / totalPortfolioValue
      : null;

  return {
    marketValue,
    costBasisValue,
    gain,
    gainPercent,
    portfolioPercent,
  };
}
