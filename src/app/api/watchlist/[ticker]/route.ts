import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';
import { fetchWatchlistRows, mapWatchlistRowsWithLogo, normalizeTicker, resolveUserId } from '../helpers';
import { getLogoUrl, listAssets } from '@/lib/alpaca';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { ticker: rawTicker } = await params;
    const ticker = normalizeTicker(rawTicker);
    if (!ticker) {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    await supabaseRestFetch(
      `/rest/v1/watchlist_items?ticker=eq.${encodeURIComponent(ticker)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      }
    );

    const rows = await fetchWatchlistRows(userId);
    const logoEntries = await Promise.all(
      rows.map(async (row) => [row.ticker, await getLogoUrl(row.ticker)] as const)
    );
    const assets = await listAssets();
    const nameMap = assets.reduce<Record<string, string | null>>((acc, asset) => {
      if (asset.symbol) acc[asset.symbol.toUpperCase()] = asset.name ?? null;
      return acc;
    }, {});
    const logoMap = logoEntries.reduce<Record<string, string | null>>((acc, [ticker, logoUrl]) => {
      acc[ticker] = logoUrl;
      return acc;
    }, {});
    return NextResponse.json({ items: mapWatchlistRowsWithLogo(rows, logoMap, nameMap) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete watchlist item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
