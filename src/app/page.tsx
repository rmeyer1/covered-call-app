'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { logError } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import StockForm from '@/components/StockForm';
import StockCard from '@/components/StockCard';
import type { Stock, SuggestionsData } from '@/types';

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionsData>>({});
  const [tickerInput, setTickerInput] = useState('');
  const [sharesInput, setSharesInput] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [darkMode, setDarkMode] = useState(true);
  const [whatIf, setWhatIf] = useState<Record<string, { daysAhead: number; otmFactors: number[] }>>({});

  useEffect(() => {
    const savedStocks = JSON.parse(localStorage.getItem('stocks') || '[]');
    setStocks(savedStocks);
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
  };

  const handleGetSuggestions = async (ticker: string) => {
    setLoading(prev => ({ ...prev, [ticker]: true }));
    try {
      const wi = whatIf[ticker] || { daysAhead: 35, otmFactors: [1.1, 1.15, 1.2] };
      const params = new URLSearchParams({ daysAhead: String(wi.daysAhead), otmFactors: wi.otmFactors.join(',') });
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

  const handleWhatIfChange = (ticker: string, next: { daysAhead: number; otmFactors: number[] }) => {
    setWhatIf(prev => ({ ...prev, [ticker]: next }));
    // After updating, fetch fresh suggestions with new params
    handleGetSuggestions(ticker);
  };

  // Sorting and yield helpers moved into SuggestionsTable component

  return (
    <div className={`bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen font-sans`}>
      <header className="bg-blue-600 dark:bg-gray-800 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl sm:text-2xl font-bold">Covered Call Strategy</h1>
        <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-gray-700 transition">
          {darkMode ? <Sun /> : <Moon />}
        </button>
      </header>

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
                  whatIf={whatIf[stock.ticker] || { daysAhead: 35, otmFactors: [1.1, 1.15, 1.2] }}
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
