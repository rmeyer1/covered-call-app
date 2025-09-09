import React from 'react';

interface StockFormProps {
  tickerInput: string;
  sharesInput: string;
  onTickerChange: (v: string) => void;
  onSharesChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function StockForm({
  tickerInput,
  sharesInput,
  onTickerChange,
  onSharesChange,
  onSubmit,
}: StockFormProps) {
  return (
    <form onSubmit={onSubmit} className="mb-8 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-md">
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          placeholder="Ticker (e.g., AAPL)"
          value={tickerInput}
          onChange={(e) => onTickerChange(e.target.value)}
          className="flex-grow bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 p-2 rounded-md"
        />
        <input
          type="number"
          placeholder="Shares (>= 100)"
          value={sharesInput}
          onChange={(e) => onSharesChange(e.target.value)}
          className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 p-2 rounded-md"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300">
          Add Stock
        </button>
      </div>
    </form>
  );
}

