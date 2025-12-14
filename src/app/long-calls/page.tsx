"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import axios from 'axios';
import LongCallsForm from '@/components/LongCallsForm';
import LongCallsControls from '@/components/LongCallsControls';
import LongCallsTable from '@/components/LongCallsTable';
import { DEFAULT_EXPIRY_SELECTION, deriveSelectionFromDays, normalizeExpirySelection, selectionToQueryParams } from '@/lib/expirations';
import type { ExpirySelection, LongCallData } from '@/types';

type Moneyness = 'ITM' | 'ATM' | 'OTM';

interface Tracked {
  ticker: string;
}

type PrefState = { expiry: ExpirySelection; moneyness: Moneyness };

const createDefaultPref = (): PrefState => ({
  expiry: { ...DEFAULT_EXPIRY_SELECTION },
  moneyness: 'ATM',
});

const parsePrefsStorage = (raw: unknown): Record<string, PrefState> => {
  if (!raw || typeof raw !== 'object') return {};
  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, PrefState>>((acc, [ticker, value]) => {
    if (!value || typeof value !== 'object') return acc;
    const entry = value as { expiry?: ExpirySelection; daysAhead?: number; moneyness?: unknown };
    const expiry = entry.expiry
      ? { ...normalizeExpirySelection(entry.expiry, DEFAULT_EXPIRY_SELECTION) }
      : typeof entry.daysAhead === 'number'
        ? { ...deriveSelectionFromDays(entry.daysAhead) }
        : { ...DEFAULT_EXPIRY_SELECTION };
    const m = typeof entry.moneyness === 'string' ? entry.moneyness.toUpperCase() : null;
    acc[ticker] = {
      expiry,
      moneyness: (m === 'ITM' || m === 'ATM' || m === 'OTM') ? (m as Moneyness) : 'ATM',
    };
    return acc;
  }, {});
};

export default function LongCallsPage() {
  const [items, setItems] = useState<Tracked[]>([]);
  const [data, setData] = useState<Record<string, LongCallData>>({});
  const [tickerInput, setTickerInput] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [prefs, setPrefs] = useState<Record<string, PrefState>>({});
  const debounceTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('longcalls.items') || '[]');
    const savedPrefs = JSON.parse(localStorage.getItem('longcalls.prefs') || '{}');
    setItems(saved);
    setPrefs(parsePrefsStorage(savedPrefs));
  }, []);

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((id) => clearTimeout(id));
      debounceTimers.current = {};
    };
  }, []);

  const saveItems = (next: Tracked[]) => {
    setItems(next);
    localStorage.setItem('longcalls.items', JSON.stringify(next));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = tickerInput.trim().toUpperCase();
    if (!t) return;
    if (!items.find((x) => x.ticker === t)) {
      const next = [...items, { ticker: t }];
      saveItems(next);
    }
    setTickerInput('');
  };

  const handleRemove = (ticker: string) => {
    const next = items.filter((x) => x.ticker !== ticker);
    saveItems(next);
    setData((d) => {
      const copy = { ...d } as Record<string, LongCallData>;
      delete copy[ticker];
      return copy;
    });
    setPrefs((p) => {
      const copy = { ...p } as Record<string, PrefState>;
      delete copy[ticker];
      localStorage.setItem('longcalls.prefs', JSON.stringify(copy));
      return copy;
    });
  };

  const fetchData = useCallback(async (ticker: string, override?: PrefState) => {
    setLoading((l) => ({ ...l, [ticker]: true }));
    try {
      const pref = override || prefs[ticker] || createDefaultPref();
      const query = selectionToQueryParams(pref.expiry);
      query.moneyness = pref.moneyness;
      const params = new URLSearchParams(query);
      const res = await axios.get(`/api/long-calls/${ticker}?${params.toString()}`);
      setData((d) => ({ ...d, [ticker]: res.data }));
    } catch (err) {
      console.error(err);
      alert('Failed to load long calls data.');
    } finally {
      setLoading((l) => ({ ...l, [ticker]: false }));
    }
  }, [prefs]);

  const handlePrefsChange = (ticker: string, next: PrefState) => {
    const payload: PrefState = {
      expiry: { ...next.expiry },
      moneyness: next.moneyness,
    };
    setPrefs((p) => {
      const copy = { ...p, [ticker]: payload };
      localStorage.setItem('longcalls.prefs', JSON.stringify(copy));
      return copy;
    });
    const existing = debounceTimers.current[ticker];
    if (existing) clearTimeout(existing);
    debounceTimers.current[ticker] = window.setTimeout(() => {
      fetchData(ticker, payload);
      delete debounceTimers.current[ticker];
    }, 250);
  };

  // Autofetch for saved items
  useEffect(() => {
    if (!items.length) return;
    items.forEach(({ ticker }) => {
      if (!data[ticker] && !loading[ticker]) {
        fetchData(ticker);
      }
    });
  }, [items, prefs, data, loading, fetchData]);

  return (
    <div className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen">
      <main className="p-2 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <LongCallsForm tickerInput={tickerInput} onTickerChange={setTickerInput} onSubmit={handleAdd} />
          {items.map(({ ticker }) => {
            const entry = data[ticker];
            const logoUrl = entry?.logoUrl ?? null;
            const pref = prefs[ticker] ?? createDefaultPref();
            return (
              <div key={ticker} className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                  <div className="flex items-center gap-3">
                    {logoUrl && (
                      <Image
                        src={logoUrl}
                        alt={`${ticker} logo`}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-full border border-gray-200 bg-white object-contain p-1 dark:border-gray-700"
                        loading="lazy"
                        unoptimized
                      />
                    )}
                    <div className="text-xl sm:text-2xl font-bold text-blue-500 dark:text-blue-400">{ticker}</div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => fetchData(ticker)}
                      disabled={!!loading[ticker]}
                      className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition duration-300 disabled:bg-gray-500"
                    >
                      {loading[ticker] ? 'Loading...' : 'Refresh'}
                    </button>
                    <button
                      onClick={() => handleRemove(ticker)}
                      className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition duration-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <LongCallsControls
                  expiry={pref.expiry}
                  moneyness={pref.moneyness}
                  onChange={(next) => handlePrefsChange(ticker, next)}
                />

                {data[ticker] && (
                  <LongCallsTable currentPrice={data[ticker].currentPrice} suggestions={data[ticker].suggestions} />
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
