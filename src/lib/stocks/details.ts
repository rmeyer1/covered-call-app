import type { AlpacaBar, AlpacaNewsItem, AlpacaOptionsSnapshot, AlpacaStockSnapshot } from '@/types/alpaca';
import type {
  StockDetails,
  StockDetailsFundamentals,
  StockDetailsSummary,
  StockDetailsVolatility,
  StockHeadline,
  StockValueRangePosition,
} from '@/types';

function calcChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || current === undefined || previous === undefined) {
    return { change: null, changePercent: null };
  }
  const change = current - previous;
  const changePercent = previous !== 0 ? change / previous : null;
  return { change, changePercent };
}

function findRangePosition(current: number | null, bars: AlpacaBar[] | undefined): StockValueRangePosition | undefined {
  if (!bars || !bars.length) return undefined;
  const lows = bars.map((bar) => bar.l);
  const highs = bars.map((bar) => bar.h);
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  if (Number.isNaN(low) || Number.isNaN(high)) return undefined;
  let percentile: number | null = null;
  if (current !== null && current !== undefined && high !== low) {
    percentile = (current - low) / (high - low);
  }
  return {
    low,
    high,
    current: current ?? null,
    percentile,
  };
}

function buildSummary(snapshot: AlpacaStockSnapshot | undefined, bars: AlpacaBar[]): StockDetailsSummary {
  const latestPrice = snapshot?.latestTrade?.p ?? snapshot?.minuteBar?.c ?? snapshot?.dailyBar?.c ?? null;
  const previousClose = snapshot?.prevDailyBar?.c ?? null;
  const changeData = calcChange(latestPrice, previousClose);
  const sparkline = [...bars]
    .slice(0, 20)
    .reverse()
    .map((bar) => bar.c)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    lastPrice: latestPrice ?? null,
    previousClose,
    change: changeData.change,
    changePercent: changeData.changePercent,
    lastTradeTime: snapshot?.latestTrade?.t ?? null,
    sparkline: sparkline.length ? sparkline : undefined,
    dayRange: snapshot?.dailyBar
      ? {
          low: snapshot.dailyBar.l,
          high: snapshot.dailyBar.h,
          asOf: snapshot.dailyBar.t,
        }
      : undefined,
    fiftyTwoWeekRange: findRangePosition(latestPrice ?? null, bars),
    volume: {
      today: snapshot?.dailyBar?.v,
      overnight: snapshot?.minuteBar?.v,
      average30Day: calculateAverageVolume(bars, 30),
    },
    bidAsk: snapshot?.latestQuote
      ? {
          bidPrice: snapshot.latestQuote.bp,
          bidSize: snapshot.latestQuote.bs,
          askPrice: snapshot.latestQuote.ap,
          askSize: snapshot.latestQuote.as,
          spread:
            snapshot.latestQuote.ap !== undefined && snapshot.latestQuote.bp !== undefined
              ? snapshot.latestQuote.ap - snapshot.latestQuote.bp
              : null,
          asOf: snapshot.latestQuote.t,
        }
      : undefined,
    marketStatus: determineMarketStatus(snapshot),
    asOf: snapshot?.latestTrade?.t ?? new Date().toISOString(),
  };
}

function calculateAverageVolume(bars: AlpacaBar[], window = 30) {
  if (!bars.length) return null;
  const slice = bars.slice(0, window);
  if (!slice.length) return null;
  const total = slice.reduce((sum, bar) => sum + (bar.v ?? 0), 0);
  return total / slice.length;
}

function determineMarketStatus(snapshot: AlpacaStockSnapshot | undefined) {
  if (!snapshot?.latestTrade?.t) return undefined;
  const tradeTime = new Date(snapshot.latestTrade.t).getUTCHours();
  if (tradeTime >= 20 || tradeTime < 13) return 'post';
  if (tradeTime < 13) return 'pre';
  return 'open';
}

function buildVolatility(snapshot: AlpacaOptionsSnapshot | undefined): StockDetailsVolatility | undefined {
  if (!snapshot) return undefined;
  return {
    impliedVolatility: snapshot.impliedVolatility ?? null,
    impliedVolatilityLow: snapshot.impliedVolatilityLow ?? null,
    impliedVolatilityHigh: snapshot.impliedVolatilityHigh ?? null,
    impliedVolatilityPercentile: snapshot.ivPercentile ?? null,
    impliedVolatilityRank: snapshot.ivRank ?? null,
    historicalVolatility: snapshot.historicalVolatility ?? null,
    dataAsOf: snapshot.updatedAt ?? null,
    source: 'alpaca.options.snapshots',
  };
}

function buildFundamentals(): StockDetailsFundamentals | undefined {
  return undefined;
}

function mapNews(news: AlpacaNewsItem[]): StockHeadline[] {
  return news.map((item) => ({
    id: String(item.id),
    title: item.headline,
    summary: item.summary ?? null,
    url: item.url,
    source: item.source ?? 'Alpaca',
    publishedAt: item.created_at,
    sentiment: item.sentiment ?? null,
  }));
}

export interface BuildStockDetailsParams {
  symbol: string;
  snapshot?: AlpacaStockSnapshot;
  optionsSnapshot?: AlpacaOptionsSnapshot;
  bars?: AlpacaBar[];
  news?: AlpacaNewsItem[];
}

export function buildStockDetails({
  symbol,
  snapshot,
  optionsSnapshot,
  bars = [],
  news = [],
}: BuildStockDetailsParams): StockDetails {
  const warnings: string[] = [];
  if (!snapshot) warnings.push('Snapshot data unavailable');
  warnings.push('Fundamentals unavailable');

  const summary = buildSummary(snapshot, bars);
  const volatility = buildVolatility(optionsSnapshot);
  const fundamentalsSection = buildFundamentals();
  const mappedNews = mapNews(news);

  return {
    symbol,
    asOf: new Date().toISOString(),
    summary,
    volatility,
    fundamentals: fundamentalsSection,
    headlines: mappedNews,
    sources: {
      summary: 'alpaca.snapshot',
      volatility: optionsSnapshot ? 'alpaca.options.snapshots' : undefined,
      headlines: news.length ? 'alpaca.news' : undefined,
    },
    warnings,
    isPartial: warnings.length > 0,
  };
}
