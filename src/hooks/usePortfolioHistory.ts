import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PortfolioHolding, PortfolioHoldingsResponse } from '@/types';
import { fetchHoldings } from '@/lib/portfolio-drafts';

interface UsePortfolioHistoryResult {
  holdings: PortfolioHolding[];
  stats?: PortfolioHoldingsResponse['stats'];
  loading: boolean;
  error: string | null;
  refresh: (options?: { silent?: boolean }) => void;
  historyMap: Map<string, PortfolioHolding>;
}

export function usePortfolioHistory(userId: string | null): UsePortfolioHistoryResult {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [stats, setStats] = useState<PortfolioHoldingsResponse['stats']>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return;
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const { holdings: loadedHoldings, stats: loadedStats } = await fetchHoldings(userId);
        setHoldings(loadedHoldings);
        setStats(loadedStats);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load holdings';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return;
    void refresh({ silent: true });
  }, [userId, refresh]);

  const historyMap = useMemo(
    () => new Map(holdings.map((holding) => [holding.ticker?.toUpperCase?.() ?? '', holding])),
    [holdings]
  );

  return { holdings, stats, loading, error, refresh, historyMap };
}
