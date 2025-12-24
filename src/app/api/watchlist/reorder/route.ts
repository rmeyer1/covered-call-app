import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';
import {
  MAX_WATCHLIST_ITEMS,
  fetchWatchlistRows,
  mapWatchlistRows,
  normalizeTicker,
  resolveUserId,
} from '../helpers';

export async function PATCH(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const rawTickers: unknown[] = Array.isArray(body?.tickers) ? body.tickers : [];
    const normalizedTickers = rawTickers
      .map((ticker) => normalizeTicker(ticker))
      .filter((ticker): ticker is string => Boolean(ticker));

    if (!normalizedTickers.length) {
      return NextResponse.json({ error: 'tickers array is required' }, { status: 400 });
    }
    if (normalizedTickers.length > MAX_WATCHLIST_ITEMS) {
      return NextResponse.json(
        { error: `watchlist is limited to ${MAX_WATCHLIST_ITEMS} tickers` },
        { status: 400 }
      );
    }

    const uniqueTickers: string[] = [];
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    normalizedTickers.forEach((ticker) => {
      if (seen.has(ticker)) {
        duplicates.add(ticker);
        return;
      }
      seen.add(ticker);
      uniqueTickers.push(ticker);
    });
    if (duplicates.size) {
      return NextResponse.json(
        { error: `duplicate tickers not allowed: ${Array.from(duplicates).join(', ')}` },
        { status: 400 }
      );
    }

    const existingRows = await fetchWatchlistRows(userId);
    const existingTickers = new Set(existingRows.map((row) => row.ticker));
    const missingFromExisting = uniqueTickers.filter((ticker) => !existingTickers.has(ticker));
    const missingFromPayload = existingRows
      .map((row) => row.ticker)
      .filter((ticker) => !uniqueTickers.includes(ticker));

    if (missingFromExisting.length || missingFromPayload.length) {
      return NextResponse.json(
        { error: 'tickers must match current watchlist before reordering' },
        { status: 400 }
      );
    }

    const updates = uniqueTickers.map((ticker, index) => ({
      user_id: userId,
      ticker,
      position: index,
    }));

    await supabaseRestFetch('/rest/v1/watchlist_items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(updates),
    });

    const rows = await fetchWatchlistRows(userId);
    return NextResponse.json({ items: mapWatchlistRows(rows) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reorder watchlist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
