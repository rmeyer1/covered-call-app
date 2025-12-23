import { mapHoldingRows, mapOptionRows } from '@/lib/portfolio';
import { parseNumber } from '@/lib/portfolio-ocr';
import type {
  DraftRow,
  PortfolioHolding,
  PortfolioHoldingsResponse,
  PortfolioOption,
  PortfolioOptionsResponse,
  RemoteDraft,
  Stock,
} from '@/types';

export const USER_ID_STORAGE_KEY = 'portfolio.userId';
export const USER_HEADER_KEY = 'x-portfolio-user-id';

export function applyDerivedCostBasisToDrafts(drafts: DraftRow[]): DraftRow[] {
  return drafts;
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

    // Prefer OCR cost basis; fall back to history.
    const costBasis = draft.costBasis ?? existing.costBasis ?? null;

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

export function applyDerivedCostBasisToHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return holdings;
}

export function draftGroupingKey(draft: DraftRow): string {
  const base = `${draft.ticker?.toUpperCase?.() ?? ''}|${draft.assetType ?? 'equity'}`;
  if (draft.assetType !== 'option') return base;
  return `${base}|${draft.optionStrike ?? 'na'}|${draft.optionExpiration ?? 'na'}|${draft.optionRight ?? 'na'}`;
}

function aggregateCostBasis(
  drafts: DraftRow[]
): { costBasis: number | null; marketValue: number | null } {
  if (!drafts.length) return { costBasis: null, marketValue: null };
  const entries = drafts.filter((draft) => draft.costBasis !== null && draft.costBasis !== undefined);
  const totalShares = drafts.reduce((sum, draft) => sum + (draft.shares ?? 0), 0);
  if (entries.length && totalShares > 0) {
    const weightedCost = entries.reduce(
      (sum, draft) => sum + (draft.costBasis ?? 0) * (draft.shares ?? 0),
      0
    );
    const costBasis = weightedCost / totalShares;
    const marketValue = drafts.reduce((sum, draft) => {
      const value =
        draft.marketValue ??
        (draft.costBasis && draft.shares ? draft.costBasis * draft.shares : null);
      return sum + (value ?? 0);
    }, 0);
    return { costBasis, marketValue: marketValue || null };
  }

  if (entries.length) {
    const costBasis =
      entries.reduce((sum, draft) => sum + (draft.costBasis ?? 0), 0) / entries.length;
    const marketValue = drafts.reduce((sum, draft) => sum + (draft.marketValue ?? 0), 0) || null;
    return { costBasis, marketValue };
  }

  const inferredMarket =
    drafts.reduce((sum, draft) => sum + (draft.marketValue ?? 0), 0) || null;
  return { costBasis: null, marketValue: inferredMarket };
}

export function mergeDraftRows(
  drafts: DraftRow[],
  previousMerged?: DraftRow[]
): DraftRow[] {
  const byKey = new Map<string, DraftRow[]>();
  drafts.forEach((draft) => {
    const key = draftGroupingKey(draft);
    const group = byKey.get(key) ?? [];
    group.push(draft);
    byKey.set(key, group);
  });

  const previousMap = new Map((previousMerged ?? []).map((draft) => [draftGroupingKey(draft), draft]));

  const merged = Array.from(byKey.entries()).map(([key, group]) => {
    const previous = previousMap.get(key);
    const shares = group.reduce((sum, draft) => sum + (draft.shares ?? 0), 0);
    const confidence = Math.max(...group.map((draft) => draft.confidence ?? 0));
    const selected = group.some((draft) => draft.selected);
    const uploadNames = Array.from(
      new Set(group.map((draft) => draft.uploadName).filter(Boolean) as string[])
    );
    const { costBasis, marketValue } = aggregateCostBasis(group);
    const base: DraftRow = {
      id: previous?.id ?? key,
      ticker: group[0]?.ticker ?? '',
      shares,
      contracts: group.some((draft) => typeof draft.contracts === 'number')
        ? group.reduce((sum, draft) => sum + (draft.contracts ?? 0), 0)
        : undefined,
      buySell: group.map((draft) => draft.buySell).find(Boolean) ?? null,
      assetType: group[0]?.assetType ?? 'equity',
      optionStrike: group[0]?.optionStrike ?? null,
      optionExpiration: group[0]?.optionExpiration ?? null,
      optionRight: group[0]?.optionRight ?? null,
      costBasis,
      costBasisSource: previous?.costBasisSource ?? group[0]?.costBasisSource ?? 'derived',
      marketValue,
      confidence,
      source: previous?.source ?? group[0]?.source,
      parseMode: previous?.parseMode ?? group[0]?.parseMode,
      broker: group.map((draft) => draft.broker).find(Boolean) ?? previous?.broker ?? null,
      selected: previous?.selected ?? selected,
      uploadId: null,
      uploadName: uploadNames.length > 1 ? `Multiple (${uploadNames.length})` : uploadNames[0] ?? null,
    };
    if (previous) {
      return {
        ...base,
        selected: previous.selected,
        source: previous.source ?? base.source,
      };
    }
    return base;
  });

  return applyDerivedCostBasisToDrafts(merged);
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

export function isTickerFormatValid(ticker: string | null | undefined): boolean {
  if (!ticker) return false;
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return false;
  if (normalized.length > 6) return false;
  return /^[A-Z][A-Z0-9.-]*$/.test(normalized);
}

export function isOptionExpirationValid(expiration: string | null | undefined): boolean {
  if (!expiration) return false;
  const trimmed = expiration.trim();
  if (!trimmed) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return true;
  if (/^[A-Za-z]{3}\s+\d{1,2}(,\s*\d{2,4})?$/.test(trimmed)) return true;
  return false;
}

export function isDraftReady(draft: DraftRow): boolean {
  const isOption = draft.assetType === 'option';
  const contracts = draft.contracts ?? draft.shares;
  if (!isTickerFormatValid(draft.ticker)) return false;
  if (isOption) {
    if (!draft.optionStrike || draft.optionStrike <= 0) return false;
    if (!isOptionExpirationValid(draft.optionExpiration ?? null)) return false;
  }
  return (
    Boolean(draft.ticker) &&
    typeof (isOption ? contracts : draft.shares) === 'number' &&
    Number.isFinite(isOption ? (contracts as number) : (draft.shares as number)) &&
    (isOption ? (contracts as number) > 0 : (draft.shares as number) > 0)
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

export async function fetchOptions(userId: string): Promise<PortfolioOption[]> {
  const res = await fetch('/api/portfolio/options', {
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
    throw new Error(message || `Failed to load options (${res.status})`);
  }
  const data = (await res.json()) as PortfolioOptionsResponse;
  const rows = Array.isArray(data?.options) ? data.options : [];
  return mapOptionRows(rows);
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
      contracts:
        typeof draft.contract_qty === 'number'
          ? draft.contract_qty
          : parseNumber(String(draft.contract_qty ?? '')),
      buySell: draft.buy_sell ?? null,
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
