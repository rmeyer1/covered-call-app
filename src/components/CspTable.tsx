import React, { useMemo, useState } from 'react';
import ThetaBadge from '@/components/ThetaBadge';
import type { CashSecuredPutSuggestion } from '@/types';
import { HelpCircle } from 'lucide-react';

type Basis = 'bid' | 'mid';

interface Props {
  currentPrice: number;
  suggestions: CashSecuredPutSuggestion[];
  basis: Basis;
}

type SortKey = 'strike' | 'premium' | 'delta' | 'returnAnn' | 'breakeven' | 'dte';

type Row = {
  strike: number;
  premium: number;
  delta?: number | null;
  theta?: number | null;
  iv: number | null;
  returnPct: number;
  returnAnn: number;
  cashRequired: number;
  assignProb: number;
  breakeven: number;
  dte: number;
};

export default function CspTable({ currentPrice, suggestions, basis }: Props) {
  const [showDeltaTip, setShowDeltaTip] = useState(false);
  const [showThetaTip, setShowThetaTip] = useState(false);
  const [showIvTip, setShowIvTip] = useState(false);
  const [showReturnTip, setShowReturnTip] = useState(false);
  const [showAssignTip, setShowAssignTip] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'strike', direction: 'descending' });

  const rows: Row[] = useMemo(() => {
    return suggestions.map((s) => {
      const bid = s.bid ?? 0;
      const ask = s.ask ?? 0;
      const mid = (bid + ask) / 2 || s.premium || 0;
      const premium = basis === 'bid' ? (bid || mid) : mid;
      const returnPct = (premium / s.strike) * 100;
      const returnAnn = returnPct * (365 / Math.max(1, s.dte));
      const breakeven = s.strike - premium;
      const cashRequired = s.strike * 100 - premium * 100;
      const assignProb = Math.round(Math.abs(s.delta ?? 0) * 100);
      return {
        strike: s.strike,
        premium,
        delta: s.delta,
        theta: s.theta,
        iv: typeof s.impliedVolatility === 'number' ? s.impliedVolatility * 100 : null,
        returnPct,
        returnAnn,
        cashRequired,
        assignProb,
        breakeven,
        dte: s.dte,
      };
    });
  }, [suggestions, basis]);

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

  const requestSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: 'ascending' }
    );
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
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap cursor-pointer" onClick={() => requestSort('strike')}>Strike</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap cursor-pointer" onClick={() => requestSort('premium')}>
                <span className="inline-flex items-center gap-2">
                  Premium
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${basis === 'bid' ? 'bg-blue-600 text-white border-blue-600' : 'bg-purple-600 text-white border-purple-600'}`}>
                    {basis.toUpperCase()}
                  </span>
                </span>
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle cursor-pointer" onClick={() => requestSort('delta')}>
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
                    Put delta (negative). Lower magnitude ≈ lower assignment probability.
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
                    Daily time decay. Positive for sellers; larger = faster premium erosion.
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
                    Implied volatility. Higher IV inflates premiums; CSPs benefit if IV falls post-sale.
                  </div>
                )}
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle">
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowReturnTip(true)}
                  onMouseLeave={() => setShowReturnTip(false)}
                  onFocus={() => setShowReturnTip(true)}
                  onBlur={() => setShowReturnTip(false)}
                >
                  Return % <HelpCircle size={14} />
                </span>
                {showReturnTip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Period return on collateral (premium ÷ strike).
                  </div>
                )}
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap cursor-pointer" onClick={() => requestSort('returnAnn')}>Annualized %</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap">Cash Req.</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap relative align-middle">
                <span
                  className="inline-flex items-center gap-1"
                  onMouseEnter={() => setShowAssignTip(true)}
                  onMouseLeave={() => setShowAssignTip(false)}
                  onFocus={() => setShowAssignTip(true)}
                  onBlur={() => setShowAssignTip(false)}
                >
                  Assign % <HelpCircle size={14} />
                </span>
                {showAssignTip && (
                  <div className="absolute z-30 left-auto right-0 sm:left-0 sm:right-auto top-full mt-2 max-w-[14rem] sm:max-w-[16rem] max-h-40 overflow-auto p-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg dark:bg-gray-700 break-words whitespace-normal">
                    Approx assignment probability (|delta| × 100).
                  </div>
                )}
              </th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap cursor-pointer" onClick={() => requestSort('breakeven')}>Breakeven</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap cursor-pointer" onClick={() => requestSort('dte')}>DTE</th>
              <th className="px-4 sm:px-6 py-2 sm:py-3 whitespace-nowrap">Extrinsic</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const extrinsic = row.premium - Math.max(currentPrice - row.strike, 0);
              return (
                <tr key={`${row.strike}-${row.dte}`} className="border-b dark:border-gray-700">
                  <td className="px-4 sm:px-6 py-2 sm:py-3">${row.strike.toFixed(2)}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">${row.premium.toFixed(2)}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.delta?.toFixed(2) ?? '—'}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.theta?.toFixed(2) ?? '—'}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.iv ? `${row.iv.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.returnPct.toFixed(2)}%</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.returnAnn.toFixed(2)}%</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">${row.cashRequired.toLocaleString()}</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">{row.assignProb}%</td>
                  <td className="px-4 sm:px-6 py-2 sm:py-3">${row.breakeven.toFixed(2)}</td>
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
