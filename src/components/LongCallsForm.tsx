import React from 'react';

interface Props {
  tickerInput: string;
  onTickerChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function LongCallsForm({ tickerInput, onTickerChange, onSubmit }: Props) {
  return (
    <form onSubmit={onSubmit} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 flex items-center gap-3">
      <input
        type="text"
        placeholder="Ticker (e.g., AAPL)"
        value={tickerInput}
        onChange={(e) => onTickerChange(e.target.value)}
        className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      />
      <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition">
        Add
      </button>
    </form>
  );
}

