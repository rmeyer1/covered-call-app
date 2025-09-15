import React from 'react';

interface Props {
  theta?: number;
  dte?: number;
  otmPercent?: number;
}

function classifyFallback(dte?: number, otmPercent?: number): { label: string; color: string } {
  const days = dte ?? 0;
  const otm = otmPercent ?? 0;
  if (days <= 10 && otm <= 5)
    return { label: 'High', color: 'bg-red-600/25 text-red-900 dark:text-red-100 ring-1 ring-red-400/40' };
  if (days <= 20 && otm <= 10)
    return { label: 'Mod', color: 'bg-yellow-600/25 text-yellow-900 dark:text-yellow-100 ring-1 ring-yellow-400/40' };
  return { label: 'Low', color: 'bg-green-600/25 text-green-900 dark:text-green-100 ring-1 ring-green-400/40' };
}

export default function ThetaBadge({ theta, dte, otmPercent }: Props) {
  if (typeof theta === 'number') {
    const val = theta.toFixed(3);
    const color =
      theta < -0.05
        ? 'bg-yellow-600/30 text-yellow-900 dark:text-yellow-100 ring-1 ring-yellow-400/40'
        : 'bg-green-600/30 text-green-900 dark:text-green-100 ring-1 ring-green-400/40';
    return (
      <span className={`px-2.5 py-1 rounded-full text-[12px] sm:text-xs leading-none font-semibold ${color}`}>
        θ {val}
      </span>
    );
  }
  const fb = classifyFallback(dte, otmPercent);
  return (
    <span className={`px-2.5 py-1 rounded-full text-[12px] sm:text-xs leading-none font-semibold ${fb.color}`}>
      {fb.label}
    </span>
  );
}
