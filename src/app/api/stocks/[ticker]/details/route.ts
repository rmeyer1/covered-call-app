import { NextRequest, NextResponse } from 'next/server';
import {
  getDailyBars,
  getMinuteBars,
  getNews,
  getOptionsSnapshots,
  getStockSnapshot,
  pickOptionsSnapshot,
} from '@/lib/alpaca';
import { buildStockDetails } from '@/lib/stocks/details';
import { logError } from '@/lib/logger';

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

  const optionsSnapshot = pickOptionsSnapshot(optionsSnapshots);
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
