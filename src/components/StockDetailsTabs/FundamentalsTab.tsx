import type { FundamentalsTileView } from '@/lib/stocks/derive';

interface FundamentalsTabProps {
  data: FundamentalsTileView | null;
  source?: string;
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export default function FundamentalsTab({ data, source }: FundamentalsTabProps) {
  if (!data) {
    return <div className="p-6 text-sm text-gray-500">Fundamentals unavailable.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Next earnings</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{data.nextEarningsDate ?? '—'}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Ex-dividend</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{data.exDividendDate ?? '—'}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Market cap</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatCurrency(data.marketCap ?? null)}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">P/E</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatNumber(data.peRatio ?? null)}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Float</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatNumber(data.float ?? null)}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Shares outstanding</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatNumber(data.sharesOutstanding ?? null)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Sector</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{data.sector ?? '—'}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Industry</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{data.industry ?? '—'}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Employees</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatNumber(data.employees ?? null)}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Beta</h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatNumber(data.beta ?? null)}</p>
        </div>
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Headquarters</h4>
        <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{data.headquarters ?? '—'}</p>
        {data.foundedYear && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Founded {data.foundedYear}</p>
        )}
      </div>

      {data.description && (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Profile</h4>
          <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-200">{data.description}</p>
          {data.website && (
            <a
              href={data.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline"
            >
              View more
            </a>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">Source: {source ?? 'alpaca.fundamentals'}</p>
    </div>
  );
}

