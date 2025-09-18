"use client";

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useStockDetails } from '@/hooks/useStockDetails';
import { deriveStockDetailsView } from '@/lib/stocks/derive';
import StockDetailsTabs from '@/components/StockDetailsTabs';

interface StockDetailsDialogProps {
  symbol: string | null;
  open: boolean;
  onClose: () => void;
}

function useDisableScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [active]);
}

export default function StockDetailsDialog({ symbol, open, onClose }: StockDetailsDialogProps) {
  useDisableScroll(open);
  const { details, error, isLoading, reload } = useStockDetails(open ? symbol : null);
  const view = deriveStockDetailsView(details);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl rounded-xl bg-white dark:bg-gray-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{symbol ?? '—'}</h2>
            {view?.summary?.asOf && (
              <p className="text-xs text-gray-500 dark:text-gray-400">As of {new Date(view.summary.asOf).toLocaleString()}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <button
                type="button"
                onClick={reload}
                className="rounded-md border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="Close stock details"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <StockDetailsTabs
          symbol={symbol ?? ''}
          summary={view?.summary ?? null}
          volatility={view?.volatility ?? null}
          fundamentals={view?.fundamentals ?? null}
          headlines={view?.headlines ?? []}
          warnings={view?.warnings ?? []}
          sources={view?.sources}
          isLoading={isLoading}
          error={error}
          onRetry={reload}
        />
      </div>
    </div>,
    document.body
  );
}
