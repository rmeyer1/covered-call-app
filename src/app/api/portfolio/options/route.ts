import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';
import { getOptionChainByType } from '@/lib/alpaca';
import { getExpirationFromSymbol } from '@/lib/options';
import type { PortfolioOptionRow, PortfolioOptionsResponse } from '@/types';

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

function normalizeExpiration(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const mdY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    let year = Number(mdY[3]);
    if (year < 100) year += 2000;
    if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`;
  }
  return null;
}

type OptionRowWithMeta = PortfolioOptionRow & { _normalizedExpiration: string | null };

export async function GET(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const includeLive = req.nextUrl.searchParams.get('live') !== 'false';
    const encodedUserId = encodeURIComponent(userId);
    const rows = await supabaseRestFetch<PortfolioOptionRow[] | (PortfolioOptionRow & { share_qty: string })[]>(
      `/rest/v1/portfolio_options?user_id=eq.${encodedUserId}&order=updated_at.desc`
    );

    const chainCache = new Map<string, Awaited<ReturnType<typeof getOptionChainByType>>>();
    const fetchChain = async (ticker: string, right: 'call' | 'put') => {
      const key = `${ticker}|${right}`;
      const cached = chainCache.get(key);
      if (cached) return cached;
      const chain = await getOptionChainByType(ticker, right);
      chainCache.set(key, chain);
      return chain;
    };

    const options: OptionRowWithMeta[] = Array.isArray(rows)
      ? rows.flatMap((row) => {
          const shareQty = normalizeNullableNumber(row.share_qty);
          if (shareQty === null) return [];
          const costBasis = normalizeNullableNumber(row.cost_basis);
          const marketValue = normalizeNullableNumber(row.market_value);
          const confidence = normalizeNullableNumber(row.confidence);
          const optionStrike = normalizeNullableNumber(row.option_strike);
          const optionExpiration =
            typeof row.option_expiration === 'string' ? row.option_expiration : null;
          const normalizedExpiration = normalizeExpiration(optionExpiration);
          const optionRightRaw = row.option_right;
          const optionRight =
            optionRightRaw === 'put' || optionRightRaw === 'call' ? optionRightRaw : null;
          return [
            {
              ...row,
              share_qty: shareQty,
              cost_basis: costBasis,
              market_value: marketValue,
              confidence,
              option_strike: optionStrike,
              option_expiration: optionExpiration,
              option_right: optionRight,
              buy_sell: row.buy_sell ?? null,
              _normalizedExpiration: normalizedExpiration,
            } satisfies OptionRowWithMeta,
          ];
        })
      : [];

    if (includeLive) {
      await Promise.all(
        options.map(async (option) => {
          if (!option.option_right || !option.option_strike || !option._normalizedExpiration) return;
          try {
            const chain = await fetchChain(option.ticker, option.option_right);
            const match = chain.find((contract) => {
              const exp = getExpirationFromSymbol(contract.symbol, option.ticker);
              return exp === option._normalizedExpiration && contract.strike_price === option.option_strike;
            });
            if (!match) return;
            const bid = typeof match.latestQuote?.bp === 'number' ? match.latestQuote?.bp ?? null : null;
            const ask = typeof match.latestQuote?.ap === 'number' ? match.latestQuote?.ap ?? null : null;
            const mid = bid !== null && ask !== null ? (bid + ask) / 2 : ask ?? bid ?? null;
            if (mid !== null && Number.isFinite(mid)) {
              option.market_value = mid;
            }
          } catch {
            // ignore live lookup errors and fall back to stored value
          }
        })
      );
    }

    const normalizedOptions: PortfolioOptionRow[] = options.map(({ _normalizedExpiration, ...row }) => row);
    const payload: PortfolioOptionsResponse = { options: normalizedOptions };
    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load options';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface OptionPayload {
  id?: string | null;
  ticker?: string | null;
  shareQty?: number | string | null;
  buySell?: 'buy' | 'sell' | null;
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

function toOptionRow(body: OptionPayload, userId: string): PortfolioOptionRow | null {
  const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
  if (!ticker) return null;
  const shareQty = normalizeNumberInput(body.shareQty);
  if (shareQty === null) return null;
  const optionStrike = normalizeNumberInput(body.optionStrike);
  const optionExpiration = typeof body.optionExpiration === 'string' ? body.optionExpiration : null;
  const optionRightRaw = typeof body.optionRight === 'string' ? body.optionRight : '';
  const optionRight =
    optionRightRaw.toLowerCase() === 'put'
      ? 'put'
      : optionRightRaw.toLowerCase() === 'call'
        ? 'call'
        : null;
  const buySellRaw = typeof body.buySell === 'string' ? body.buySell : '';
  const buySell = buySellRaw === 'sell' || buySellRaw === 'buy' ? buySellRaw : null;
  const costBasis = normalizeNumberInput(body.costBasis);
  const marketValue = normalizeNumberInput(body.marketValue);
  const confidence = normalizeNumberInput(body.confidence);

  return {
    id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID(),
    user_id: userId,
    ticker,
    share_qty: shareQty,
    option_strike: optionStrike,
    option_expiration: optionExpiration,
    option_right: optionRight,
    buy_sell: buySell,
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

    const optionsInput = Array.isArray(body?.options) ? (body.options as OptionPayload[]) : [];
    if (!optionsInput.length) {
      return NextResponse.json({ error: 'options array required' }, { status: 400 });
    }
    const replace = Boolean(body?.replace);

    const rows = optionsInput
      .map((option) => toOptionRow(option, userId))
      .filter((row): row is PortfolioOptionRow => row !== null);
    if (!rows.length) {
      return NextResponse.json({ error: 'options missing required fields' }, { status: 400 });
    }

    if (replace) {
      await supabaseRestFetch(`/rest/v1/portfolio_options?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    }

    await supabaseRestFetch(`/rest/v1/portfolio_options?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save options';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown) => typeof id === 'string' && id.trim())
      : typeof body?.id === 'string'
        ? [body.id]
        : [];
    if (!ids.length) {
      return NextResponse.json({ error: 'option id(s) required' }, { status: 400 });
    }
    const encodedUserId = encodeURIComponent(userId);
    const encodedIds = ids.map((id) => encodeURIComponent(id)).join(',');
    await supabaseRestFetch(
      `/rest/v1/portfolio_options?id=in.(${encodedIds})&user_id=eq.${encodedUserId}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      }
    );
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete option';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
