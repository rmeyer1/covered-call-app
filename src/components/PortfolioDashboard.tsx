"use client";

import { useState } from 'react';
import { RefreshCw, Upload, TrendingUp, Trash2 } from 'lucide-react';
import type { PortfolioHolding, PortfolioHoldingsResponse, PortfolioOption } from '@/types';
import { resolveBrokerLabel } from '@/lib/brokerage';
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
}: PortfolioDashboardProps) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openDetails = (ticker: string) => {
    setSelectedTicker(ticker);
    setDialogOpen(true);
  };

  const closeDetails = () => {
    setDialogOpen(false);
  };

  const hasHoldings = holdings.length > 0;
  const hasOptions = options.length > 0;
  const totals = stats ?? calculateStatsFromHoldings(holdings);
  const safeTotals = totals ?? { totalValue: 0, totalCost: 0, totalGain: 0 };

  const gainClass = (safeTotals.totalGain ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

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
                    <th className="p-3 text-left">Confidence</th>
                    <th className="p-3 text-left">Source</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="p-3 font-semibold">
                        <button
                          type="button"
                          onClick={() => openDetails(holding.ticker)}
                          className="text-blue-600 hover:underline"
                        >
                          {holding.ticker}
                        </button>
                        {holding.type === 'option' && (
                          <div className="text-[11px] text-gray-600 dark:text-gray-300">
                            {holding.optionStrike ? `$${holding.optionStrike}` : '—'}{' '}
                            {holding.optionRight ? holding.optionRight.toUpperCase() : 'OPTION'}{' '}
                            {holding.optionExpiration ?? ''}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                          {holding.type === 'option' ? 'Option' : 'Equity'}
                        </span>
                      </td>
                      <td className="p-3">{formatNumber(holding.shareQty)}</td>
                      <td className="p-3">{formatCurrency(holding.costBasis)}</td>
                      <td className="p-3">{formatCurrency(holding.livePrice)}</td>
                      <td className="p-3">{formatCurrency(holding.liveValue ?? holding.marketValue)}</td>
                      <td className="p-3">
                        <div className={(holding.liveGain ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          <div>{formatCurrency(holding.liveGain)}</div>
                          <div className="text-[11px]">{formatPercent(holding.liveGainPercent)}</div>
                        </div>
                      </td>
                      <td className="p-3">{formatPercent(holding.confidence)}</td>
                      <td className="p-3">{renderBrokerBadge(holding.source)}</td>
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
                      <th className="p-3 text-left">Confidence</th>
                      <th className="p-3 text-left">Source</th>
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((option) => (
                      <tr key={option.id} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="p-3 font-semibold">{option.ticker}</td>
                        <td className="p-3">{option.buySell ? option.buySell.toUpperCase() : '—'}</td>
                        <td className="p-3">{option.optionRight ? option.optionRight.toUpperCase() : '—'}</td>
                        <td className="p-3">{formatCurrency(option.optionStrike)}</td>
                        <td className="p-3">{option.optionExpiration ?? '—'}</td>
                        <td className="p-3">{formatNumber(option.shareQty)}</td>
                        <td className="p-3">{formatCurrency(option.costBasis)}</td>
                        <td className="p-3">{formatCurrency(option.marketValue)}</td>
                        <td className="p-3">{formatPercent(option.confidence)}</td>
                        <td className="p-3">{renderBrokerBadge(option.source)}</td>
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
                    ))}
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
