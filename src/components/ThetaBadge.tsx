import React from 'react';

interface Props {
  theta?: number;
  dte?: number;
  otmPercent?: number;
}

function classifyFallback(dte?: number, otmPercent?: number): { label: string; color: string } {
  const days = dte ?? 0;
  const otm = otmPercent ?? 0;
  if (days <= 10 && otm <= 5) return { label: 'High', color: 'bg-red-500/20 text-red-400' };
  if (days <= 20 && otm <= 10) return { label: 'Mod', color: 'bg-yellow-500/20 text-yellow-400' };
  return { label: 'Low', color: 'bg-green-500/20 text-green-400' };
}

export default function ThetaBadge({ theta, dte, otmPercent }: Props) {
  if (typeof theta === 'number') {
    const val = theta.toFixed(3);
    const color = theta < -0.05 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300';
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>θ {val}</span>;
  }
  const fb = classifyFallback(dte, otmPercent);
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${fb.color}`}>{fb.label}</span>;
}

