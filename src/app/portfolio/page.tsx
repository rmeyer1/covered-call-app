"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Upload, CheckCircle2, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import type { DraftHolding, DraftRow, PortfolioHolding, PortfolioHoldingsResponse } from '@/types';
import type { VisionAnalysisResult } from '@/lib/vision';
import { parseHoldingsFromVision, parseNumber } from '@/lib/portfolio-ocr';
import {
  USER_HEADER_KEY,
  USER_ID_STORAGE_KEY,
  applyDerivedCostBasisToDrafts,
  applyDerivedCostBasisToHoldings,
  fetchHoldings,
  formatConfidence,
  isDraftReady,
  loadDraftsLocal,
  loadDraftsRemote,
  mergeStocksFromDrafts,
  persistDraftsLocal,
  saveDraftsRemote,
  calculateStatsFromHoldings,
} from '@/lib/portfolio-drafts';
import PortfolioDashboard from '@/components/PortfolioDashboard';

type ViewMode = 'loading' | 'dashboard' | 'upload';


export default function PortfolioPage() {
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('loading');
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioStats, setPortfolioStats] = useState<PortfolioHoldingsResponse['stats'] | undefined>(undefined);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [savingHoldings, setSavingHoldings] = useState(false);
  const [saveHoldingsError, setSaveHoldingsError] = useState<string | null>(null);

  const refreshHoldings = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return;
      if (!options?.silent) setHoldingsLoading(true);
      setHoldingsError(null);
      try {
        const { holdings: loadedHoldings } = await fetchHoldings(userId);
        const hydrated = applyDerivedCostBasisToHoldings(loadedHoldings);
        setHoldings(hydrated);
        setPortfolioStats(calculateStatsFromHoldings(hydrated));
        setMode((prev) => {
          if (loadedHoldings.length) return 'dashboard';
          if (prev === 'dashboard' || prev === 'loading') return 'upload';
          return prev;
        });
      } catch (err) {
        console.error('Failed to load holdings', err);
        setHoldingsError(err instanceof Error ? err.message : 'Failed to load holdings');
        setMode((prev) => (prev === 'loading' ? 'upload' : prev));
      } finally {
        setHoldingsLoading(false);
      }
    },
    [userId]
  );

  const handleRefreshHoldings = useCallback(() => {
    void refreshHoldings();
  }, [refreshHoldings]);

  const handleStartUpload = useCallback(() => {
    setError(null);
    setSaveHoldingsError(null);
    setRawImage(null);
    setRawText('');
    setDrafts([]);
    setMode('upload');
  }, []);

  const handleShowDashboard = useCallback(() => {
    setMode('dashboard');
    void refreshHoldings();
  }, [refreshHoldings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
      if (stored && stored.trim()) {
        setUserId(stored);
        return;
      }
      const generated = crypto.randomUUID();
      localStorage.setItem(USER_ID_STORAGE_KEY, generated);
      setUserId(generated);
    } catch (err) {
      console.error('Failed to resolve portfolio user id', err);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refreshHoldings();
  }, [userId, refreshHoldings]);

  useEffect(() => {
    if (!userId || mode !== 'upload') return;
    void (async () => {
      const remote = await loadDraftsRemote(userId);
      if (remote && remote.length) {
        setDrafts(remote);
      } else {
        const local = loadDraftsLocal();
        if (local.length) setDrafts(local);
      }
    })();
  }, [userId, mode]);

  useEffect(() => {
    if (!userId || mode !== 'upload') return;
    persistDraftsLocal(drafts);
    void saveDraftsRemote(drafts, true, userId);
  }, [drafts, userId, mode]);

  const selectedCount = useMemo(
    () => (mode === 'upload' ? drafts.filter((draft) => draft.selected).length : 0),
    [drafts, mode]
  );
  const readyCount = useMemo(
    () => (mode === 'upload' ? drafts.filter((draft) => draft.selected && isDraftReady(draft)).length : 0),
    [drafts, mode]
  );

  const handleFile = async (file: File) => {
    setError(null);
    if (!userId) {
      setError('Cannot upload without a session. Please refresh and try again.');
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === 'string') resolve(result);
          else reject(new Error('Unable to read file'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('File read error'));
        reader.readAsDataURL(file);
      });
      setRawImage(base64);
      void fetch('/api/portfolio/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ imageBase64: base64, filename: file.name, size: file.size, userId }),
      }).catch((err) => {
        console.error('Failed to archive screenshot', err);
      });
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Vision error ${res.status}`);
      }
      const data = (await res.json()) as VisionAnalysisResult;
      setRawText(data.text ?? '');
      const parsed = applyDerivedCostBasisToDrafts(parseHoldingsFromVision(data));
      if (!parsed.length) {
        setError('Could not identify any holdings in the screenshot. Try a clearer image.');
      }
      setDrafts(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleFile(file);
    event.target.value = '';
  };

  const handleDraftChange = (id: string, field: keyof DraftHolding, value: string) => {
    setDrafts((prev) =>
      applyDerivedCostBasisToDrafts(
        prev.map((draft) =>
          draft.id === id
            ? {
                ...draft,
                [field]: field === 'ticker' ? value.toUpperCase() : parseNumber(value),
              }
            : draft
        )
      )
    );
  };

  const toggleSelected = (id: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d)));
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleCommit = async () => {
    if (!userId) {
      setError('Cannot save holdings without a session. Please refresh and try again.');
      return;
    }
    const readyDrafts = drafts.filter((draft) => draft.selected && isDraftReady(draft));
    if (!readyDrafts.length) {
      setSaveHoldingsError('Select at least one holding with a valid share count.');
      return;
    }

    setSavingHoldings(true);
    setSaveHoldingsError(null);
    try {
      const payload = readyDrafts.map((draft) => ({
        id: draft.id,
        ticker: draft.ticker,
        shareQty: draft.shares,
        costBasis: draft.costBasis ?? null,
        marketValue: draft.marketValue ?? null,
        confidence: draft.confidence ?? null,
        source: draft.source ?? null,
        draftId: draft.id,
      }));

      const res = await fetch('/api/portfolio/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ holdings: payload, replace: true }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = text;
        try {
          const parsed = text ? (JSON.parse(text) as { error?: string }) : null;
          message = parsed?.error ?? message;
        } catch {
          // ignore JSON parse errors; fallback to raw text
        }
        throw new Error(message || `Failed to save holdings (${res.status})`);
      }

      mergeStocksFromDrafts(readyDrafts);
      const readyIds = new Set(readyDrafts.map((draft) => draft.id));
      const kept = drafts.filter((draft) => !readyIds.has(draft.id));
      setDrafts(kept);
      await saveDraftsRemote(kept, true, userId);
      await refreshHoldings();
      setMode('dashboard');
    } catch (err) {
      console.error('Failed to save holdings to Supabase', err);
      setSaveHoldingsError(err instanceof Error ? err.message : 'Failed to save holdings');
    } finally {
      setSavingHoldings(false);
    }
  };

  if (mode === 'loading') {
    return (
      <div className="bg-gray-100 dark:bg-gray-900 min-h-screen flex items-center justify-center text-gray-600 dark:text-gray-300">
        <span className="text-sm sm:text-base">Loading portfolio…</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen">
      {mode === 'dashboard' ? (
        <PortfolioDashboard
          holdings={holdings}
          stats={portfolioStats}
          loading={holdingsLoading}
          error={holdingsError}
          onUploadClick={handleStartUpload}
          onRefresh={handleRefreshHoldings}
        />
      ) : (
        <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Portfolio Snapshot Import</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload brokerage screenshots to extract tickers and share counts. Review and approve rows to add them to your holdings.
              </p>
            </div>
            {holdings.length > 0 && (
              <button
                onClick={handleShowDashboard}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                View Portfolio
              </button>
            )}
          </header>

          {holdingsError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-500">
              <AlertCircle size={16} /> {holdingsError}
            </div>
          )}

          <section className="mb-8">
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 cursor-pointer hover:border-blue-500 transition bg-white dark:bg-gray-800">
              <input type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
              <Upload size={32} className="text-blue-500" />
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                Drag & drop an image here, or <span className="text-blue-500">browse</span>
              </div>
              {uploading && <div className="text-sm text-blue-500">Analyzing screenshot…</div>}
            </label>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
                <AlertCircle size={16} /> {error}
              </div>
            )}
          </section>

          {rawImage && (
            <section className="mb-8">
              <h2 className="font-semibold mb-3 text-lg">Screenshot Preview</h2>
              <div className="relative max-w-lg border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <Image src={rawImage} alt="Uploaded screenshot" width={800} height={600} className="w-full h-auto" unoptimized />
              </div>
            </section>
          )}

          {drafts.length > 0 && (
            <section className="mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">
                  Detected Holdings ({selectedCount} selected, {readyCount} ready)
                </h2>
                <button
                  onClick={() => {
                    void handleCommit();
                  }}
                  disabled={!readyCount || savingHoldings}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-semibold px-4 py-2 rounded-md transition"
                >
                  {savingHoldings ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {savingHoldings ? 'Saving…' : 'Add to My Holdings'}
                </button>
              </div>
              {selectedCount > 0 && readyCount === 0 && (
                <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">
                  Add share counts for the selected rows to continue.
                </p>
              )}
              {saveHoldingsError && (
                <div className="mb-3 flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle size={16} /> {saveHoldingsError}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs sm:text-sm bg-white dark:bg-gray-800 rounded-md shadow">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="p-3 text-left">Use</th>
                      <th className="p-3 text-left">Ticker</th>
                      <th className="p-3 text-left">Shares</th>
                      <th className="p-3 text-left">Cost Basis</th>
                      <th className="p-3 text-left">Market Value</th>
                      <th className="p-3 text-left">Confidence</th>
                      <th className="p-3 text-left">Source</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((draft) => (
                      <tr key={draft.id} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={draft.selected}
                            onChange={() => toggleSelected(draft.id)}
                          />
                        </td>
                        <td className="p-3">
                          <input
                            value={draft.ticker}
                            onChange={(e) => handleDraftChange(draft.id, 'ticker', e.target.value)}
                            className="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            value={draft.shares ?? ''}
                            onChange={(e) => handleDraftChange(draft.id, 'shares', e.target.value)}
                            className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            value={draft.costBasis ?? ''}
                            onChange={(e) => handleDraftChange(draft.id, 'costBasis', e.target.value)}
                            className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            value={draft.marketValue ?? ''}
                            onChange={(e) => handleDraftChange(draft.id, 'marketValue', e.target.value)}
                            className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{formatConfidence(draft.confidence)}</td>
                        <td className="p-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate" title={draft.source ?? ''}>
                          {draft.source}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => removeDraft(draft.id)}
                            className="text-red-500 hover:text-red-600"
                            aria-label="Remove row"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {rawText && (
            <section className="mb-12">
              <h2 className="text-lg font-semibold mb-2">Raw OCR Text</h2>
              <pre className="bg-gray-900 text-gray-100 text-xs sm:text-sm rounded-lg p-4 overflow-auto max-h-60 whitespace-pre-wrap">
                {rawText}
              </pre>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
