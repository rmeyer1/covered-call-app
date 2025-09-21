import React from 'react';
import ExpirationSelector from '@/components/ExpirationSelector';
import { selectionToDaysAhead } from '@/lib/expirations';
import type { ExpirySelection } from '@/types';

type Moneyness = 'OTM' | 'ITM';
type Basis = 'bid' | 'mid';

interface Props {
  expiry: ExpirySelection;
  moneyness: Moneyness;
  basis: Basis;
  onChange: (next: { expiry: ExpirySelection; moneyness: Moneyness; basis: Basis }) => void;
}

export default function CspControls({ expiry, moneyness, basis, onChange }: Props) {
  const selection = expiry;

  const handleExpiryChange = (next: ExpirySelection) => {
    onChange({ expiry: next, moneyness, basis });
  };
  const setMode = (mode: Moneyness) => onChange({ expiry: { ...selection }, moneyness: mode, basis });
  const setBasis = (b: Basis) => onChange({ expiry: { ...selection }, moneyness, basis: b });

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <ExpirationSelector
        selection={selection}
        onChange={handleExpiryChange}
        legacyDaysAhead={selectionToDaysAhead(selection)}
      />
      <div className="flex items-center gap-2 ml-2 whitespace-nowrap">
        <div className="text-xs text-gray-500 dark:text-gray-400">Moneyness:</div>
        {(['OTM','ITM'] as Moneyness[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            className={`text-xs px-2 py-1 rounded border transition ${moneyness === mode ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
          >
            {mode}
          </button>
        ))}
    </div>
      <div className="flex items-center gap-2 ml-2 whitespace-nowrap">
        <div className="text-xs text-gray-500 dark:text-gray-400">Pricing:</div>
        {(['bid','mid'] as Basis[]).map((b) => (
          <button
            key={b}
            onClick={() => setBasis(b)}
            className={`text-xs px-2 py-1 rounded border transition ${basis === b ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
          >
            {b.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
