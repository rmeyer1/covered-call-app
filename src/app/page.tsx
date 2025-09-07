'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, TrendingUp, HelpCircle } from 'lucide-react';

interface Stock {
  ticker: string;
  shares: number;
}

interface Suggestion {
  otmPercent: number;
  strike: number;
  premium: number;
  delta: number;
  yieldMonthly: string;
  yieldAnnualized: string;
  expiration: string;
}

interface SuggestionsData {
  currentPrice: number;
  suggestions: Suggestion[];
}

type SortKey = 'otmPercent' | 'strike' | 'premium' | 'delta';

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionsData>>({});
  const [tickerInput, setTickerInput] = useState('');
  const [sharesInput, setSharesInput] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [showDeltaTooltip, setShowDeltaTooltip] = useState(false);

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
      const response = await axios.get(`/api/suggestions/${ticker}`);
      setSuggestions(prev => ({ ...prev, [ticker]: response.data }));
    } catch (error) {
      console.error('Error getting suggestions:', error);
      alert('Failed to get suggestions. Check the console for more details.');
    } finally {
      setLoading(prev => ({ ...prev, [ticker]: false }));
    }
  };

  const sortedSuggestions = (ticker: string) => {
    const data = suggestions[ticker];
    if (!data) return [];
    if (sortConfig !== null) {
      return [...data.suggestions].sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return data.suggestions;
  };

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getYieldColor = (yieldValue: string) => {
    const value = parseFloat(yieldValue);
    if (value > 10) return 'text-green-400';
    if (value > 5) return 'text-yellow-400';
    return 'text-red-400';
  };

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
            <form onSubmit={handleAddStock} className="mb-8 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value)}
                  placeholder="Ticker (e.g., AMD)"
                  required
                  className="flex-grow bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                />
                <input
                  type="number"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  placeholder="Shares (100+)"
                  min="100"
                  required
                  className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                />
                <button type="submit" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 sm:px-6 rounded-md transition duration-300 transform hover:scale-105">
                  Add Stock
                </button>
              </div>
            </form>
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
                className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg mb-6"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                  <div className="mb-4 sm:mb-0">
                    <span className="text-xl sm:text-2xl font-bold text-blue-500 dark:text-blue-400">{stock.ticker}</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-2">({stock.shares} shares)</span>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => handleGetSuggestions(stock.ticker)} disabled={loading[stock.ticker]} className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition duration-300 disabled:bg-gray-500 flex items-center justify-center gap-2">
                      {loading[stock.ticker] ? 'Loading...' : <><TrendingUp size={16} /> <span className="hidden sm:inline">Get Suggestions</span></>}
                    </button>
                    <button onClick={() => handleRemoveStock(stock.ticker)} className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition duration-300">
                      Remove
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {suggestions[stock.ticker] && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5 }}>
                      <p className="mb-4 text-lg">Current Price: <span className="font-bold text-green-500">${suggestions[stock.ticker].currentPrice}</span></p>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs sm:text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                              <th className="px-4 sm:px-6 py-3 cursor-pointer" onClick={() => requestSort('otmPercent')}>OTM %</th>
                              <th className="px-4 sm:px-6 py-3 cursor-pointer" onClick={() => requestSort('strike')}>Strike</th>
                              <th className="px-4 sm:px-6 py-3 cursor-pointer" onClick={() => requestSort('premium')}>Premium</th>
                              <th className="px-4 sm:px-6 py-3 cursor-pointer flex items-center gap-1 relative" onClick={() => setShowDeltaTooltip(!showDeltaTooltip)}>
                                Delta <HelpCircle size={14} />
                                {showDeltaTooltip && (
                                  <div className="tooltip w-48 p-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm dark:bg-gray-700">
                                    Probability of the option expiring in-the-money
                                    <div className="tooltip-arrow"></div>
                                  </div>
                                )}
                              </th>
                              <th className="px-4 sm:px-6 py-3">Monthly Yield %</th>
                              <th className="px-4 sm:px-6 py-3">Annualized %</th>
                              <th className="px-4 sm:px-6 py-3">Exp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedSuggestions(stock.ticker).map((s, i) => (
                              <motion.tr
                                key={`${s.strike}-${i}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                                className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition duration-200"
                              >
                                <td className="px-4 sm:px-6 py-4 font-medium text-gray-900 dark:text-white">{s.otmPercent}%</td>
                                <td className="px-4 sm:px-6 py-4">${s.strike}</td>
                                <td className="px-4 sm:px-6 py-4">${s.premium ? s.premium.toFixed(2) : 'N/A'}</td>
                                <td className={`px-4 sm:px-6 py-4 ${s.delta > 0.3 ? 'text-yellow-500' : 'text-green-500'}`}>{s.delta ? s.delta.toFixed(4) : 'N/A'}</td>
                                <td className={`px-4 sm:px-6 py-4 font-bold ${getYieldColor(s.yieldMonthly)}`}>{s.yieldMonthly}</td>
                                <td className={`px-4 sm:px-6 py-4 font-bold ${getYieldColor(s.yieldAnnualized)}`}>
                                  <div className="flex items-center gap-2">
                                    {s.yieldAnnualized}
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                      <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${Math.min(parseFloat(s.yieldAnnualized), 100)}%` }}></div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 sm:px-6 py-4">{s.expiration}</td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
