"use client";

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { logError } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import StockForm from '@/components/StockForm';
import StockCard from '@/components/StockCard';
import { DEFAULT_EXPIRY_SELECTION, deriveSelectionFromDays, normalizeExpirySelection, selectionToQueryParams } from '@/lib/expirations';
import type { Stock, SuggestionsData, ExpirySelection } from '@/types';

type WhatIfState = { expiry: ExpirySelection; otmFactors: number[] };

const DEFAULT_OTM_FACTORS = [1.1, 1.15, 1.2] as const;

const createDefaultWhatIf = (): WhatIfState => ({
  expiry: { ...DEFAULT_EXPIRY_SELECTION },
  otmFactors: [...DEFAULT_OTM_FACTORS],
});

const parseWhatIfStorage = (raw: unknown): Record<string, WhatIfState> => {
  if (!raw || typeof raw !== 'object') return {};
  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, WhatIfState>>((acc, [ticker, value]) => {
    if (!value || typeof value !== 'object') return acc;
    const entry = value as {
      expiry?: ExpirySelection;
      daysAhead?: number;
      otmFactors?: unknown;
    };
    const expiry = entry.expiry
      ? { ...normalizeExpirySelection(entry.expiry, DEFAULT_EXPIRY_SELECTION) }
      : typeof entry.daysAhead === 'number'
        ? { ...deriveSelectionFromDays(entry.daysAhead) }
        : { ...DEFAULT_EXPIRY_SELECTION };
    const factorsSource = Array.isArray(entry.otmFactors) ? entry.otmFactors : [];
    const factors = factorsSource
      .map((factor) => (typeof factor === 'number' ? factor : Number(factor)))
      .filter((factor): factor is number => Number.isFinite(factor) && factor > 0);
    acc[ticker] = {
      expiry,
      otmFactors: factors.length ? factors : [...DEFAULT_OTM_FACTORS],
    };
    return acc;
  }, {});
};

export default function CoveredCallsPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionsData>>({});
  const [tickerInput, setTickerInput] = useState('');
  const [sharesInput, setSharesInput] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [whatIf, setWhatIf] = useState<Record<string, WhatIfState>>({});
  const debounceTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const savedStocks = JSON.parse(localStorage.getItem('stocks') || '[]');
    setStocks(savedStocks);
    const savedWhatIf = JSON.parse(localStorage.getItem('whatIf') || '{}');
    setWhatIf(parseWhatIfStorage(savedWhatIf));
  }, []);

  // Clear any pending debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((id) => clearTimeout(id));
      debounceTimers.current = {};
    };
  }, []);

  // Auto-fetch suggestions on page load (and when saved settings change)
  useEffect(() => {
    if (!stocks || stocks.length === 0) return;
    stocks.forEach(({ ticker }) => {
      const hasData = !!suggestions[ticker];
      const isLoading = !!loading[ticker];
      if (!hasData && !isLoading) {
        const wi = whatIf[ticker] || createDefaultWhatIf();
        handleGetSuggestions(ticker, wi);
      }
    });
  }, [stocks, whatIf]);

  const saveStocks = (newStocks: Stock[]) => {
    localStorage.setItem('stocks', JSON.stringify(newStocks));
    setStocks(newStocks);
  };

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (tickerInput && sharesInput && parseInt(sharesInput) >= 100) {
      const newStock: Stock = {
        ticker: tickerInput.toUpperCase(),
        shares: parseInt(sharesInput),
      };
      saveStocks([...stocks, newStock]);
      setTickerInput('');
      setSharesInput('');
    } else {
      alert('Please enter a valid ticker and at least 100 shares.');
    }
  };

  const handleRemoveStock = (tickerToRemove: string) => {
    const newStocks = stocks.filter(stock => stock.ticker !== tickerToRemove);
    saveStocks(newStocks);
    const newSuggestions = { ...suggestions };
    delete newSuggestions[tickerToRemove];
    setSuggestions(newSuggestions);
    // Clear persisted what-if options for removed ticker
    setWhatIf(prev => {
      const next = { ...prev } as Record<string, WhatIfState>;
      delete next[tickerToRemove];
      localStorage.setItem('whatIf', JSON.stringify(next));
      return next;
    });
  };

  const handleGetSuggestions = async (ticker: string, override?: WhatIfState) => {
    setLoading(prev => ({ ...prev, [ticker]: true }));
    try {
      const wi = override || whatIf[ticker] || createDefaultWhatIf();
      const query = selectionToQueryParams(wi.expiry);
      query.otmFactors = wi.otmFactors.join(',');
      const params = new URLSearchParams(query);
      const response = await axios.get(`/api/suggestions/${ticker}?${params.toString()}`);
      setSuggestions(prev => ({ ...prev, [ticker]: response.data }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const details = {
          message: error.message,
          url: error.config?.url,
          method: error.config?.method,
          params: error.config?.params,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        } as const;
        logError('getSuggestions (Axios)', details);
        try { logError('getSuggestions (Axios) stringified', JSON.stringify(details)); } catch {}
        const status = error.response?.status;
        const serverMsg = (error.response?.data as any)?.error || error.message;
        alert(`Failed to get suggestions: ${status ?? ''} ${serverMsg}`.trim());
      } else {
        logError('getSuggestions (Unknown)', error);
        alert('Failed to get suggestions. See console for details.');
      }
    } finally {
      setLoading(prev => ({ ...prev, [ticker]: false }));
    }
  };

  const handleWhatIfChange = (ticker: string, next: WhatIfState) => {
    const payload: WhatIfState = {
      expiry: { ...next.expiry },
      otmFactors: [...next.otmFactors],
    };
    setWhatIf(prev => {
      const updated = { ...prev, [ticker]: payload };
      localStorage.setItem('whatIf', JSON.stringify(updated));
      return updated;
    });
    // Debounce rapid toggles to avoid excessive API calls
    const existing = debounceTimers.current[ticker];
    if (existing) clearTimeout(existing);
    debounceTimers.current[ticker] = window.setTimeout(() => {
      handleGetSuggestions(ticker, payload);
      delete debounceTimers.current[ticker];
    }, 250);
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen font-sans">
      <main className="p-2 sm:p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <StockForm
              tickerInput={tickerInput}
              sharesInput={sharesInput}
              onTickerChange={setTickerInput}
              onSharesChange={setSharesInput}
              onSubmit={handleAddStock}
            />
          </motion.div>

          <h2 className="text-xl sm:text-2xl font-bold mb-4">My Stocks</h2>
          <AnimatePresence>
            {stocks.map((stock) => (
              <motion.div
                key={stock.ticker}
                layout
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -50, scale: 0.9 }}
                transition={{ duration: 0.4 }}
              >
                <StockCard
                  stock={stock}
                  loading={!!loading[stock.ticker]}
                  data={suggestions[stock.ticker]}
                  onGetSuggestions={handleGetSuggestions}
                  onRemove={handleRemoveStock}
                  whatIf={whatIf[stock.ticker] || createDefaultWhatIf()}
                  onWhatIfChange={handleWhatIfChange}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
