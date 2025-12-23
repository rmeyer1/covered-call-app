"use client";

import { Search, Sparkles } from 'lucide-react';

const placeholderSymbols = ['AAPL', 'MSFT', 'TSLA'];

export default function WatchlistPage() {
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
            className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-blue-600 text-white shadow hover:bg-blue-500 active:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 transition"
            aria-label="Search for symbols"
          >
            <Search />
          </button>
        </header>

        <section className="mt-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Watchlist Preview</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">layout only</span>
            </div>
            <div className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Sparkles size={14} />
              <span>Search to start adding</span>
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {placeholderSymbols.map((symbol) => (
              <div key={symbol} className="flex items-center justify-between px-4 sm:px-6 py-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold flex items-center justify-center shadow-sm">
                    {symbol[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-base">{symbol}</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Placeholder slot</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="h-3 w-16 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  <span className="h-3 w-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 sm:px-6 py-6 bg-gray-50 dark:bg-gray-900 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-300 shadow-sm mb-3">
              <Search />
            </div>
            <p className="text-base font-semibold">Add symbols to your watchlist</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Tap the search icon to find tickers and start building your personalized list.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
