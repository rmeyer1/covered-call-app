import React from 'react';
import ExpirationSelector from '@/components/ExpirationSelector';
import { selectionToDaysAhead } from '@/lib/expirations';
import type { ExpirySelection } from '@/types';

interface Props {
  expiry: ExpirySelection;
  otmFactors: number[];
  onChange: (next: { expiry: ExpirySelection; otmFactors: number[] }) => void;
}

export default function WhatIfControls({ expiry, otmFactors, onChange }: Props) {
  const otmPreset = [1.1, 1.15, 1.2]; // +10%, +15%, +20%
  const itmPreset = [0.98, 0.95, 0.9]; // -2%, -5%, -10%

  const selection = expiry;

  const setDays = (next: ExpirySelection) => onChange({ expiry: next, otmFactors });
  const setMode = (mode: 'OTM' | 'ITM') => {
    const next = mode === 'OTM' ? otmPreset : itmPreset;
    onChange({ expiry: { ...selection }, otmFactors: next });
  };

  const currentMode: 'OTM' | 'ITM' = (otmFactors?.[0] ?? 1.1) > 1 ? 'OTM' : 'ITM';

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <ExpirationSelector
        selection={selection}
        onChange={setDays}
        legacyDaysAhead={selectionToDaysAhead(selection)}
      />

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
