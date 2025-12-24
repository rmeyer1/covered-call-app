"use client";

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Search, Sparkles, Plus, X, Loader2, GripVertical, Trash2, RefreshCw } from 'lucide-react';
import { USER_HEADER_KEY, USER_ID_STORAGE_KEY } from '@/lib/portfolio-drafts';
import type { StockDetailsSummary, WatchlistItem } from '@/types';

type SearchResult = {
  ticker: string;
  name?: string | null;
  logoUrl?: string | null;
  lastPrice?: number | null;
  changePercent?: number | null;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function formatPrice(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return currencyFormatter.format(value);
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function Sparkline({ points }: { points?: number[] }) {
  if (!points || points.length < 2) {
    return <div className="h-6 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 80;
  const height = 24;
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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
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

export default function WatchlistPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsMap, setDetailsMap] = useState<Record<string, StockDetailsSummary | null>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addingTicker, setAddingTicker] = useState<string | null>(null);
  const [draggingTicker, setDraggingTicker] = useState<string | null>(null);

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
      console.error('Failed to resolve watchlist user id', err);
    }
  }, []);

  const existingTickers = useMemo(
    () => new Set(items.map((item) => item.ticker.toUpperCase())),
    [items]
  );

  const maxReached = items.length >= 50;

  const fetchDetails = async (tickers: string[]) => {
    if (!tickers.length) {
      setDetailsMap({});
      return;
    }
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const entries = await Promise.all(
        tickers.map(async (ticker) => {
          const res = await fetch(`/api/stocks/${encodeURIComponent(ticker)}/details`);
          if (!res.ok) return [ticker, null] as const;
          const data = (await res.json()) as { summary?: StockDetailsSummary };
          return [ticker, data?.summary ?? null] as const;
        })
      );
      setDetailsMap(
        entries.reduce<Record<string, StockDetailsSummary | null>>((acc, [ticker, summary]) => {
          acc[ticker] = summary;
          return acc;
        }, {})
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load watchlist data';
      setDetailsError(message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const refreshWatchlist = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/watchlist', {
        headers: { [USER_HEADER_KEY]: userId },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to load watchlist (${res.status})`);
      }
      const data = (await res.json()) as { items?: WatchlistItem[] };
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);
      await fetchDetails(nextItems.map((item) => item.ticker));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load watchlist';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void refreshWatchlist();
  }, [userId]);

  useEffect(() => {
    if (!items.length) {
      setDetailsMap({});
      return;
    }
    void fetchDetails(items.map((item) => item.ticker));
  }, [items]);

  useEffect(() => {
    if (!searchOpen) return;
    if (!query.trim()) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?query=${encodeURIComponent(query)}`);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Search failed (${res.status})`);
        }
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Search failed';
        setSearchError(message);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, searchOpen]);

  const handleAdd = async (ticker: string) => {
    if (!userId) return;
    setAddingTicker(ticker);
    setSearchError(null);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to add (${res.status})`);
      }
      setToast('Added to watchlist');
      setSearchOpen(false);
      setQuery('');
      setResults([]);
      setItems(Array.isArray(data.items) ? data.items : []);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add ticker';
      setSearchError(message);
    } finally {
      setAddingTicker(null);
    }
  };

  const handleRemove = async (ticker: string) => {
    if (!userId) return;
    const confirmed = window.confirm(`Remove ${ticker} from your watchlist?`);
    if (!confirmed) return;
    setError(null);
    try {
      const res = await fetch(`/api/watchlist/${encodeURIComponent(ticker)}`, {
        method: 'DELETE',
        headers: { [USER_HEADER_KEY]: userId },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to remove (${res.status})`);
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove ticker';
      setError(message);
    }
  };

  const handleReorder = async (nextItems: WatchlistItem[]) => {
    if (!userId) return;
    setItems(nextItems);
    try {
      const res = await fetch('/api/watchlist/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ tickers: nextItems.map((item) => item.ticker) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to reorder (${res.status})`);
      }
      setItems(Array.isArray(data.items) ? data.items : nextItems);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder watchlist';
      setError(message);
      await refreshWatchlist();
    }
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return items;
    const next = [...items];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    return next.map((item, index) => ({ ...item, position: index }));
  };

  return (
    <main className="bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-300 font-semibold">
              My Symbols
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold">Watchlist</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Keep tickers you care about in one place. Search to add symbols you want to track.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-blue-600 text-white shadow hover:bg-blue-500 active:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 transition"
            aria-label="Search for symbols"
          >
            <Search />
          </button>
        </header>

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => refreshWatchlist()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          </div>
        )}
        {detailsError && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{detailsError}</span>
              <button
                type="button"
                onClick={() => fetchDetails(items.map((item) => item.ticker))}
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                <RefreshCw size={14} /> Retry data
              </button>
            </div>
          </div>
        )}

        <section className="mt-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Watchlist</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">{items.length} tickers</span>
            </div>
            <div className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Sparkles size={14} />
              <span>{loading || detailsLoading ? 'Refreshing…' : 'Search to add'}</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-4 sm:px-6 py-6 bg-gray-50 dark:bg-gray-900 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-300 shadow-sm mb-3">
                <Search />
              </div>
              <p className="text-base font-semibold">Add symbols to your watchlist</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Tap the search icon to find tickers and start building your personalized list.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((item, index) => {
                const summary = detailsMap[item.ticker];
                const isLoadingRow = detailsLoading && !summary;
                const changeClass =
                  (summary?.changePercent ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600';
                const badgeTone =
                  (summary?.changePercent ?? 0) >= 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700';
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-4 px-4 sm:px-6 py-4 group ${
                      draggingTicker === item.ticker ? 'opacity-60' : ''
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!draggingTicker) return;
                      const fromIndex = items.findIndex((row) => row.ticker === draggingTicker);
                      const toIndex = index;
                      const next = moveItem(fromIndex, toIndex);
                      setDraggingTicker(null);
                      void handleReorder(next);
                    }}
                    onDragEnd={() => setDraggingTicker(null)}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 flex-1">
                      <button
                        type="button"
                        className="hidden sm:inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-gray-600"
                        aria-label="Drag to reorder"
                        draggable
                        onDragStart={(e) => {
                          setDraggingTicker(item.ticker);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDraggingTicker(null)}
                      >
                        <GripVertical size={16} />
                      </button>
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold flex items-center justify-center shadow-sm overflow-hidden">
                        {item.logoUrl ? (
                          <Image
                            src={item.logoUrl}
                            alt={`${item.ticker} logo`}
                            width={48}
                            height={48}
                            className="h-12 w-12 object-contain bg-white"
                            unoptimized
                          />
                        ) : (
                          item.ticker[0]
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-base">{item.ticker}</div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.name ?? 'Watchlist item'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-auto">
                      <div className="hidden sm:block">
                        {isLoadingRow ? (
                          <div className="h-6 w-20 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                        ) : (
                          <Sparkline points={summary?.sparkline} />
                        )}
                      </div>
                      <div className="text-right">
                        {isLoadingRow ? (
                          <>
                            <div className="h-4 w-16 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse mb-2" />
                            <div className="h-4 w-12 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                          </>
                        ) : (
                          <>
                            <div className="font-semibold text-sm">{formatPrice(summary?.lastPrice)}</div>
                            <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone}`}>
                              <span className={changeClass}>{formatPercent(summary?.changePercent)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.ticker)}
                        className="inline-flex items-center justify-center h-9 w-9 rounded-full text-rose-600 hover:bg-rose-50"
                        aria-label={`Remove ${item.ticker}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-6 duration-200">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-300 font-semibold">
                  Add to watchlist
                </p>
                <h2 className="text-lg font-semibold">Search symbols</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery('');
                  setResults([]);
                  setSearchError(null);
                }}
                className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                aria-label="Close search"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by ticker or company name"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              {searchError && (
                <p className="mt-2 text-xs text-red-600">{searchError}</p>
              )}
              {maxReached && (
                <p className="mt-2 text-xs text-amber-600">Watchlist limit reached (50). Remove a ticker to add more.</p>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {searchLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </div>
              ) : results.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  {query.trim() ? 'No matches found.' : 'Start typing to search.'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {results.map((result) => {
                    const inList = existingTickers.has(result.ticker.toUpperCase());
                    const changeClass =
                      (result.changePercent ?? 0) >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600';
                    return (
                      <div key={result.ticker} className="flex items-center justify-between px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                            {result.logoUrl ? (
                              <Image
                                src={result.logoUrl}
                                alt={`${result.ticker} logo`}
                                width={40}
                                height={40}
                                className="h-10 w-10 object-contain"
                                unoptimized
                              />
                            ) : (
                              <span className="text-sm font-semibold text-gray-500">{result.ticker[0]}</span>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold">{result.ticker}</div>
                            <div className="text-xs text-gray-500">{result.name ?? 'Unknown company'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right text-xs text-gray-600 dark:text-gray-300">
                            <div className="font-semibold">{formatPrice(result.lastPrice)}</div>
                            <div className={changeClass}>{formatPercent(result.changePercent)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAdd(result.ticker)}
                            disabled={maxReached || inList || addingTicker === result.ticker}
                            className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-400"
                            aria-label={`Add ${result.ticker}`}
                          >
                            {addingTicker === result.ticker ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Plus size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 text-white px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
