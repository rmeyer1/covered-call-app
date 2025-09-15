import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import ThetaBadge from '@/components/ThetaBadge';
import type { Suggestion, SortKey } from '@/types';

interface Props {
  currentPrice: number;
  suggestions: Suggestion[];
  showThetaBadge?: boolean;
}

function getYieldColor(yieldValue: string) {
  const value = parseFloat(yieldValue);
  if (value > 10) return 'text-green-400';
  if (value > 5) return 'text-yellow-400';
  return 'text-red-400';
}

export default function SuggestionsTable({ currentPrice, suggestions, showThetaBadge = true }: Props) {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [showDeltaTooltip, setShowDeltaTooltip] = useState(false);
  const [showThetaTooltip, setShowThetaTooltip] = useState(false);

  const sorted = useMemo(() => {
    if (!sortConfig) return suggestions;
    const copy = [...suggestions];
    copy.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
    return copy;
  }, [suggestions, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div>
      <p className="mb-4 text-lg">
        Current Price: <span className="font-bold text-green-500">${currentPrice}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs sm:text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th className="px-4 sm:px-6 py-2 sm:py-3 align-middle whitespace-nowrap cursor-pointer" onClick={() => requestSort('otmPercent')}>OTM/ITM %</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 align-middle whitespace-nowrap cursor-pointer" onClick={() => requestSort('strike')}>Strike</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 align-middle whitespace-nowrap cursor-pointer" onClick={() => requestSort('premium')}>Premium</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 align-middle whitespace-nowrap cursor-pointer relative" onClick={() => requestSort('delta')}>
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowDeltaTooltip(true)}
                  onMouseLeave={() => setShowDeltaTooltip(false)}
                  onFocus={() => setShowDeltaTooltip(true)}
                  onBlur={() => setShowDeltaTooltip(false)}
                >
                  Delta <HelpCircle size={14} />
                </span>
                {showDeltaTooltip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Approximate probability of finishing in-the-money. Higher delta ≈ higher assignment risk.
                  </div>
                )}
              </th>
              {showThetaBadge && (
                <th className="px-4 sm:px-6 py-2 sm:py-3 align-middle whitespace-nowrap relative">
                  <span
                    className="inline-flex items-center gap-1"
                    onMouseEnter={() => setShowThetaTooltip(true)}
                    onMouseLeave={() => setShowThetaTooltip(false)}
                    onFocus={() => setShowThetaTooltip(true)}
                    onBlur={() => setShowThetaTooltip(false)}
                  >
                    θ <HelpCircle size={14} />
                  </span>
                  {showThetaTooltip && (
                    <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                      Time decay per option (per day). Negative for long calls; as a covered call seller, decay works in your favor.
                    </div>
                  )}
                </th>
              )}
              <th className="px-4 sm:px-6 py-3">Monthly Yield %</th>
              <th className="px-4 sm:px-6 py-3">Annualized %</th>
              <th className="px-4 sm:px-6 py-3">Exp</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <motion.tr
                key={`${s.strike}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition duration-200"
              >
                <td className="px-4 sm:px-6 py-4 font-medium text-gray-900 dark:text-white">{s.otmPercent > 0 ? `+${s.otmPercent}` : s.otmPercent}%</td>
                <td className="px-4 sm:px-6 py-4">${s.strike}</td>
                <td className="px-4 sm:px-6 py-4">${s.premium ? s.premium.toFixed(2) : 'N/A'}</td>
                <td className={`px-4 sm:px-6 py-4 ${s.delta > 0.3 ? 'text-yellow-500' : 'text-green-500'}`}>{s.delta ? s.delta.toFixed(4) : 'N/A'}</td>
                {showThetaBadge && (
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap align-middle">
                    <ThetaBadge theta={s.theta} dte={s.dte} otmPercent={s.otmPercent} />
                  </td>
                )}
                <td className={`px-4 sm:px-6 py-4 font-bold ${getYieldColor(s.yieldMonthly)}`}>{s.yieldMonthly}</td>
                <td className={`px-4 sm:px-6 py-4 font-bold ${getYieldColor(s.yieldAnnualized)}`}>
                  <div className="flex items-center gap-2">
                    {s.yieldAnnualized}
                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                      <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${Math.min(parseFloat(s.yieldAnnualized), 100)}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-4">{s.expiration}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
