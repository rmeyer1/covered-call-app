import { useEffect, useState, useCallback } from 'react';
import type { StockDetails } from '@/types';

interface UseStockDetailsResult {
  details: StockDetails | null;
  error: string | null;
  isLoading: boolean;
  reload: () => void;
}

async function fetchStockDetails(symbol: string): Promise<StockDetails> {
  const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/details`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = typeof data?.error === 'string' ? data.error : `Failed to load ${symbol}`;
    throw new Error(message);
  }
  return (await response.json()) as StockDetails;
}

export function useStockDetails(symbol: string | null | undefined): UseStockDetailsResult {
  const [details, setDetails] = useState<StockDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const trimmed = symbol?.trim();
    if (!trimmed) {
      setDetails(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchStockDetails(trimmed.toUpperCase())
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load stock details';
        setError(message);
        setDetails(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, reloadToken]);

  return {
    details,
    error,
    isLoading,
    reload,
  };
}

