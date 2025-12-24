import { NextRequest } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';
import type { WatchlistItem, WatchlistItemRow } from '@/types';

export const USER_ID_HEADER = 'x-portfolio-user-id';
export const MAX_WATCHLIST_ITEMS = 50;

export function resolveUserId(req: NextRequest): string | null {
  const headerUserId = req.headers.get(USER_ID_HEADER);
  if (headerUserId && headerUserId.trim()) return headerUserId.trim();
  const fallback = process.env.PORTFOLIO_DEFAULT_USER_ID;
  return fallback && fallback.trim() ? fallback.trim() : null;
}

export function normalizeTicker(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const ticker = raw.trim().toUpperCase();
  return ticker || null;
}

function normalizePosition(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function fetchWatchlistRows(userId: string): Promise<WatchlistItemRow[]> {
  const encodedUserId = encodeURIComponent(userId);
  const rows = await supabaseRestFetch<
    WatchlistItemRow[] | (WatchlistItemRow & { position: string | number })[]
  >(`/rest/v1/watchlist_items?user_id=eq.${encodedUserId}&order=position.asc,created_at.asc`);

  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
      if (!ticker) return null;
      return {
        id: row.id,
        user_id: row.user_id,
        ticker,
        position: normalizePosition(row.position),
        created_at: row.created_at,
      } satisfies WatchlistItemRow;
    })
    .filter((row): row is WatchlistItemRow => row !== null);
}

export function mapWatchlistRows(rows: WatchlistItemRow[]): WatchlistItem[] {
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    position: row.position,
    createdAt: row.created_at,
  }));
}

export function mapWatchlistRowsWithLogo(
  rows: WatchlistItemRow[],
  logoMap: Record<string, string | null>
): WatchlistItem[] {
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    position: row.position,
    createdAt: row.created_at,
    logoUrl: logoMap[row.ticker] ?? null,
  }));
}

export async function validateTicker(ticker: string, req: NextRequest): Promise<boolean> {
  try {
    const url = new URL('/api/stocks/validate', req.url);
    url.searchParams.set('symbols', ticker);
    const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
    if (!res.ok) return false;
    const payload = await res.json().catch(() => null);
    if (!payload || !Array.isArray(payload.valid)) return false;
    return payload.valid.includes(ticker);
  } catch {
    return false;
  }
}
