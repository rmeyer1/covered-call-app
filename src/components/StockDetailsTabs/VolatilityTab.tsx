import type { VolatilityTileView } from '@/lib/stocks/derive';

interface VolatilityTabProps {
  data: VolatilityTileView | null;
  source?: string;
}

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return percentFormatter.format(value);
}

export default function VolatilityTab({ data, source }: VolatilityTabProps) {
  if (!data) {
    return <div className="p-6 text-sm text-gray-500">Volatility data unavailable.</div>;
  }

  return (
    <div className="grid gap-6 p-6 sm:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Implied Volatility</h3>
        <p className="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">{formatPercent(data.currentIV)}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Range {formatPercent(data.ivLow)} — {formatPercent(data.ivHigh)}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Historical Vol</h3>
        <p className="mt-1 text-xl text-gray-900 dark:text-gray-100">{formatPercent(data.historicalVolatility)}</p>
      </div>
      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">IV Percentile</h4>
        <p className="mt-1 text-lg text-gray-900 dark:text-gray-100">{formatPercent(data.ivPercentile)}</p>
      </div>
      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">IV Rank</h4>
        <p className="mt-1 text-lg text-gray-900 dark:text-gray-100">{formatPercent(data.ivRank)}</p>
      </div>
      <div className="sm:col-span-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Source: {source ?? data.source}
          {data.updatedAt ? ` · Updated ${new Date(data.updatedAt).toLocaleString()}` : ''}
        </p>
      </div>
    </div>
  );
}

