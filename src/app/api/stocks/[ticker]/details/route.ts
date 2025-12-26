import { NextRequest, NextResponse } from 'next/server';
import {
  aggregateOptionsSnapshots,
  getDailyBars,
  getMinuteBars,
  getNews,
  getOptionChainByTypePage,
  getOptionsSnapshots,
  getStockSnapshot,
  pickOptionsSnapshot,
} from '@/lib/alpaca';
import { buildStockDetails } from '@/lib/stocks/details';
import { logError } from '@/lib/logger';
import type { OptionContract } from '@/lib/options';

export const revalidate = 60;

async function safeResolve<T>(fn: () => Promise<T>, label: string, warnings: string[]): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${label} unavailable: ${message}`);
    logError(`stocks.details.${label}`, { error: message });
    return undefined;
  }
}

export async function GET(_req: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await context.params;
  const ticker = rawTicker?.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  const warnings: string[] = [];

  const [snapshot, optionsSnapshots, news, dailyBars, intradayBars] = await Promise.all([
    safeResolve(() => getStockSnapshot(ticker), 'snapshot', warnings),
    safeResolve(() => getOptionsSnapshots(ticker), 'volatility', warnings),
    safeResolve(() => getNews(ticker, 5), 'news', warnings),
    safeResolve(() => getDailyBars(ticker, 252 * 5), 'bars_daily', warnings),
    safeResolve(() => getMinuteBars(ticker, '1Min', 390), 'bars_intraday', warnings),
  ]);

  if (!snapshot) {
    warnings.push('snapshot unavailable: empty response');
  }
  if (!optionsSnapshots || Object.keys(optionsSnapshots).length === 0) {
    warnings.push('volatility unavailable: no option snapshots returned');
  }
  if (!dailyBars || dailyBars.length === 0) {
    warnings.push('bars_daily unavailable: empty response');
  }
  if (!intradayBars || intradayBars.length === 0) {
    warnings.push('bars_intraday unavailable: empty response');
  }

  const aggregatedVolatility = aggregateOptionsSnapshots(optionsSnapshots);
  let optionsSnapshot = aggregatedVolatility ?? pickOptionsSnapshot(optionsSnapshots);
  if (
    optionsSnapshot &&
    optionsSnapshot.impliedVolatility === undefined &&
    optionsSnapshot.impliedVolatilityLow === undefined &&
    optionsSnapshot.impliedVolatilityHigh === undefined &&
    optionsSnapshot.impliedVolatilityPercentile === undefined &&
    optionsSnapshot.impliedVolatilityRank === undefined
  ) {
    warnings.push('volatility unavailable: option snapshots missing IV fields');
    optionsSnapshot = undefined;
  }

  if (!optionsSnapshot) {
    const [callChain, putChain] = await Promise.all([
      safeResolve(() => getOptionChainByTypePage(ticker, 'call', 200), 'volatility_calls', warnings),
      safeResolve(() => getOptionChainByTypePage(ticker, 'put', 200), 'volatility_puts', warnings),
    ]);

    const ivStats = deriveIvStats([...(callChain ?? []), ...(putChain ?? [])]);
    if (ivStats) {
      optionsSnapshot = {
        symbol: ticker,
        impliedVolatility: ivStats.iv,
        impliedVolatilityLow: ivStats.ivLow,
        impliedVolatilityHigh: ivStats.ivHigh,
        impliedVolatilityPercentile: null,
        impliedVolatilityRank: null,
        historicalVolatility: null,
        updatedAt: new Date().toISOString(),
      };
    } else {
      warnings.push('volatility unavailable: option chain missing IV values');
    }
  }
  const details = buildStockDetails({
    symbol: ticker,
    snapshot,
    optionsSnapshot,
    news: news ?? [],
    bars: dailyBars ?? [],
    intradayBars: intradayBars ?? [],
    warnings,
  });

  return NextResponse.json(details, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    },
  });
}

function deriveIvStats(contracts: OptionContract[]) {
  const ivs = contracts
    .map((contract) => contract.impliedVolatility)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!ivs.length) return null;
  const sorted = [...ivs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const iv = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    iv,
    ivLow: sorted[0],
    ivHigh: sorted[sorted.length - 1],
  };
}
