"use client";

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useStockDetails } from '@/hooks/useStockDetails';
import { deriveStockDetailsView } from '@/lib/stocks/derive';
import StockDetailsTabs from '@/components/StockDetailsTabs';
import { USER_HEADER_KEY, USER_ID_STORAGE_KEY } from '@/lib/portfolio-drafts';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return currencyFormatter.format(value);
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

const RANGE_TABS = ['1D', '1W', '1M', '3M', '1Y', '5Y'] as const;

function SparklineChart({ points }: { points?: number[] }) {
  if (!points || points.length < 2) {
    return <div className="h-40 w-full rounded-xl bg-gray-100 dark:bg-gray-800" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 480;
  const height = 160;
  const step = width / (points.length - 1);
  const coords = points
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
  const up = points[points.length - 1] >= points[0];
  const stroke = up ? '#16a34a' : '#dc2626';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
      />
    </svg>
  );
}

type SearchResult = {
  ticker: string;
  name?: string | null;
  logoUrl?: string | null;
};

export default function StockDetailsPage() {
  const params = useParams<{ ticker?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTicker = Array.isArray(params?.ticker) ? params?.ticker[0] : params?.ticker;
  const ticker = rawTicker?.toUpperCase() ?? '';
  const { details, error, isLoading, reload } = useStockDetails(ticker);
  const view = deriveStockDetailsView(details);
  const [activeRange, setActiveRange] = useState<(typeof RANGE_TABS)[number]>('1D');
  const [userId, setUserId] = useState<string | null>(null);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SearchResult | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const fromWatchlist =
    searchParams?.get('from') === 'watchlist' || searchParams?.get('watchlist') === '1';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
      if (stored && stored.trim()) {
        setUserId(stored);
        return;
      }
      const generated = crypto.randomUUID();
      localStorage.setItem(USER_ID_STORAGE_KEY, generated);
      setUserId(generated);
    } catch (err) {
      console.error('Failed to resolve user id', err);
    }
  }, []);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setMetaLoading(true);
    fetch(`/api/stocks/search?query=${encodeURIComponent(ticker)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { results?: SearchResult[] };
        const match = data?.results?.find((item) => item.ticker === ticker) ?? data?.results?.[0] ?? null;
        return match ?? null;
      })
      .then((result) => {
        if (cancelled) return;
        setMeta(result);
      })
      .catch(() => {
        if (cancelled) return;
        setMeta(null);
      })
      .finally(() => {
        if (cancelled) return;
        setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const handleRemove = async () => {
    if (!userId || !ticker) return;
    const confirmed = window.confirm(`Remove ${ticker} from your watchlist?`);
    if (!confirmed) return;
    setWatchlistLoading(true);
    setWatchlistError(null);
    try {
      const res = await fetch(`/api/watchlist/${encodeURIComponent(ticker)}`, {
        method: 'DELETE',
        headers: { [USER_HEADER_KEY]: userId },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to remove (${res.status})`);
      }
      router.push('/watchlist');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove from watchlist';
      setWatchlistError(message);
    } finally {
      setWatchlistLoading(false);
    }
  };

  const summary = details?.summary;
  const changePercent = summary?.changePercent ?? null;
  const changeClass = (changePercent ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600';
  const logoUrl = meta?.logoUrl ?? null;

  const chartPoints = useMemo(() => {
    const ranges = summary?.sparklineRanges;
    const rangePoints = ranges?.[activeRange];
    if (rangePoints && rangePoints.length >= 2) return rangePoints;
    return summary?.sparkline ?? [];
  }, [summary?.sparkline, summary?.sparklineRanges, activeRange]);

  return (
    <main className="bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/watchlist" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft size={16} /> Back
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt={`${ticker} logo`}
                    width={56}
                    height={56}
                    className="h-14 w-14 object-contain"
                    unoptimized
                  />
                ) : (
                  <span className="text-xl font-semibold text-blue-600">{ticker[0] ?? '—'}</span>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {metaLoading ? 'Loading…' : meta?.name ?? 'Stock'}
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold">{ticker || '—'}</h1>
              </div>
            </div>
          </div>
          {fromWatchlist && (
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleRemove}
                disabled={watchlistLoading}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-60"
              >
                <Trash2 size={16} /> Remove from watchlist
              </button>
              {watchlistError && <p className="text-xs text-rose-600">{watchlistError}</p>}
            </div>
          )}
        </header>

        <section className="mt-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Last price</p>
              <div className="text-3xl font-semibold">{formatCurrency(summary?.lastPrice ?? null)}</div>
              <p className={`text-sm ${changeClass}`}>
                {formatCurrency(summary?.change ?? null)} ({formatPercent(changePercent)})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {RANGE_TABS.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setActiveRange(range)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    activeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <SparklineChart points={chartPoints} />
          </div>
          {summary?.asOf && (
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">As of {new Date(summary.asOf).toLocaleString()}</p>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <StockDetailsTabs
            symbol={ticker}
            summary={view?.summary ?? null}
            volatility={view?.volatility ?? null}
            fundamentals={view?.fundamentals ?? null}
            headlines={view?.headlines ?? []}
            warnings={view?.warnings ?? []}
            sources={view?.sources}
            isLoading={isLoading}
            error={error}
            onRetry={reload}
          />
        </section>
      </div>
    </main>
  );
}
