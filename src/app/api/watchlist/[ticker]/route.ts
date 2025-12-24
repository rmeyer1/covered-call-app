import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';
import { fetchWatchlistRows, mapWatchlistRows, normalizeTicker, resolveUserId } from '../helpers';

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
    return NextResponse.json({ items: mapWatchlistRows(rows) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete watchlist item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
