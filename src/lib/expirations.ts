import { addDays, closestTo, parseISO } from 'date-fns';
import type { ExpirySelection, ExpiryMode } from '@/types';

export const DEFAULT_DAYS_AHEAD = 35;

export const MODE_INTERVAL_DAYS: Record<Exclude<ExpiryMode, 'custom'>, number> = {
  weekly: 7,
  monthly: 30,
  yearly: 365,
};

export const DEFAULT_EXPIRY_SELECTION: ExpirySelection = { mode: 'weekly', count: 5 };

export function getExpirationFromSymbol(symbol: string, ticker: string): string {
  const datePart = symbol.substring(ticker.length, ticker.length + 6);
  const year = `20${datePart.substring(0, 2)}`;
  const month = datePart.substring(2, 4);
  const day = datePart.substring(4, 6);
  return `${year}-${month}-${day}`;
}

export function isExpirySelection(value: unknown): value is ExpirySelection {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as ExpirySelection;
  return typeof maybe.mode === 'string';
}

export function sanitizeCount(count: number | undefined, fallback = 1): number {
  if (!Number.isFinite(count)) return fallback;
  const next = Math.floor(count as number);
  return next > 0 ? next : fallback;
}

export function normalizeExpirySelection(
  input: number | ExpirySelection | null | undefined,
  fallback: ExpirySelection = DEFAULT_EXPIRY_SELECTION
): ExpirySelection {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    return { mode: 'custom', daysAhead: Math.round(input) };
  }

  if (isExpirySelection(input)) {
    const { mode } = input;
    if (mode === 'custom') {
      const days = typeof input.daysAhead === 'number' && input.daysAhead > 0
        ? Math.round(input.daysAhead)
        : fallback.daysAhead ?? DEFAULT_DAYS_AHEAD;
      return { mode, daysAhead: days };
    }
    const count = sanitizeCount(input.count, fallback.count ?? 1);
    return { mode, count };
  }

  return { ...fallback };
}

export function selectionToDaysAhead(
  selection: ExpirySelection | null | undefined,
  defaultDaysAhead = DEFAULT_DAYS_AHEAD
): number {
  if (!selection) return defaultDaysAhead;
  if (selection.mode === 'custom') {
    const days = selection.daysAhead ?? defaultDaysAhead;
    return days > 0 ? days : defaultDaysAhead;
  }
  const interval = MODE_INTERVAL_DAYS[selection.mode];
  const count = sanitizeCount(selection.count, DEFAULT_EXPIRY_SELECTION.count ?? 1);
  const target = interval * count;
  return target > 0 ? target : defaultDaysAhead;
}

export function selectionToTargetDate(
  selection: ExpirySelection | null | undefined,
  baseDate = new Date()
): Date {
  const daysAhead = selectionToDaysAhead(selection);
  return addDays(baseDate, daysAhead);
}

type OptionSymbolCarrier = { symbol: string };

const isOptionSymbolCarrier = (value: unknown): value is OptionSymbolCarrier =>
  Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { symbol?: unknown }).symbol === 'string'
  );

export function extractExpirationDates(
  optionChain: unknown[],
  ticker: string,
  { includePast = false }: { includePast?: boolean } = {}
): Date[] {
  const today = new Date();
  const seen = new Set<string>();
  const expirations: Date[] = [];

  optionChain.forEach((option) => {
    if (!isOptionSymbolCarrier(option)) return;
    const iso = getExpirationFromSymbol(option.symbol, ticker);
    if (seen.has(iso)) return;
    seen.add(iso);
    const date = parseISO(iso);
    if (Number.isNaN(date.getTime())) return;
    if (!includePast && date <= today) return;
    expirations.push(date);
  });

  expirations.sort((a, b) => a.getTime() - b.getTime());
  return expirations;
}

export function closestExpiration(
  expirations: Date[],
  target: Date,
  { today = new Date() }: { today?: Date } = {}
): Date | null {
  const future = expirations.filter((d) => d > today);
  if (!future.length) return null;
  const closest = closestTo(target, future);
  return closest instanceof Date ? closest : null;
}

export function pickExpirationDate(
  optionChain: unknown[],
  ticker: string,
  selection: ExpirySelection | null | undefined,
  fallbackDaysAhead = DEFAULT_DAYS_AHEAD
): Date | null {
  const expirations = extractExpirationDates(optionChain, ticker);
  if (!expirations.length) return null;
  const targetDate = selectionToTargetDate(selection, new Date());
  const picked = closestExpiration(expirations, targetDate);
  if (picked) return picked;
  const fallbackTarget = addDays(new Date(), fallbackDaysAhead);
  return closestExpiration(expirations, fallbackTarget);
}

export function deriveSelectionFromDays(daysAhead: number): ExpirySelection {
  if (!Number.isFinite(daysAhead) || daysAhead <= 0) {
    return { ...DEFAULT_EXPIRY_SELECTION };
  }

  const rounded = Math.round(daysAhead);

  const weeks = Math.round(rounded / MODE_INTERVAL_DAYS.weekly);
  if (weeks >= 1 && weeks <= 12) {
    const candidate = weeks * MODE_INTERVAL_DAYS.weekly;
    if (Math.abs(candidate - rounded) <= 2) {
      return { mode: 'weekly', count: weeks };
    }
  }

  const months = Math.round(rounded / MODE_INTERVAL_DAYS.monthly);
  if (months >= 1 && months <= 12) {
    const candidate = months * MODE_INTERVAL_DAYS.monthly;
    if (Math.abs(candidate - rounded) <= 5) {
      return { mode: 'monthly', count: months };
    }
  }

  const years = Math.round(rounded / MODE_INTERVAL_DAYS.yearly);
  if (years >= 1 && years <= 5) {
    const candidate = years * MODE_INTERVAL_DAYS.yearly;
    if (Math.abs(candidate - rounded) <= 45) {
      return { mode: 'yearly', count: years };
    }
  }

  return { mode: 'custom', daysAhead: rounded };
}

export function nextExpirationDateForChain(
  optionChain: unknown[],
  ticker: string,
  daysAhead = DEFAULT_DAYS_AHEAD
): Date | null {
  const targetSelection: ExpirySelection = { mode: 'custom', daysAhead };
  return pickExpirationDate(optionChain, ticker, targetSelection, daysAhead);
}

const MODES: ExpiryMode[] = ['weekly', 'monthly', 'yearly', 'custom'];

export function selectionToQueryParams(
  selection: ExpirySelection,
  { includeLegacyDaysAhead = true }: { includeLegacyDaysAhead?: boolean } = {}
): Record<string, string> {
  const normalized = normalizeExpirySelection(selection, DEFAULT_EXPIRY_SELECTION);
  const params: Record<string, string> = { expiryMode: normalized.mode };
  if (normalized.mode === 'custom') {
    params.expiryDaysAhead = String(normalized.daysAhead ?? DEFAULT_DAYS_AHEAD);
  } else {
    params.expiryCount = String(normalized.count ?? 1);
  }
  if (includeLegacyDaysAhead) {
    params.daysAhead = String(selectionToDaysAhead(normalized));
  }
  return params;
}

export function parseSelectionFromParams(
  params: URLSearchParams,
  fallback: ExpirySelection = DEFAULT_EXPIRY_SELECTION
): ExpirySelection {
  const modeParam = params.get('expiryMode');
  const legacyDays = params.get('daysAhead');
  if (modeParam && MODES.includes(modeParam as ExpiryMode)) {
    const mode = modeParam as ExpiryMode;
    if (mode === 'custom') {
      const rawDays = Number(params.get('expiryDaysAhead') ?? legacyDays ?? DEFAULT_DAYS_AHEAD);
      return normalizeExpirySelection({ mode: 'custom', daysAhead: rawDays }, fallback);
    }
    const rawCount = Number(params.get('expiryCount'));
    if (Number.isFinite(rawCount) && rawCount > 0) {
      return normalizeExpirySelection({ mode, count: rawCount }, fallback);
    }
    if (legacyDays) {
      return deriveSelectionFromDays(Number(legacyDays));
    }
    return normalizeExpirySelection({ mode, count: fallback.count ?? 1 }, fallback);
  }

  if (legacyDays) {
    return deriveSelectionFromDays(Number(legacyDays));
  }

  return { ...fallback };
}
