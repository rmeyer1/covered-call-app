import React, { useMemo } from 'react';
import type { ExpirySelection, ExpiryMode } from '@/types';
import {
  DEFAULT_EXPIRY_SELECTION,
  MODE_INTERVAL_DAYS,
  normalizeExpirySelection,
  selectionToDaysAhead,
} from '@/lib/expirations';

const MODE_LABELS: Record<Exclude<ExpiryMode, 'custom'>, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const MODE_RANGE: Record<Exclude<ExpiryMode, 'custom'>, number[]> = {
  weekly: Array.from({ length: 8 }, (_, i) => i + 1),
  monthly: Array.from({ length: 6 }, (_, i) => i + 1),
  yearly: Array.from({ length: 3 }, (_, i) => i + 1),
};

const toNonCustomMode = (mode: ExpiryMode): Exclude<ExpiryMode, 'custom'> =>
  (mode === 'custom' ? 'weekly' : mode);

const resolveMode = (
  current: ExpirySelection,
  fallback: ExpirySelection
): Exclude<ExpiryMode, 'custom'> =>
  current.mode === 'custom' ? toNonCustomMode(fallback.mode) : toNonCustomMode(current.mode);

interface Props {
  selection?: ExpirySelection | null;
  onChange: (next: ExpirySelection) => void;
  legacyDaysAhead?: number;
  className?: string;
}

function formatUnitLabel(mode: Exclude<ExpiryMode, 'custom'>, count: number) {
  const singular = mode === 'weekly' ? 'week' : mode === 'monthly' ? 'month' : 'year';
  const plural = `${singular}s`;
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function ExpirationSelector({ selection, onChange, legacyDaysAhead, className }: Props) {
  const fallback = useMemo(() => {
    if (typeof legacyDaysAhead === 'number' && legacyDaysAhead > 0) {
      return normalizeExpirySelection(legacyDaysAhead, DEFAULT_EXPIRY_SELECTION);
    }
    return { ...DEFAULT_EXPIRY_SELECTION };
  }, [legacyDaysAhead]);

  const normalized = useMemo(
    () => normalizeExpirySelection(selection ?? legacyDaysAhead ?? fallback, fallback),
    [selection, legacyDaysAhead, fallback]
  );

  const approxDays = selectionToDaysAhead(normalized);

  const handleModeClick = (mode: ExpiryMode) => {
    if (mode === normalized.mode) return;
    if (mode === 'custom') {
      const nextDays = normalized.mode === 'custom' ? normalized.daysAhead : approxDays;
      onChange({ mode: 'custom', daysAhead: nextDays });
      return;
    }
    const counts = MODE_RANGE[mode];
    const interval = MODE_INTERVAL_DAYS[mode];
    const suggested = Math.max(1, Math.round(approxDays / interval));
    const maxCount = counts[counts.length - 1];
    const normalizedSuggested = Math.min(maxCount, suggested);
    const defaultCount = counts.includes(normalizedSuggested)
      ? normalizedSuggested
      : counts[Math.min(counts.length - 1, Math.max(0, normalizedSuggested - 1))];
    onChange({ mode, count: defaultCount ?? 1 });
  };

  const handleCountChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCount = Number(event.target.value);
    if (!Number.isFinite(nextCount) || nextCount <= 0) return;
    const mode = normalized.mode === 'custom' ? 'weekly' : normalized.mode;
    onChange({ mode, count: nextCount });
  };

  const handleCustomDaysChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    const safeValue = Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
    onChange({ mode: 'custom', daysAhead: safeValue });
  };

  const renderCountSelector = () => {
    if (normalized.mode === 'custom') {
      return (
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <span>Days:</span>
          <input
            type="number"
            min={1}
            value={normalized.daysAhead ?? approxDays}
            onChange={handleCustomDaysChange}
            className="w-20 rounded border border-gray-400/40 bg-transparent px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
          />
        </label>
      );
    }

    const baseMode = resolveMode(normalized, fallback);
    const counts = MODE_RANGE[baseMode];
    const activeCount = normalized.count ?? fallback.count ?? 1;

    return (
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span>{MODE_LABELS[baseMode]} horizon:</span>
        <select
          value={activeCount}
          onChange={handleCountChange}
          className="rounded border border-gray-400/40 bg-transparent px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
        >
          {counts.map((count) => (
            <option key={count} value={count}>
              {formatUnitLabel(baseMode, count)}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400">Expiration:</div>
      {(['weekly', 'monthly', 'yearly'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => handleModeClick(mode)}
          className={`text-xs px-2 py-1 rounded border transition ${normalized.mode === mode ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
        >
          {MODE_LABELS[mode]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => handleModeClick('custom')}
        className={`text-xs px-2 py-1 rounded border transition ${normalized.mode === 'custom' ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
      >
        Custom
      </button>

      <div className="ml-2 flex items-center gap-2 whitespace-nowrap">
        {renderCountSelector()}
        <span className="text-xs text-gray-500 dark:text-gray-400">≈ {approxDays} days</span>
      </div>
    </div>
  );
}
