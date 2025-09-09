import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import SuggestionsTable from '@/components/SuggestionsTable';
import WhatIfControls from '@/components/WhatIfControls';
import type { Stock, SuggestionsData } from '@/types';

interface Props {
  stock: Stock;
  loading: boolean;
  data?: SuggestionsData;
  onGetSuggestions: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  whatIf?: { daysAhead: number; otmFactors: number[] };
  onWhatIfChange?: (ticker: string, next: { daysAhead: number; otmFactors: number[] }) => void;
}

export default function StockCard({ stock, loading, data, onGetSuggestions, onRemove, whatIf, onWhatIfChange }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <div className="mb-4 sm:mb-0">
          <span className="text-xl sm:text-2xl font-bold text-blue-500 dark:text-blue-400">{stock.ticker}</span>
          <span className="text-gray-600 dark:text-gray-400 ml-2">({stock.shares} shares)</span>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => onGetSuggestions(stock.ticker)}
            disabled={loading}
            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition duration-300 disabled:bg-gray-500 flex items-center justify-center gap-2"
          >
            {loading ? 'Loading...' : (<><TrendingUp size={16} /> <span className="hidden sm:inline">Get Suggestions</span></>)}
          </button>
          <button
            onClick={() => onRemove(stock.ticker)}
            className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 sm:py-2 sm:px-3 rounded-md transition duration-300"
          >
            Remove
          </button>
        </div>
      </div>

      {onWhatIfChange && whatIf && (
        <WhatIfControls
          daysAhead={whatIf.daysAhead}
          otmFactors={whatIf.otmFactors}
          onChange={(next) => onWhatIfChange(stock.ticker, next)}
        />
      )}

      <AnimatePresence>
        {data && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5 }}
          >
            <SuggestionsTable currentPrice={data.currentPrice} suggestions={data.suggestions} showThetaBadge />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
