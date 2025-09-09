import React from 'react';

interface Props {
  daysAhead: number;
  otmFactors: number[];
  onChange: (next: { daysAhead: number; otmFactors: number[] }) => void;
}

export default function WhatIfControls({ daysAhead, otmFactors, onChange }: Props) {
  const presetsDays = [21, 28, 35, 42];
  const presetsOtm = [1.1, 1.15, 1.2];

  const setDays = (d: number) => onChange({ daysAhead: d, otmFactors });
  const setOtm = (f: number) => onChange({ daysAhead, otmFactors: [f, ...otmFactors.filter((x) => x !== f)] });

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
      <div className="ml-2 text-xs text-gray-500 dark:text-gray-400">OTM:</div>
      {presetsOtm.map((f) => (
        <button
          key={f}
          onClick={() => setOtm(f)}
          className={`text-xs px-2 py-1 rounded border transition ${Math.abs(otmFactors[0] - f) < 1e-6 ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-400/30 hover:border-blue-500'}`}
        >
          +{Math.round((f - 1) * 100)}%
        </button>
      ))}
    </div>
  );
}

