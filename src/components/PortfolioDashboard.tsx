"use client";

import { useState } from 'react';
import { RefreshCw, Upload, TrendingUp, Trash2 } from 'lucide-react';
import type { PortfolioHolding, PortfolioHoldingsResponse, PortfolioOption } from '@/types';
import { BROKERAGE_OPTIONS, resolveBrokerLabel } from '@/lib/brokerage';
import StockDetailsDialog from '@/components/StockDetailsDialog';
import { calculateStatsFromHoldings } from '@/lib/portfolio-drafts';

interface PortfolioDashboardProps {
  holdings: PortfolioHolding[];
  options: PortfolioOption[];
  stats?: PortfolioHoldingsResponse['stats'];
  loading?: boolean;
  error?: string | null;
  onUploadClick: () => void;
  onRefresh?: () => void;
  onDeleteHolding?: (id: string) => void;
  deletingId?: string | null;
  onDeleteOption?: (id: string) => void;
  deletingOptionId?: string | null;
  onUpdateHolding?: (
    id: string,
    updates: {
      ticker?: string;
      shareQty?: number | null;
      costBasis?: number | null;
      marketValue?: number | null;
      type?: 'equity' | 'option' | null;
      source?: string | null;
    }
  ) => void;
  onUpdateOption?: (
    id: string,
    updates: {
      ticker?: string;
      shareQty?: number | null;
      costBasis?: number | null;
      marketValue?: number | null;
      optionStrike?: number | null;
      optionExpiration?: string | null;
      optionRight?: 'call' | 'put' | null;
      buySell?: 'buy' | 'sell' | null;
      source?: string | null;
    }
  ) => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return currencyFormatter.format(value);
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return numberFormatter.format(value);
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

function renderBrokerBadge(value?: string | null) {
  const label = resolveBrokerLabel(value);
  const tone =
    label === 'Unknown'
      ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export default function PortfolioDashboard({
  holdings,
  options,
  stats,
  loading,
  error,
  onUploadClick,
  onRefresh,
  onDeleteHolding,
  deletingId,
  onDeleteOption,
  deletingOptionId,
  onUpdateHolding,
  onUpdateOption,
}: PortfolioDashboardProps) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [optionCostInputs, setOptionCostInputs] = useState<Record<string, string>>({});
  const [optionContractInputs, setOptionContractInputs] = useState<Record<string, string>>({});
  const [optionInputs, setOptionInputs] = useState<Record<string, Partial<Record<
    'ticker' | 'marketValue' | 'optionStrike' | 'optionExpiration',
    string
  >>>>({});
  const [holdingInputs, setHoldingInputs] = useState<Record<string, Partial<Record<
    'ticker' | 'shares' | 'costBasis' | 'marketValue',
    string
  >>>>({});
  const [editingCell, setEditingCell] = useState<{ table: 'holdings' | 'options'; id: string; field: string } | null>(
    null
  );

  const openDetails = (ticker: string) => {
    setSelectedTicker(ticker);
    setDialogOpen(true);
  };

  const closeDetails = () => {
    setDialogOpen(false);
  };

  const parseNumericInput = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getHoldingInput = (holding: PortfolioHolding, field: 'ticker' | 'shares' | 'costBasis' | 'marketValue') => {
    const raw = holdingInputs[holding.id]?.[field];
    if (raw !== undefined) return raw;
    const fallback =
      field === 'ticker'
        ? holding.ticker
        : field === 'shares'
          ? holding.shareQty
          : field === 'costBasis'
            ? holding.costBasis
            : holding.marketValue;
    return fallback === null || fallback === undefined ? '' : String(fallback);
  };

  const setHoldingInput = (holdingId: string, field: 'ticker' | 'shares' | 'costBasis' | 'marketValue', value: string) => {
    setHoldingInputs((prev) => ({
      ...prev,
      [holdingId]: {
        ...prev[holdingId],
        [field]: value,
      },
    }));
  };

  const clearHoldingInput = (holdingId: string, field: 'ticker' | 'shares' | 'costBasis' | 'marketValue') => {
    setHoldingInputs((prev) => {
      const current = prev[holdingId];
      if (!current) return prev;
      const { [field]: _removed, ...rest } = current;
      const next = { ...prev };
      if (Object.keys(rest).length === 0) {
        delete next[holdingId];
      } else {
        next[holdingId] = rest;
      }
      return next;
    });
  };

  const getOptionCostInput = (option: PortfolioOption): string => {
    const raw = optionCostInputs[option.id];
    if (raw !== undefined) return raw;
    return option.costBasis === null || option.costBasis === undefined ? '' : String(option.costBasis);
  };

  const setOptionCostInput = (optionId: string, value: string) => {
    setOptionCostInputs((prev) => ({ ...prev, [optionId]: value }));
  };

  const clearOptionCostInput = (optionId: string) => {
    setOptionCostInputs((prev) => {
      const next = { ...prev };
      delete next[optionId];
      return next;
    });
  };

  const getOptionContractInput = (option: PortfolioOption): string => {
    const raw = optionContractInputs[option.id];
    if (raw !== undefined) return raw;
    return option.shareQty === null || option.shareQty === undefined ? '' : String(option.shareQty);
  };

  const setOptionContractInput = (optionId: string, value: string) => {
    setOptionContractInputs((prev) => ({ ...prev, [optionId]: value }));
  };

  const clearOptionContractInput = (optionId: string) => {
    setOptionContractInputs((prev) => {
      const next = { ...prev };
      delete next[optionId];
      return next;
    });
  };

  const getOptionInput = (
    option: PortfolioOption,
    field: 'ticker' | 'marketValue' | 'optionStrike' | 'optionExpiration'
  ): string => {
    const raw = optionInputs[option.id]?.[field];
    if (raw !== undefined) return raw;
    const fallback =
      field === 'ticker'
        ? option.ticker
        : field === 'marketValue'
          ? option.marketValue
          : field === 'optionStrike'
            ? option.optionStrike
            : option.optionExpiration;
    return fallback === null || fallback === undefined ? '' : String(fallback);
  };

  const setOptionInput = (
    optionId: string,
    field: 'ticker' | 'marketValue' | 'optionStrike' | 'optionExpiration',
    value: string
  ) => {
    setOptionInputs((prev) => ({
      ...prev,
      [optionId]: {
        ...prev[optionId],
        [field]: value,
      },
    }));
  };

  const clearOptionInput = (
    optionId: string,
    field: 'ticker' | 'marketValue' | 'optionStrike' | 'optionExpiration'
  ) => {
    setOptionInputs((prev) => {
      const current = prev[optionId];
      if (!current) return prev;
      const { [field]: _removed, ...rest } = current;
      const next = { ...prev };
      if (Object.keys(rest).length === 0) {
        delete next[optionId];
      } else {
        next[optionId] = rest;
      }
      return next;
    });
  };

  const hasHoldings = holdings.length > 0;
  const hasOptions = options.length > 0;
  const totals = stats ?? calculateStatsFromHoldings(holdings);
  const safeTotals = totals ?? { totalValue: 0, totalCost: 0, totalGain: 0 };

  const gainClass = (safeTotals.totalGain ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const closeEditing = () => setEditingCell(null);

  return (
    <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Portfolio Overview</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Review your extracted holdings and stay up to date with the latest market data.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onUploadClick}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition"
          >
            <Upload size={16} />
            Upload Snapshots
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
              Refresh
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-6 text-sm text-gray-600 dark:text-gray-400">Refreshing holdings…</div>
      )}

      {hasHoldings || hasOptions ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3 mb-8">
            <article className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total Value</h2>
              <p className="mt-2 text-lg font-semibold">{formatCurrency(safeTotals.totalValue)}</p>
            </article>
            <article className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Cost Basis</h2>
              <p className="mt-2 text-lg font-semibold">{formatCurrency(safeTotals.totalCost)}</p>
            </article>
            <article className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Unrealized Gain</h2>
              <p className={`mt-2 text-lg font-semibold ${gainClass}`}>{formatCurrency(safeTotals.totalGain)}</p>
            </article>
          </section>

          {hasHoldings && (
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                <TrendingUp size={16} /> Holdings
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">{holdings.length} tickers</span>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="p-3 text-left">Ticker</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Shares</th>
                    <th className="p-3 text-left">Cost Basis / Share</th>
                    <th className="p-3 text-left">Live Price</th>
                    <th className="p-3 text-left">Live Value</th>
                    <th className="p-3 text-left">P&L</th>
                    <th className="p-3 text-left">Source</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="p-3 font-semibold">
                        {editingCell?.table === 'holdings' && editingCell.id === holding.id && editingCell.field === 'ticker' ? (
                          <input
                            value={getHoldingInput(holding, 'ticker')}
                            onChange={(e) => setHoldingInput(holding.id, 'ticker', e.target.value)}
                            onBlur={() => {
                              if (!onUpdateHolding) {
                                closeEditing();
                                return;
                              }
                              const value = getHoldingInput(holding, 'ticker').trim().toUpperCase();
                              if (!value || value === holding.ticker) {
                                clearHoldingInput(holding.id, 'ticker');
                                closeEditing();
                                return;
                              }
                              onUpdateHolding(holding.id, { ticker: value });
                              clearHoldingInput(holding.id, 'ticker');
                              closeEditing();
                            }}
                            className="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingCell({ table: 'holdings', id: holding.id, field: 'ticker' })}
                            className="text-blue-600 hover:underline"
                          >
                            {holding.ticker}
                          </button>
                        )}
                        {holding.type === 'option' && (
                          <div className="text-[11px] text-gray-600 dark:text-gray-300">
                            {holding.optionStrike ? `$${holding.optionStrike}` : '—'}{' '}
                            {holding.optionRight ? holding.optionRight.toUpperCase() : 'OPTION'}{' '}
                            {holding.optionExpiration ?? ''}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCell?.table === 'holdings' && editingCell.id === holding.id && editingCell.field === 'type' ? (
                          <select
                            value={holding.type ?? 'equity'}
                            onChange={(e) => {
                              if (!onUpdateHolding) {
                                closeEditing();
                                return;
                              }
                              const next = e.target.value === 'option' ? 'option' : 'equity';
                              onUpdateHolding(holding.id, { type: next });
                              closeEditing();
                            }}
                            onBlur={closeEditing}
                            className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                            autoFocus
                          >
                            <option value="equity">Equity</option>
                            <option value="option">Option</option>
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingCell({ table: 'holdings', id: holding.id, field: 'type' })}
                            className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            {holding.type === 'option' ? 'Option' : 'Equity'}
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCell?.table === 'holdings' && editingCell.id === holding.id && editingCell.field === 'shares' ? (
                          <input
                            value={getHoldingInput(holding, 'shares')}
                            onChange={(e) => setHoldingInput(holding.id, 'shares', e.target.value)}
                            onBlur={() => {
                              if (!onUpdateHolding) {
                                closeEditing();
                                return;
                              }
                              const parsed = parseNumericInput(getHoldingInput(holding, 'shares'));
                              if (parsed === null || parsed === holding.shareQty) {
                                clearHoldingInput(holding.id, 'shares');
                                closeEditing();
                                return;
                              }
                              onUpdateHolding(holding.id, { shareQty: parsed });
                              clearHoldingInput(holding.id, 'shares');
                              closeEditing();
                            }}
                            className="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingCell({ table: 'holdings', id: holding.id, field: 'shares' })}
                            className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                          >
                            {formatNumber(holding.shareQty)}
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCell?.table === 'holdings' && editingCell.id === holding.id && editingCell.field === 'costBasis' ? (
                          <input
                            value={getHoldingInput(holding, 'costBasis')}
                            onChange={(e) => setHoldingInput(holding.id, 'costBasis', e.target.value)}
                            onBlur={() => {
                              if (!onUpdateHolding) {
                                closeEditing();
                                return;
                              }
                              const parsed = parseNumericInput(getHoldingInput(holding, 'costBasis'));
                              if (parsed === holding.costBasis) {
                                clearHoldingInput(holding.id, 'costBasis');
                                closeEditing();
                                return;
                              }
                              onUpdateHolding(holding.id, { costBasis: parsed });
                              clearHoldingInput(holding.id, 'costBasis');
                              closeEditing();
                            }}
                            className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingCell({ table: 'holdings', id: holding.id, field: 'costBasis' })}
                            className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                          >
                            {formatCurrency(holding.costBasis)}
                          </button>
                        )}
                      </td>
                      <td className="p-3">{formatCurrency(holding.livePrice)}</td>
                        <td className="p-3">
                          {editingCell?.table === 'holdings' && editingCell.id === holding.id && editingCell.field === 'marketValue' ? (
                            <input
                              value={getHoldingInput(holding, 'marketValue')}
                              onChange={(e) => setHoldingInput(holding.id, 'marketValue', e.target.value)}
                              onBlur={() => {
                                if (!onUpdateHolding) {
                                  closeEditing();
                                  return;
                                }
                                const parsed = parseNumericInput(getHoldingInput(holding, 'marketValue'));
                                if (parsed === holding.marketValue) {
                                  clearHoldingInput(holding.id, 'marketValue');
                                  closeEditing();
                                  return;
                                }
                                onUpdateHolding(holding.id, { marketValue: parsed });
                                clearHoldingInput(holding.id, 'marketValue');
                                closeEditing();
                              }}
                              className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'holdings', id: holding.id, field: 'marketValue' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {formatCurrency(holding.liveValue ?? holding.marketValue)}
                            </button>
                          )}
                        </td>
                      <td className="p-3">
                        <div className={(holding.liveGain ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          <div>{formatCurrency(holding.liveGain)}</div>
                          <div className="text-[11px]">{formatPercent(holding.liveGainPercent)}</div>
                        </div>
                      </td>
                      <td className="p-3">
                        {editingCell?.table === 'holdings' && editingCell.id === holding.id && editingCell.field === 'source' ? (
                          <select
                            value={holding.source ?? ''}
                            onChange={(e) => {
                              if (!onUpdateHolding) {
                                closeEditing();
                                return;
                              }
                              const next = e.target.value || null;
                              onUpdateHolding(holding.id, { source: next });
                              closeEditing();
                            }}
                            onBlur={closeEditing}
                            className="w-32 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                            autoFocus
                          >
                            <option value="">Unknown</option>
                            {BROKERAGE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingCell({ table: 'holdings', id: holding.id, field: 'source' })}
                            className="inline-flex"
                          >
                            {renderBrokerBadge(holding.source)}
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => onDeleteHolding?.(holding.id)}
                          disabled={!onDeleteHolding || deletingId === holding.id}
                          className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 disabled:opacity-60"
                          aria-label={`Delete ${holding.ticker}`}
                        >
                          <Trash2 size={16} />
                          <span className="text-xs">Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {hasOptions && (
            <section className="mt-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <TrendingUp size={16} /> Options
                </h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">{options.length} contracts</span>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="p-3 text-left">Ticker</th>
                      <th className="p-3 text-left">Buy/Sell</th>
                      <th className="p-3 text-left">Right</th>
                      <th className="p-3 text-left">Strike</th>
                      <th className="p-3 text-left">Expiration</th>
                      <th className="p-3 text-left">Contracts</th>
                      <th className="p-3 text-left">Cost Basis</th>
                      <th className="p-3 text-left">Market Value</th>
                      <th className="p-3 text-left">P&L</th>
                      <th className="p-3 text-left">Source</th>
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((option) => {
                      const cost = option.costBasis ?? null;
                      const market = option.marketValue ?? null;
                      const contracts = option.shareQty ?? 0;
                      const contractMultiplier = 100;
                      const direction = option.buySell === 'sell' ? -1 : 1;
                      const pnl =
                        cost !== null && market !== null
                          ? (market - cost) * contracts * contractMultiplier * direction
                          : null;
                      const totalCost =
                        cost !== null ? cost * contracts * contractMultiplier : null;
                      const pnlPercent =
                        pnl !== null && totalCost
                          ? pnl / totalCost
                          : null;
                      const pnlClass =
                        pnl !== null && pnl >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400';
                      return (
                        <tr key={option.id} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="p-3 font-semibold">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'ticker' ? (
                            <input
                              value={getOptionInput(option, 'ticker')}
                              onChange={(e) => setOptionInput(option.id, 'ticker', e.target.value)}
                              onBlur={() => {
                                if (!onUpdateOption) {
                                  closeEditing();
                                  return;
                                }
                                const value = getOptionInput(option, 'ticker').trim().toUpperCase();
                                if (!value || value === option.ticker) {
                                  clearOptionInput(option.id, 'ticker');
                                  closeEditing();
                                  return;
                                }
                                onUpdateOption(option.id, { ticker: value });
                                clearOptionInput(option.id, 'ticker');
                                closeEditing();
                              }}
                              className="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'ticker' })}
                              className="text-blue-600 hover:underline"
                            >
                              {option.ticker}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'buySell' ? (
                            <select
                              value={option.buySell ?? ''}
                              onChange={(e) => {
                                if (!onUpdateOption) {
                                  closeEditing();
                                  return;
                                }
                                const next = e.target.value === 'sell' ? 'sell' : e.target.value === 'buy' ? 'buy' : null;
                                onUpdateOption(option.id, { buySell: next });
                                closeEditing();
                              }}
                              onBlur={closeEditing}
                              className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                              autoFocus
                            >
                              <option value="">—</option>
                              <option value="buy">Buy</option>
                              <option value="sell">Sell</option>
                            </select>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'buySell' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {option.buySell ? option.buySell.toUpperCase() : '—'}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'optionRight' ? (
                            <select
                              value={option.optionRight ?? ''}
                              onChange={(e) => {
                                if (!onUpdateOption) {
                                  closeEditing();
                                  return;
                                }
                                const next = e.target.value === 'put' ? 'put' : e.target.value === 'call' ? 'call' : null;
                                onUpdateOption(option.id, { optionRight: next });
                                closeEditing();
                              }}
                              onBlur={closeEditing}
                              className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                              autoFocus
                            >
                              <option value="">—</option>
                              <option value="call">Call</option>
                              <option value="put">Put</option>
                            </select>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'optionRight' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {option.optionRight ? option.optionRight.toUpperCase() : '—'}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'optionStrike' ? (
                            <input
                              value={getOptionInput(option, 'optionStrike')}
                              onChange={(e) => setOptionInput(option.id, 'optionStrike', e.target.value)}
                              onBlur={() => {
                                if (!onUpdateOption) {
                                  closeEditing();
                                  return;
                                }
                                const parsed = parseNumericInput(getOptionInput(option, 'optionStrike'));
                                if (parsed === option.optionStrike) {
                                  clearOptionInput(option.id, 'optionStrike');
                                  closeEditing();
                                  return;
                                }
                                onUpdateOption(option.id, { optionStrike: parsed });
                                clearOptionInput(option.id, 'optionStrike');
                                closeEditing();
                              }}
                              className="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'optionStrike' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {formatCurrency(option.optionStrike)}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'optionExpiration' ? (
                            <input
                              value={getOptionInput(option, 'optionExpiration')}
                              onChange={(e) => setOptionInput(option.id, 'optionExpiration', e.target.value)}
                              onBlur={() => {
                                if (!onUpdateOption) {
                                  closeEditing();
                                  return;
                                }
                                const value = getOptionInput(option, 'optionExpiration').trim();
                                if (!value || value === option.optionExpiration) {
                                  clearOptionInput(option.id, 'optionExpiration');
                                  closeEditing();
                                  return;
                                }
                                onUpdateOption(option.id, { optionExpiration: value });
                                clearOptionInput(option.id, 'optionExpiration');
                                closeEditing();
                              }}
                              className="w-28 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'optionExpiration' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {option.optionExpiration ?? '—'}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'contracts' ? (
                            <input
                              value={getOptionContractInput(option)}
                              onChange={(e) => setOptionContractInput(option.id, e.target.value)}
                              onBlur={() => {
                                if (!onUpdateOption) return;
                                const value = getOptionContractInput(option);
                                const parsed = parseNumericInput(value);
                                if (parsed === null) {
                                  clearOptionContractInput(option.id);
                                  closeEditing();
                                  return;
                                }
                                if (parsed === option.shareQty) {
                                  clearOptionContractInput(option.id);
                                  closeEditing();
                                  return;
                                }
                                onUpdateOption(option.id, { shareQty: parsed });
                                clearOptionContractInput(option.id);
                                closeEditing();
                              }}
                              className="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'contracts' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {formatNumber(option.shareQty)}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'costBasis' ? (
                            <input
                              value={getOptionCostInput(option)}
                              onChange={(e) => setOptionCostInput(option.id, e.target.value)}
                              onBlur={() => {
                                if (!onUpdateOption) return;
                                const value = getOptionCostInput(option);
                                const parsed = parseNumericInput(value);
                                if (parsed === option.costBasis) {
                                  clearOptionCostInput(option.id);
                                  closeEditing();
                                  return;
                                }
                                onUpdateOption(option.id, { costBasis: parsed });
                                clearOptionCostInput(option.id);
                                closeEditing();
                              }}
                              className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'costBasis' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {formatCurrency(option.costBasis)}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'marketValue' ? (
                            <input
                              value={getOptionInput(option, 'marketValue')}
                              onChange={(e) => setOptionInput(option.id, 'marketValue', e.target.value)}
                              onBlur={() => {
                                if (!onUpdateOption) {
                                  closeEditing();
                                  return;
                                }
                                const parsed = parseNumericInput(getOptionInput(option, 'marketValue'));
                                if (parsed === option.marketValue) {
                                  clearOptionInput(option.id, 'marketValue');
                                  closeEditing();
                                  return;
                                }
                                onUpdateOption(option.id, { marketValue: parsed });
                                clearOptionInput(option.id, 'marketValue');
                                closeEditing();
                              }}
                              className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'marketValue' })}
                              className="text-left text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {formatCurrency(option.marketValue)}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <div className={pnlClass}>
                            <div>{formatCurrency(pnl)}</div>
                            <div className="text-[11px]">{formatPercent(pnlPercent)}</div>
                          </div>
                        </td>
                        <td className="p-3">
                          {editingCell?.table === 'options' && editingCell.id === option.id && editingCell.field === 'source' ? (
                            <select
                              value={option.source ?? ''}
                              onChange={(e) => {
                                if (!onUpdateOption) {
                                  closeEditing();
                                  return;
                                }
                                const next = e.target.value || null;
                                onUpdateOption(option.id, { source: next });
                                closeEditing();
                              }}
                              onBlur={closeEditing}
                              className="w-32 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                              autoFocus
                            >
                              <option value="">Unknown</option>
                              {BROKERAGE_OPTIONS.map((brokerage) => (
                                <option key={brokerage.value} value={brokerage.value}>
                                  {brokerage.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ table: 'options', id: option.id, field: 'source' })}
                              className="inline-flex"
                            >
                              {renderBrokerBadge(option.source)}
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => onDeleteOption?.(option.id)}
                            disabled={!onDeleteOption || deletingOptionId === option.id}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 disabled:opacity-60"
                            aria-label={`Delete ${option.ticker} option`}
                          >
                            <Trash2 size={16} />
                            <span className="text-xs">Delete</span>
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <StockDetailsDialog
            symbol={selectedTicker}
            open={dialogOpen}
            onClose={closeDetails}
          />
        </>
      ) : (
        <section className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            No holdings found yet. Upload your first screenshot to build your portfolio view.
          </p>
          <button
            onClick={onUploadClick}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition"
          >
            <Upload size={16} />
            Start Upload
          </button>
        </section>
      )}
    </main>
  );
}
