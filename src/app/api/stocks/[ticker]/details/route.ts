import { NextRequest, NextResponse } from 'next/server';
import { getDailyBars, getNews, getOptionsSnapshot, getStockSnapshot } from '@/lib/alpaca';
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

  const [snapshot, optionsSnapshot, news, bars] = await Promise.all([
    safeResolve(() => getStockSnapshot(ticker), 'snapshot', warnings),
    safeResolve(() => getOptionsSnapshot(ticker), 'volatility', warnings),
    safeResolve(() => getNews(ticker, 5), 'news', warnings),
    safeResolve(() => getDailyBars(ticker, 252), 'bars', warnings),
  ]);

  const details = buildStockDetails({
    symbol: ticker,
    snapshot,
    optionsSnapshot,
    news: news ?? [],
    bars: bars ?? [],
  });

  if (warnings.length) {
    details.warnings = [...(details.warnings ?? []), ...warnings];
    details.isPartial = true;
  }

  return NextResponse.json(details, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    },
  });
}
