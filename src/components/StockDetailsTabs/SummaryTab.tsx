import type { SummaryTileView } from '@/lib/stocks/derive';

interface SummaryTabProps {
  symbol: string;
  data: SummaryTileView | null;
  source?: string;
  warnings: string[];
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return currencyFormatter.format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return numberFormatter.format(value);
}

function RangeBar({
  label,
  range,
}: {
  label: string;
  range: SummaryTileView['rangeToday'] | SummaryTileView['range52Week'];
}) {
  if (!range) return null;
  const percent = 'percentile' in range ? range.percentile ?? null : null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>L {formatCurrency(range.low)}</span>
        <span>H {formatCurrency(range.high)}</span>
      </div>
      <div className="mt-2 h-1 rounded bg-gray-200 dark:bg-gray-700">
        {percent !== null && percent !== undefined && (
          <div
            className="h-full rounded bg-blue-500"
            style={{ width: `${Math.min(100, Math.max(0, percent * 100))}%` }}
          />
        )}
      </div>
      {'current' in range && range.current !== null && range.current !== undefined && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">Current {formatCurrency(range.current)}</p>
      )}
    </div>
  );
}

export default function SummaryTab({ symbol, data, source, warnings }: SummaryTabProps) {
  if (!data) {
    return <div className="p-6 text-sm text-gray-500">Summary data unavailable.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{symbol}</p>
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(data.price)}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {formatCurrency(data.change)} ({formatPercent(data.changePercent)})
        </p>
        {data.marketStatus && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Market status: {data.marketStatus}</p>
        )}
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Source: {source ?? 'alpaca.snapshot'}</p>
        {warnings.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-amber-600 dark:text-amber-400">
            {warnings.map((warning) => (
              <li key={warning}>⚠️ {warning}</li>
            ))}
          </ul>
        )}
      </header>

      <RangeBar label="Today" range={data.rangeToday} />
      <RangeBar label="52 Week" range={data.range52Week} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Volume</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">Today: {formatNumber(data.volume?.today ?? null)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">30D Avg: {formatNumber(data.volume?.average30Day ?? null)}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Bid / Ask</h4>
          {data.bidAsk ? (
            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(data.bidAsk.bidPrice ?? null)} × {formatNumber(data.bidAsk.bidSize ?? null)} — {formatCurrency(data.bidAsk.askPrice ?? null)} × {formatNumber(data.bidAsk.askSize ?? null)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">Unavailable</p>
          )}
        </div>
      </div>
    </div>
  );
}
