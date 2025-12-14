import React, { useMemo, useState } from 'react';
import ThetaBadge from '@/components/ThetaBadge';
import type { LongPutSuggestion } from '@/types';
import { HelpCircle } from 'lucide-react';

type SortKey = 'strike' | 'premium' | 'delta' | 'breakeven' | 'dte';

type Row = LongPutSuggestion & { ivPct: number | null };

interface Props {
  currentPrice: number;
  suggestions: LongPutSuggestion[];
}

export default function LongPutsTable({ currentPrice, suggestions }: Props) {
  const [showDeltaTip, setShowDeltaTip] = useState(false);
  const [showThetaTip, setShowThetaTip] = useState(false);
  const [showIvTip, setShowIvTip] = useState(false);
  const [showIntrinsicTip, setShowIntrinsicTip] = useState(false);
  const [showExtrinsicTip, setShowExtrinsicTip] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'strike', direction: 'descending' });

  const rows: Row[] = useMemo(() => suggestions.map((s) => ({
    ...s,
    ivPct: typeof s.impliedVolatility === 'number' ? s.impliedVolatility * 100 : null,
  })), [suggestions]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const { key, direction } = sortConfig;
    copy.sort((a, b) => {
      const av = Number(a[key]);
      const bv = Number(b[key]);
      if (Number.isNaN(av) || Number.isNaN(bv)) return 0;
      if (av < bv) return direction === 'ascending' ? -1 : 1;
      if (av > bv) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortConfig]);

  const requestSort = (key: SortKey) => setSortConfig((prev) => prev.key === key ? { key, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' } : { key, direction: 'ascending' });
  return (
    <div>
      <p className="mb-4 text-lg">
        Current Price: <span className="font-bold text-green-500">${currentPrice}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs sm:text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap cursor-pointer" onClick={() => requestSort('strike')}>Strike</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap cursor-pointer" onClick={() => requestSort('premium')}>Premium</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle">
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowDeltaTip(true)}
                  onMouseLeave={() => setShowDeltaTip(false)}
                  onFocus={() => setShowDeltaTip(true)}
                  onBlur={() => setShowDeltaTip(false)}
                >
                  Delta <HelpCircle size={14} />
                </span>
                {showDeltaTip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Sensitivity to a $1 stock move. For puts, more negative = higher ITM probability.
                  </div>
                )}
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle">
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowThetaTip(true)}
                  onMouseLeave={() => setShowThetaTip(false)}
                  onFocus={() => setShowThetaTip(true)}
                  onBlur={() => setShowThetaTip(false)}
                >
                  θ <HelpCircle size={14} />
                </span>
                {showThetaTip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Time decay per day. Negative for long puts.
                  </div>
                )}
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle">
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowIvTip(true)}
                  onMouseLeave={() => setShowIvTip(false)}
                  onFocus={() => setShowIvTip(true)}
                  onBlur={() => setShowIvTip(false)}
                >
                  IV <HelpCircle size={14} />
                </span>
                {showIvTip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Implied volatility. Higher IV inflates premiums; long puts benefit if IV rises.
                  </div>
                )}
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle">
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowIntrinsicTip(true)}
                  onMouseLeave={() => setShowIntrinsicTip(false)}
                  onFocus={() => setShowIntrinsicTip(true)}
                  onBlur={() => setShowIntrinsicTip(false)}
                >
                  Intrinsic <HelpCircle size={14} />
                </span>
                {showIntrinsicTip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Immediate value if exercised: max(strike − spot, 0).
                  </div>
                )}
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle">
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowExtrinsicTip(true)}
                  onMouseLeave={() => setShowExtrinsicTip(false)}
                  onFocus={() => setShowExtrinsicTip(true)}
                  onBlur={() => setShowExtrinsicTip(false)}
                >
                  Extrinsic <HelpCircle size={14} />
                </span>
                {showExtrinsicTip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Time value = premium − intrinsic.
                  </div>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const intrinsic = Math.max(row.strike - currentPrice, 0);
              const extrinsic = row.premium - intrinsic;
              return (
                <tr key={`${row.strike}-${row.dte}`} className="border-b dark:border-gray-700">
                  <td className="px-4 sm:px-6 py-2 sm:py-3">${row.strike.toFixed(2)}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">${row.premium.toFixed(2)}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.delta?.toFixed(2) ?? '—'}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.ivPct ? `${row.ivPct.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.breakeven.toFixed(2)}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.dte}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">
                    <div className="flex items-center gap-2">
                      <span>${extrinsic.toFixed(2)}</span>
                      <ThetaBadge theta={row.theta ?? null} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
