import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';
import { getStockSnapshot } from '@/lib/alpaca';
import { logError } from '@/lib/logger';
import type { PortfolioHoldingRow, PortfolioHoldingSnapshot, PortfolioHoldingsResponse } from '@/types';

const USER_ID_HEADER = 'x-portfolio-user-id';

function resolveUserId(req: NextRequest): string | null {
  const headerUserId = req.headers.get(USER_ID_HEADER);
  if (headerUserId && headerUserId.trim()) return headerUserId.trim();
  const fallback = process.env.PORTFOLIO_DEFAULT_USER_ID;
  return fallback && fallback.trim() ? fallback.trim() : null;
}

function normalizeNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateStats(
  holdings: PortfolioHoldingRow[],
  snapshots?: Record<string, PortfolioHoldingSnapshot>
): PortfolioHoldingsResponse['stats'] {
  if (!holdings.length) return { totalValue: 0, totalCost: 0, totalGain: 0 };
  const totalValue = holdings.reduce((sum, holding) => {
    const livePrice = snapshots?.[holding.ticker]?.lastPrice ?? null;
    const value = livePrice ? livePrice * (holding.share_qty ?? 0) : holding.market_value ?? 0;
    return sum + value;
  }, 0);
  const totalCost = holdings.reduce(
    (sum, holding) => sum + (holding.cost_basis ?? 0) * (holding.share_qty ?? 0),
    0
  );
  const totalGain = totalValue - totalCost;
  return {
    totalValue,
    totalCost,
    totalGain,
  };
}

async function fetchSnapshots(
  tickers: string[]
): Promise<Record<string, PortfolioHoldingSnapshot>> {
  if (!tickers.length) return {};
  const unique = Array.from(new Set(tickers.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (ticker) => {
      try {
        const snapshot = await getStockSnapshot(ticker);
        const lastPrice = snapshot?.latestTrade?.p ?? snapshot?.dailyBar?.c ?? null;
        const prevClose = snapshot?.prevDailyBar?.c ?? snapshot?.dailyBar?.o ?? null;
        const change = lastPrice !== null && prevClose !== null ? lastPrice - prevClose : null;
        const changePercent =
          change !== null && prevClose ? (change === 0 ? 0 : change / prevClose) : null;
        return [
          ticker,
          {
            lastPrice,
            prevClose,
            change,
            changePercent,
            updatedAt: snapshot?.latestTrade?.t ?? snapshot?.dailyBar?.t ?? null,
          } satisfies PortfolioHoldingSnapshot,
        ] as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('portfolio.holdings.snapshot', { ticker, error: message });
        return null;
      }
    })
  );

  return entries.reduce<Record<string, PortfolioHoldingSnapshot>>((acc, entry) => {
    if (!entry) return acc;
    const [ticker, snapshot] = entry;
    acc[ticker] = snapshot;
    return acc;
  }, {});
}

export async function GET(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const includeLive = req.nextUrl.searchParams.get('live') !== 'false';
    const encodedUserId = encodeURIComponent(userId);
    const rows = await supabaseRestFetch<PortfolioHoldingRow[] | (PortfolioHoldingRow & { share_qty: string })[]>(
      `/rest/v1/portfolio_holdings?user_id=eq.${encodedUserId}&order=updated_at.desc`
    );

    const holdings: PortfolioHoldingRow[] = Array.isArray(rows)
      ? rows
          .map((row) => {
            const shareQty = normalizeNullableNumber(row.share_qty);
            if (shareQty === null) return null;
            const costBasis = normalizeNullableNumber(row.cost_basis);
            const marketValue = normalizeNullableNumber(row.market_value);
            const confidence = normalizeNullableNumber(row.confidence);
            const optionStrike = normalizeNullableNumber(row.option_strike);
            const optionExpiration =
              typeof row.option_expiration === 'string' ? row.option_expiration : null;
            const optionRightRaw = row.option_right;
            const optionRight =
              optionRightRaw === 'put' || optionRightRaw === 'call' ? optionRightRaw : null;
            const formatted: PortfolioHoldingRow = {
              id: row.id,
              user_id: row.user_id,
              ticker: row.ticker,
              share_qty: shareQty,
              type: row.type ?? null,
              option_strike: optionStrike,
              option_expiration: optionExpiration,
              option_right: optionRight,
              cost_basis: costBasis,
              market_value: marketValue,
              confidence,
              source: row.source ?? null,
              upload_id: row.upload_id ?? null,
              draft_id: row.draft_id ?? null,
              created_at: row.created_at,
              updated_at: row.updated_at,
            };
            return formatted;
          })
          .filter((row): row is PortfolioHoldingRow => row !== null)
      : [];

    const snapshots = includeLive ? await fetchSnapshots(holdings.map((holding) => holding.ticker)) : undefined;

    const payload: PortfolioHoldingsResponse = {
      holdings,
      stats: calculateStats(holdings, snapshots),
      snapshots,
    };

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load holdings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface HoldingPayload {
  id?: string | null;
  ticker?: string | null;
  shareQty?: number | string | null;
  assetType?: string | null;
  type?: string | null;
  optionStrike?: number | string | null;
  optionExpiration?: string | null;
  optionRight?: string | null;
  costBasis?: number | string | null;
  marketValue?: number | string | null;
  confidence?: number | string | null;
  source?: string | null;
  uploadId?: string | null;
  draftId?: string | null;
}

function normalizeNumberInput(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toHoldingRow(body: HoldingPayload, userId: string): PortfolioHoldingRow | null {
  const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
  if (!ticker) return null;
  const shareQty = normalizeNumberInput(body.shareQty);
  if (shareQty === null) return null;
  const rawType =
    typeof body.type === 'string'
      ? body.type
      : typeof body.assetType === 'string'
        ? body.assetType
        : '';
  const type = rawType.toLowerCase() === 'option' ? 'option' : 'equity';
  const costBasis = normalizeNumberInput(body.costBasis);
  const marketValue = normalizeNumberInput(body.marketValue);
  const confidence = normalizeNumberInput(body.confidence);
  const optionStrike = normalizeNumberInput(body.optionStrike);
  const optionExpiration = typeof body.optionExpiration === 'string' ? body.optionExpiration : null;
  const optionRightRaw = typeof body.optionRight === 'string' ? body.optionRight : '';
  const optionRight =
    optionRightRaw.toLowerCase() === 'put'
      ? 'put'
      : optionRightRaw.toLowerCase() === 'call'
        ? 'call'
        : null;

  return {
    id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID(),
    user_id: userId,
    ticker,
    share_qty: shareQty,
    type,
    option_strike: optionStrike,
    option_expiration: optionExpiration,
    option_right: optionRight,
    cost_basis: costBasis,
    market_value: marketValue,
    confidence,
    source: typeof body.source === 'string' ? body.source : null,
    upload_id: typeof body.uploadId === 'string' ? body.uploadId : null,
    draft_id: typeof body.draftId === 'string' ? body.draftId : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const holdingsInput = Array.isArray(body?.holdings) ? (body.holdings as HoldingPayload[]) : [];
    if (!holdingsInput.length) {
      return NextResponse.json({ error: 'holdings array required' }, { status: 400 });
    }
    const replace = Boolean(body?.replace);

    const rows = holdingsInput
      .map((holding) => toHoldingRow(holding, userId))
      .filter((row): row is PortfolioHoldingRow => row !== null);
    if (!rows.length) {
      return NextResponse.json({ error: 'holdings missing required fields' }, { status: 400 });
    }

    if (replace) {
      await supabaseRestFetch(`/rest/v1/portfolio_holdings?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    }

    await supabaseRestFetch(`/rest/v1/portfolio_holdings?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save holdings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
