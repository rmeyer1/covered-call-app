import { mapHoldingRows } from '@/lib/portfolio';
import { parseNumber } from '@/lib/portfolio-ocr';
import type {
  DraftRow,
  PortfolioHolding,
  PortfolioHoldingsResponse,
  RemoteDraft,
  Stock,
} from '@/types';

export const USER_ID_STORAGE_KEY = 'portfolio.userId';
export const USER_HEADER_KEY = 'x-portfolio-user-id';

function deriveCostBasisPerShare(
  costBasis: number | null | undefined,
  marketValue: number | null | undefined,
  shares: number | null | undefined
): number | null {
  const hasCost = typeof costBasis === 'number' && Number.isFinite(costBasis) && costBasis > 0;
  const hasTotals = shares && shares > 0 && marketValue !== null && marketValue !== undefined;
  const perShareFromTotal =
    hasTotals && shares ? (marketValue as number) / shares : null;

  // If stored cost looks wildly higher than what totals imply, trust totals instead (handles K/M OCR).
  if (hasCost && perShareFromTotal && costBasis! > perShareFromTotal * 5) {
    return Number.isFinite(perShareFromTotal) && perShareFromTotal > 0 ? perShareFromTotal : costBasis ?? null;
  }

  if (hasCost) return costBasis as number;
  if (perShareFromTotal && Number.isFinite(perShareFromTotal) && perShareFromTotal > 0) {
    return perShareFromTotal;
  }
  return costBasis ?? null;
}

function withDerivedCostBasisDraft(draft: DraftRow): DraftRow {
  const derived = deriveCostBasisPerShare(draft.costBasis, draft.marketValue, draft.shares);
  if (derived === draft.costBasis) return draft;
  return {
    ...draft,
    costBasis: derived,
    costBasisSource: draft.costBasisSource ?? 'derived',
  };
}

export function applyDerivedCostBasisToDrafts(drafts: DraftRow[]): DraftRow[] {
  return drafts.map((draft) => withDerivedCostBasisDraft(draft));
}

export function mergeCostBasisFromHistory(
  drafts: DraftRow[],
  holdings: PortfolioHolding[]
): DraftRow[] {
  if (!holdings.length) return drafts;
  const historyMap = new Map(
    holdings.map((holding) => [holding.ticker?.toUpperCase?.() ?? '', holding])
  );

  return drafts.map((draft) => {
    const tickerKey = draft.ticker?.toUpperCase?.() ?? '';
    const existing = tickerKey ? historyMap.get(tickerKey) : undefined;
    if (!existing) return draft;

    // Prefer cost derived from the draft's totals; fall back to OCR; then history.
    const derivedFromDraftTotals = deriveCostBasisPerShare(draft.costBasis, draft.marketValue, draft.shares);
    const costBasis = derivedFromDraftTotals ?? draft.costBasis ?? existing.costBasis ?? null;

    const marketValue =
      draft.marketValue ??
      (costBasis && draft.shares ? costBasis * draft.shares : existing.marketValue ?? null);
    const optionStrike = draft.optionStrike ?? existing.optionStrike ?? null;
    const optionExpiration = draft.optionExpiration ?? existing.optionExpiration ?? null;
    const optionRight = draft.optionRight ?? existing.optionRight ?? null;
    return {
      ...draft,
      assetType: draft.assetType ?? existing.type ?? 'equity',
      optionStrike,
      optionExpiration,
      optionRight,
      costBasis,
      costBasisSource: draft.costBasisSource ?? (draft.costBasis ? 'ocr' : existing.costBasis ? 'history' : undefined),
      marketValue,
    };
  });
}

function withDerivedCostBasisHolding(holding: PortfolioHolding): PortfolioHolding {
  const derived = deriveCostBasisPerShare(holding.costBasis, holding.marketValue, holding.shareQty);
  if (derived === holding.costBasis) return holding;
  return {
    ...holding,
    costBasis: derived,
  };
}

export function applyDerivedCostBasisToHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return holdings.map((holding) => withDerivedCostBasisHolding(holding));
}

function applySnapshotsToHoldings(
  holdings: PortfolioHolding[],
  snapshots?: PortfolioHoldingsResponse['snapshots']
): PortfolioHolding[] {
  if (!snapshots) return holdings;
  return holdings.map((holding) => {
    const snapshot = holding.ticker ? snapshots?.[holding.ticker] : undefined;
    if (!snapshot) return holding;
    const livePrice = snapshot.lastPrice ?? null;
    const liveValue =
      typeof livePrice === 'number' && Number.isFinite(livePrice) ? livePrice * (holding.shareQty ?? 0) : null;
    const positionCost =
      holding.costBasis && holding.shareQty ? holding.costBasis * holding.shareQty : null;
    const liveGain =
      liveValue !== null && positionCost !== null ? liveValue - positionCost : null;
    const liveGainPercent =
      liveGain !== null && positionCost ? liveGain / positionCost : null;
    return {
      ...holding,
      livePrice,
      liveValue,
      liveGain,
      liveGainPercent,
    };
  });
}

export function calculateStatsFromHoldings(
  holdings: PortfolioHolding[]
): PortfolioHoldingsResponse['stats'] {
  if (!holdings.length) {
    return {
      totalValue: 0,
      totalCost: 0,
      totalGain: 0,
    };
  }

  const totalValue = holdings.reduce(
    (sum, holding) => sum + (holding.liveValue ?? holding.marketValue ?? 0),
    0
  );
  const totalCost = holdings.reduce((sum, holding) => {
    const perShare = holding.costBasis ?? 0;
    return sum + perShare * (holding.shareQty ?? 0);
  }, 0);
  const totalGain = totalValue - totalCost;

  return {
    totalValue,
    totalCost,
    totalGain,
  };
}

function createDraftId(): string {
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatConfidence(confidence?: number | null) {
  if (!confidence && confidence !== 0) return '—';
  return `${Math.round(confidence * 100)}%`;
}

export function isDraftReady(draft: DraftRow): boolean {
  return (
    Boolean(draft.ticker) &&
    typeof draft.shares === 'number' &&
    Number.isFinite(draft.shares) &&
    draft.shares > 0
  );
}

export function loadDraftsLocal(): DraftRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('portfolio.drafts');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftRow[];
    return applyDerivedCostBasisToDrafts(parsed);
  } catch (err) {
    console.error('Failed to read drafts', err);
    return [];
  }
}

export function persistDraftsLocal(drafts: DraftRow[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('portfolio.drafts', JSON.stringify(drafts));
  } catch (err) {
    console.error('Failed to persist drafts', err);
  }
}

export function mergeStocksFromDrafts(drafts: DraftRow[]) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('stocks');
    const existing: Stock[] = raw ? JSON.parse(raw) : [];
    const byTicker = new Map(existing.map((stock) => [stock.ticker, stock]));
    drafts.forEach((draft) => {
      if (!draft.selected) return;
      if (!draft.ticker || !draft.shares || Number.isNaN(draft.shares)) return;
      if (draft.assetType === 'option') return;
      byTicker.set(draft.ticker, {
        ticker: draft.ticker,
        shares: Math.round(draft.shares),
      });
    });
    const merged = Array.from(byTicker.values());
    localStorage.setItem('stocks', JSON.stringify(merged));
  } catch (err) {
    console.error('Failed to merge stocks', err);
  }
}

export async function fetchHoldings(userId: string): Promise<{
  holdings: PortfolioHolding[];
  stats?: PortfolioHoldingsResponse['stats'];
}> {
  const res = await fetch('/api/portfolio/holdings', {
    headers: { [USER_HEADER_KEY]: userId },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      const parsed = text ? (JSON.parse(text) as { error?: string }) : null;
      message = parsed?.error ?? message;
    } catch {
      // ignore parse errors and rely on raw response text
    }
    throw new Error(message || `Failed to load holdings (${res.status})`);
  }
  const data = (await res.json()) as PortfolioHoldingsResponse;
  const rows = Array.isArray(data?.holdings) ? data.holdings : [];
  const mapped = mapHoldingRows(rows);
  const withDerived = applyDerivedCostBasisToHoldings(mapped);
  const hydrated = applySnapshotsToHoldings(withDerived, data?.snapshots);
  return {
    holdings: hydrated,
    stats: calculateStatsFromHoldings(hydrated),
  };
}

export async function saveDraftsRemote(
  drafts: DraftRow[],
  replace = false,
  userId: string | null = null
) {
  if (!userId) return;
  try {
    if (!drafts.length) {
      await fetch('/api/portfolio/drafts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ ids: [], userId }),
      });
    } else {
      await fetch('/api/portfolio/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ drafts, replace, userId }),
      });
    }
  } catch (error) {
    console.error('Failed to sync drafts to Supabase', error);
  }
}

export async function loadDraftsRemote(userId: string | null): Promise<DraftRow[] | null> {
  if (!userId) return null;
  try {
    const res = await fetch('/api/portfolio/drafts', {
      headers: { [USER_HEADER_KEY]: userId },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.drafts)) return [];
    const mapped = data.drafts.map((draft: RemoteDraft) => ({
      id: draft.id ?? createDraftId(),
      ticker: draft.ticker ?? '',
      shares:
        typeof draft.share_qty === 'number'
          ? draft.share_qty
          : parseNumber(String(draft.share_qty ?? '')),
      assetType: draft.asset_type ?? 'equity',
      optionStrike:
        typeof draft.option_strike === 'number'
          ? draft.option_strike
          : parseNumber(String(draft.option_strike ?? '')),
      optionExpiration: draft.option_expiration ?? null,
      optionRight: draft.option_right ?? null,
      costBasis:
        typeof draft.cost_basis === 'number'
          ? draft.cost_basis
          : parseNumber(String(draft.cost_basis ?? '')),
      marketValue:
        typeof draft.market_value === 'number'
          ? draft.market_value
          : parseNumber(String(draft.market_value ?? '')),
      confidence:
        typeof draft.confidence === 'number'
          ? draft.confidence
          : parseNumber(String(draft.confidence ?? '')),
      source: draft.source ?? undefined,
      selected: Boolean(draft.selected ?? true),
    }));
    return applyDerivedCostBasisToDrafts(mapped);
  } catch (err) {
    console.error('Failed to load drafts from Supabase', err);
    return null;
  }
}
