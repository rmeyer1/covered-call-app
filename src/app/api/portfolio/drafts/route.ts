import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestFetch } from '@/lib/supabase';

const USER_ID_HEADER = 'x-portfolio-user-id';

interface DraftPayload {
  id?: string | null;
  ticker?: string | null;
  shares?: number | string | null;
  contracts?: number | string | null;
  buySell?: 'buy' | 'sell' | null;
  assetType?: string | null;
  type?: string | null;
  optionStrike?: number | string | null;
  optionExpiration?: string | null;
  optionRight?: string | null;
  costBasis?: number | string | null;
  marketValue?: number | string | null;
  confidence?: number | string | null;
  source?: string | null;
  selected?: boolean | null;
  userId?: string | null;
}

interface DraftInsert {
  id?: string;
  ticker: string;
  share_qty: number | null;
  contract_qty?: number | null;
  buy_sell?: 'buy' | 'sell' | null;
  asset_type?: string | null;
  option_strike?: number | null;
  option_expiration?: string | null;
  option_right?: 'call' | 'put' | null;
  cost_basis: number | null;
  market_value: number | null;
  confidence: number | null;
  source: string | null;
  selected: boolean;
  user_id: string;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDraftInsert(draft: DraftPayload, userId: string): DraftInsert | null {
  const ticker = typeof draft.ticker === 'string' ? draft.ticker.trim().toUpperCase() : '';
  if (!ticker) return null;
  const id = typeof draft.id === 'string' && draft.id.trim() ? draft.id.trim() : undefined;
  const source = typeof draft.source === 'string' && draft.source.trim() ? draft.source.trim() : null;
  const rawType =
    typeof draft.type === 'string'
      ? draft.type
      : typeof draft.assetType === 'string'
        ? draft.assetType
        : null;
  const optionRight = typeof draft.optionRight === 'string' ? draft.optionRight.toLowerCase() : null;
  const buySell = typeof draft.buySell === 'string' ? draft.buySell.toLowerCase() : null;
  const contractQty = normalizeNumber(draft.contracts);
  const shareQty = normalizeNumber(draft.shares);
  const assetType = rawType === 'option' ? 'option' : 'equity';

  return {
    id,
    ticker,
    share_qty: assetType === 'option' ? contractQty ?? shareQty : shareQty,
    contract_qty: assetType === 'option' ? contractQty ?? shareQty : null,
    buy_sell: buySell === 'sell' || buySell === 'buy' ? buySell : null,
    asset_type: assetType,
    option_strike: normalizeNumber(draft.optionStrike),
    option_expiration: typeof draft.optionExpiration === 'string' ? draft.optionExpiration : null,
    option_right: optionRight === 'put' || optionRight === 'call' ? optionRight : null,
    cost_basis: normalizeNumber(draft.costBasis),
    market_value: normalizeNumber(draft.marketValue),
    confidence: normalizeNumber(draft.confidence),
    source,
    selected: draft.selected === undefined ? true : Boolean(draft.selected),
    user_id: userId,
  };
}

function resolveUserId(req: NextRequest, bodyUserId?: unknown): string | null {
  if (typeof bodyUserId === 'string' && bodyUserId.trim()) return bodyUserId.trim();
  const headerUserId = req.headers.get(USER_ID_HEADER);
  if (headerUserId && headerUserId.trim()) return headerUserId.trim();
  const fallback = process.env.PORTFOLIO_DEFAULT_USER_ID;
  return fallback && fallback.trim() ? fallback.trim() : null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    const drafts = await supabaseRestFetch(
      `/rest/v1/portfolio_drafts?order=created_at.desc&user_id=eq.${encodeURIComponent(userId)}`
    );
    return NextResponse.json({ drafts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch drafts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = resolveUserId(req, body?.userId);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    const drafts = Array.isArray(body?.drafts) ? (body.drafts as DraftPayload[]) : [];
    const replace = Boolean(body?.replace);
    if (!drafts.length) {
      return NextResponse.json({ error: 'drafts array required' }, { status: 400 });
    }
    const inserts = drafts
      .map((draft) => toDraftInsert(draft, userId))
      .filter((draft): draft is DraftInsert => draft !== null);
    if (!inserts.length) {
      return NextResponse.json({ error: 'drafts missing required fields' }, { status: 400 });
    }
    if (replace) {
      await supabaseRestFetch(`/rest/v1/portfolio_drafts?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    }
    await supabaseRestFetch('/rest/v1/portfolio_drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(inserts),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save drafts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = body?.ids ?? [];
    const userId = resolveUserId(req, body?.userId);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!ids.length) {
      await supabaseRestFetch(`/rest/v1/portfolio_drafts?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    } else {
      const filter = ids.map((id) => `id.eq.${id}`).join(',');
      const encodedFilter = encodeURIComponent(filter);
      await supabaseRestFetch(
        `/rest/v1/portfolio_drafts?user_id=eq.${encodeURIComponent(userId)}&or=(${encodedFilter})`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete drafts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
