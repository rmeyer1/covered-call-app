"use client";

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import LongCallsForm from '@/components/LongCallsForm';
import CspControls from '@/components/CspControls';
import CspTable from '@/components/CspTable';
import type { CashSecuredPutData } from '@/types';

type Moneyness = 'OTM' | 'ITM';
type Basis = 'bid' | 'mid';

interface Tracked { ticker: string }

export default function CashSecuredPutsPage() {
  const [items, setItems] = useState<Tracked[]>([]);
  const [data, setData] = useState<Record<string, CashSecuredPutData>>({});
  const [tickerInput, setTickerInput] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [prefs, setPrefs] = useState<Record<string, { daysAhead: number; moneyness: Moneyness; basis: Basis }>>({});
  const debounceTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('csp.items') || '[]');
    const savedPrefs = JSON.parse(localStorage.getItem('csp.prefs') || '{}');
    setItems(saved);
    if (savedPrefs && typeof savedPrefs === 'object') setPrefs(savedPrefs);
  }, []);

  useEffect(() => () => { Object.values(debounceTimers.current).forEach(clearTimeout); }, []);

  const saveItems = (next: Tracked[]) => {
    setItems(next);
    localStorage.setItem('csp.items', JSON.stringify(next));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = tickerInput.trim().toUpperCase();
    if (!t) return;
    if (!items.find((x) => x.ticker === t)) saveItems([...items, { ticker: t }]);
    setTickerInput('');
  };

  const handleRemove = (ticker: string) => {
    saveItems(items.filter((x) => x.ticker !== ticker));
    setData((d) => { const c = { ...d } as any; delete c[ticker]; return c; });
    setPrefs((p) => { const c = { ...p } as any; delete c[ticker]; localStorage.setItem('csp.prefs', JSON.stringify(c)); return c; });
  };

  const fetchData = async (ticker: string, override?: { daysAhead: number; moneyness: Moneyness; basis: Basis }) => {
    setLoading((l) => ({ ...l, [ticker]: true }));
    try {
      const pref = override || prefs[ticker] || { daysAhead: 35, moneyness: 'OTM' as Moneyness, basis: 'bid' as Basis };
      const params = new URLSearchParams({ daysAhead: String(pref.daysAhead), moneyness: pref.moneyness });
      const res = await axios.get(`/api/cash-secured-puts/${ticker}?${params.toString()}`);
      setData((d) => ({ ...d, [ticker]: res.data }));
    } catch (e) {
      console.error(e);
      alert('Failed to load CSP data');
    } finally {
      setLoading((l) => ({ ...l, [ticker]: false }));
    }
  };

  const handlePrefsChange = (ticker: string, next: { daysAhead: number; moneyness: Moneyness; basis: Basis }) => {
    setPrefs((p) => { const c = { ...p, [ticker]: next }; localStorage.setItem('csp.prefs', JSON.stringify(c)); return c; });
    const id = debounceTimers.current[ticker]; if (id) clearTimeout(id);
    debounceTimers.current[ticker] = window.setTimeout(() => { fetchData(ticker, next); delete debounceTimers.current[ticker]; }, 250);
  };

  useEffect(() => { if (!items.length) return; items.forEach(({ ticker }) => { if (!data[ticker] && !loading[ticker]) fetchData(ticker); }); }, [items, prefs]);

  return (
    <div className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen">
      <main className="p-2 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <LongCallsForm tickerInput={tickerInput} onTickerChange={setTickerInput} onSubmit={handleAdd} />
          {items.map(({ ticker }) => (
            <div key={ticker} className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                <div className="mb-2 sm:mb-0">
                  <span className="text-xl sm:text-2xl font-bold text-blue-500 dark:text-blue-400">{ticker}</span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={() => fetchData(ticker)} disabled={!!loading[ticker]} className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition disabled:bg-gray-500">{loading[ticker] ? 'Loading...' : 'Refresh'}</button>
                  <button onClick={() => handleRemove(ticker)} className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition">Remove</button>
                </div>
              </div>
              <CspControls
                daysAhead={(prefs[ticker]?.daysAhead ?? 35)}
                moneyness={(prefs[ticker]?.moneyness ?? 'OTM') as Moneyness}
                basis={(prefs[ticker]?.basis ?? 'bid') as Basis}
                onChange={(n) => handlePrefsChange(ticker, n)}
              />
              {data[ticker] && (
                <CspTable
                  currentPrice={data[ticker].currentPrice}
                  suggestions={data[ticker].suggestions}
                  basis={(prefs[ticker]?.basis ?? 'bid') as Basis}
                />
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
