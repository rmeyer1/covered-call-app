import React from 'react';
import ExpirationSelector from '@/components/ExpirationSelector';
import { selectionToDaysAhead } from '@/lib/expirations';
import type { ExpirySelection } from '@/types';

type Moneyness = 'ITM' | 'ATM' | 'OTM';

interface Props {
  expiry: ExpirySelection;
  moneyness: Moneyness;
  onChange: (next: { expiry: ExpirySelection; moneyness: Moneyness }) => void;
}

export default function LongCallsControls({ expiry, moneyness, onChange }: Props) {
  const selection = expiry;
  const setDays = (next: ExpirySelection) => onChange({ expiry: next, moneyness });
  const setMode = (mode: Moneyness) => onChange({ expiry: { ...selection }, moneyness: mode });

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <ExpirationSelector
        selection={selection}
        onChange={setDays}
        legacyDaysAhead={selectionToDaysAhead(selection)}
      />

      <div className="flex items-center gap-2 ml-2 whitespace-nowrap">
        <div className="text-xs text-gray-500 dark:text-gray-400">Moneyness:</div>
        {(['ITM','ATM','OTM'] as Moneyness[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            className={`text-xs px-2 py-1 rounded border transition ${moneyness === mode ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>
  );
}
