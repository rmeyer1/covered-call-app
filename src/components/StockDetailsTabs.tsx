"use client";

import { useState } from 'react';
import type { StockDetailsSources } from '@/types';
import type {
  SummaryTileView,
  VolatilityTileView,
  FundamentalsTileView,
  HeadlineView,
} from '@/lib/stocks/derive';
import SummaryTab from '@/components/StockDetailsTabs/SummaryTab';
import VolatilityTab from '@/components/StockDetailsTabs/VolatilityTab';
import FundamentalsTab from '@/components/StockDetailsTabs/FundamentalsTab';
import HeadlinesTab from '@/components/StockDetailsTabs/HeadlinesTab';

interface StockDetailsTabsProps {
  symbol: string;
  summary: SummaryTileView | null;
  volatility: VolatilityTileView | null;
  fundamentals: FundamentalsTileView | null;
  headlines: HeadlineView[];
  warnings: string[];
  sources?: StockDetailsSources;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

const TABS = ['Summary', 'Volatility', 'Fundamentals', 'Headlines'] as const;
type TabKey = (typeof TABS)[number];

export default function StockDetailsTabs({
  symbol,
  summary,
  volatility,
  fundamentals,
  headlines,
  warnings,
  sources,
  isLoading,
  error,
  onRetry,
}: StockDetailsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('Summary');

  const renderTabContent = () => {
    if (isLoading) {
      return <div className="p-6 text-sm text-gray-500">Loading…</div>;
    }
    if (error) {
      return (
        <div className="p-6 text-sm text-red-600">
          <p className="mb-3">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Try again
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'Summary':
        return <SummaryTab symbol={symbol} data={summary} source={sources?.summary} warnings={warnings} />;
      case 'Volatility':
        return <VolatilityTab data={volatility} source={sources?.volatility} />;
      case 'Fundamentals':
        return <FundamentalsTab data={fundamentals} source={sources?.fundamentals} />;
      case 'Headlines':
        return <HeadlinesTab headlines={headlines} source={sources?.headlines} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col">
      <nav className="flex border-b border-gray-200 dark:border-gray-700 text-sm">
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              className={`px-4 py-3 font-medium transition ${
                isActive
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          );
        })}
      </nav>
      <section>{renderTabContent()}</section>
    </div>
  );
}
