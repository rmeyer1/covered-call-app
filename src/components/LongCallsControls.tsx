import React from 'react';

type Moneyness = 'ITM' | 'ATM' | 'OTM';

interface Props {
  daysAhead: number;
  moneyness: Moneyness;
  onChange: (next: { daysAhead: number; moneyness: Moneyness }) => void;
}

export default function LongCallsControls({ daysAhead, moneyness, onChange }: Props) {
  const presetsDays = [21, 28, 35, 42];
  const setDays = (d: number) => onChange({ daysAhead: d, moneyness });
  const setMode = (mode: Moneyness) => onChange({ daysAhead, moneyness: mode });

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

