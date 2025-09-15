import React from 'react';

interface Props {
  daysAhead: number;
  otmFactors: number[];
  onChange: (next: { daysAhead: number; otmFactors: number[] }) => void;
}

export default function WhatIfControls({ daysAhead, otmFactors, onChange }: Props) {
  const presetsDays = [21, 28, 35, 42];
  const otmPreset = [1.1, 1.15, 1.2]; // +10%, +15%, +20%
  const itmPreset = [0.98, 0.95, 0.9]; // -2%, -5%, -10%

  const setDays = (d: number) => onChange({ daysAhead: d, otmFactors });
  const setMode = (mode: 'OTM' | 'ITM') => {
    const next = mode === 'OTM' ? otmPreset : itmPreset;
    onChange({ daysAhead, otmFactors: next });
  };

  const currentMode: 'OTM' | 'ITM' = (otmFactors?.[0] ?? 1.1) > 1 ? 'OTM' : 'ITM';

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">Expiration:</div>
      {presetsDays.map((d) => (
        <button
          key={d}
          onClick={() => setDays(d)}
          className={`text-xs px-2 py-1 rounded border transition ${daysAhead === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
        >
          {d}d
        </button>
      ))}

      {/* Group Moneyness label + options so they wrap together on mobile */}
      <div className="flex items-center gap-2 ml-2 whitespace-nowrap">
        <div className="text-xs text-gray-500 dark:text-gray-400">Moneyness:</div>
        <button
          onClick={() => setMode('ITM')}
          className={`text-xs px-2 py-1 rounded border transition ${currentMode === 'ITM' ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
        >
          ITM
        </button>
        <button
          onClick={() => setMode('OTM')}
          className={`text-xs px-2 py-1 rounded border transition ${currentMode === 'OTM' ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
        >
          OTM
        </button>
      </div>
    </div>
  );
}
