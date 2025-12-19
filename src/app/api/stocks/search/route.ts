import { NextRequest, NextResponse } from 'next/server';
import { searchAssets } from '@/lib/alpaca';
import { logError } from '@/lib/logger';

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const rawQuery = req.nextUrl.searchParams.get('q') ?? req.nextUrl.searchParams.get('query') ?? '';
  const query = rawQuery.trim();
  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const results = await searchAssets(query, 10);
    const mapped = results
      .filter((asset) => asset.symbol)
      .map((asset) => ({
        symbol: asset.symbol.toUpperCase(),
        name: asset.name ?? null,
        exchange: asset.exchange,
        tradable: asset.tradable ?? false,
      }));

    return NextResponse.json(
      { results: mapped },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=900',
        },
      }
    );
  } catch (err) {
    logError('stocks.search', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
