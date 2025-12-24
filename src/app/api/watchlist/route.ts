import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';
import {
  MAX_WATCHLIST_ITEMS,
  fetchWatchlistRows,
  mapWatchlistRowsWithLogo,
  normalizeTicker,
  resolveUserId,
  validateTicker,
} from './helpers';
import { getLogoUrl, listAssets } from '@/lib/alpaca';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

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
    const message = err instanceof Error ? err.message : 'Failed to load watchlist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ticker = normalizeTicker(body?.ticker ?? body?.symbol);
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!ticker) {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    const currentRows = await fetchWatchlistRows(userId);
    if (currentRows.length >= MAX_WATCHLIST_ITEMS) {
      return NextResponse.json(
        { error: `watchlist is limited to ${MAX_WATCHLIST_ITEMS} tickers` },
        { status: 400 }
      );
    }
    if (currentRows.some((row) => row.ticker === ticker)) {
      return NextResponse.json({ error: 'ticker already exists in watchlist' }, { status: 409 });
    }

    const isValid = await validateTicker(ticker, req);
    if (!isValid) {
      return NextResponse.json({ error: 'ticker is invalid' }, { status: 400 });
    }

    await supabaseRestFetch('/rest/v1/watchlist_items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        ticker,
        position: currentRows.length,
      }),
    });

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
    const message = err instanceof Error ? err.message : 'Failed to update watchlist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
