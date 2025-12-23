"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Upload, CheckCircle2, AlertCircle, Trash2, Loader2, Shuffle } from 'lucide-react';
import type { DraftHolding, DraftRow } from '@/types';
import type { VisionAnalysisResult } from '@/lib/vision';
import { parseHoldingsFromVision, parseNumber } from '@/lib/portfolio-ocr';
import { BROKERAGE_OPTIONS, detectBrokerage, resolveBrokerLabel } from '@/lib/brokerage';
import {
  USER_HEADER_KEY,
  USER_ID_STORAGE_KEY,
  applyDerivedCostBasisToDrafts,
  draftGroupingKey,
  formatConfidence,
  isOptionExpirationValid,
  isDraftReady,
  isTickerFormatValid,
  loadDraftsLocal,
  loadDraftsRemote,
  mergeCostBasisFromHistory,
  mergeDraftRows,
  mergeStocksFromDrafts,
  persistDraftsLocal,
  saveDraftsRemote,
} from '@/lib/portfolio-drafts';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import PortfolioDashboard from '@/components/PortfolioDashboard';

type ViewMode = 'loading' | 'dashboard' | 'upload';

interface UploadPreview {
  id: string;
  name: string;
  image: string;
  path?: string | null;
}

export default function PortfolioPage() {
  const [rawTexts, setRawTexts] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [mergedDrafts, setMergedDrafts] = useState<DraftRow[]>([]);
  const [mergeAccounts, setMergeAccounts] = useState(true);
  const [previews, setPreviews] = useState<UploadPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipsVisible, setTipsVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [draftInputs, setDraftInputs] = useState<
    Record<
      string,
      Partial<
        Record<
          'ticker' | 'shares' | 'contracts' | 'costBasis' | 'marketValue' | 'optionStrike' | 'optionExpiration',
          string
        >
      >
    >
  >({});
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('loading');
  const [savingHoldings, setSavingHoldings] = useState(false);
  const [saveHoldingsError, setSaveHoldingsError] = useState<string | null>(null);
  const [deletingHoldingId, setDeletingHoldingId] = useState<string | null>(null);
  const [deletingOptionId, setDeletingOptionId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualType, setManualType] = useState<'equity' | 'option'>('equity');
  const [manualFields, setManualFields] = useState({
    ticker: '',
    shares: '',
    contracts: '',
    costBasis: '',
    marketValue: '',
    optionStrike: '',
    optionExpiration: '',
    optionRight: '',
    buySell: '',
  });
  const {
    holdings,
    options,
    stats: portfolioStats,
    loading: holdingsLoading,
    error: holdingsError,
    refresh: refreshHoldings,
    historyMap,
  } = usePortfolioHistory(userId);

  const handleRefreshHoldings = useCallback(() => {
    void refreshHoldings();
  }, [refreshHoldings]);

  const findGroupKeyForDraft = useCallback(
    (id: string) => {
      const direct = drafts.find((draft) => draft.id === id);
      if (direct) return draftGroupingKey(direct);
      const merged = mergedDrafts.find((draft) => draft.id === id);
      return merged ? draftGroupingKey(merged) : null;
    },
    [drafts, mergedDrafts]
  );

  const applyDraftUpdate = useCallback(
    (updater: (current: DraftRow[]) => DraftRow[]) => {
      setDrafts((previous) => {
        const next = applyDerivedCostBasisToDrafts(updater(previous));
        if (mergeAccounts) {
          setMergedDrafts((prevMerged) => mergeDraftRows(next, prevMerged));
        }
        return next;
      });
    },
    [mergeAccounts]
  );

  const handleStartUpload = useCallback(() => {
    setError(null);
    setSaveHoldingsError(null);
    setRawTexts([]);
    setPreviews([]);
    setDrafts([]);
    setMergedDrafts([]);
    setTipsVisible(false);
    setFeedbackMessage(null);
    setMode('upload');
  }, []);

  const handleShowDashboard = useCallback(() => {
    setMode('dashboard');
    void refreshHoldings();
  }, [refreshHoldings]);

  const hydrateDrafts = useCallback(
    (incoming: DraftRow[]) => applyDerivedCostBasisToDrafts(mergeCostBasisFromHistory(incoming, holdings)),
    [holdings]
  );

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
    if (mode === 'loading') {
      setMode(holdings.length ? 'dashboard' : 'upload');
    } else if (mode === 'dashboard' && holdings.length === 0) {
      setMode('upload');
    }
  }, [mode, holdings.length]);

  useEffect(() => {
    if (holdingsError && mode === 'loading') {
      setMode('upload');
    }
  }, [holdingsError, mode]);

  useEffect(() => {
    if (!mergeAccounts) return;
    setMergedDrafts((previous) => mergeDraftRows(drafts, previous));
  }, [drafts, mergeAccounts]);

  useEffect(() => {
    if (!userId || mode !== 'upload') return;
    void (async () => {
      const remote = await loadDraftsRemote(userId);
      if (remote && remote.length) {
        setDrafts(hydrateDrafts(remote));
      } else {
        const local = loadDraftsLocal();
        if (local.length) setDrafts(hydrateDrafts(local));
      }
    })();
  }, [userId, mode, hydrateDrafts]);

  useEffect(() => {
    if (!userId || mode !== 'upload') return;
    persistDraftsLocal(drafts);
    void saveDraftsRemote(drafts, true, userId);
  }, [drafts, userId, mode]);

  const activeDrafts = mergeAccounts ? mergedDrafts : drafts;
  const equityDrafts = activeDrafts.filter((draft) => (draft.assetType ?? 'equity') !== 'option');
  const optionDrafts = activeDrafts.filter((draft) => (draft.assetType ?? 'equity') === 'option');

  const selectedCount = useMemo(
    () => (mode === 'upload' ? activeDrafts.filter((draft) => draft.selected).length : 0),
    [activeDrafts, mode]
  );
  const readyCount = useMemo(
    () => (mode === 'upload' ? activeDrafts.filter((draft) => draft.selected && isDraftReady(draft)).length : 0),
    [activeDrafts, mode]
  );
  const missingCostCount = useMemo(
    () =>
      mode === 'upload'
        ? activeDrafts.filter((draft) => {
            if (!draft.selected) return false;
            const historyHolding = historyMap.get(draft.ticker.toUpperCase());
            const resolved = draft.costBasis ?? historyHolding?.costBasis ?? null;
            return resolved === null || resolved === undefined;
          }).length
        : 0,
    [activeDrafts, mode, historyMap]
  );

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    setTipsVisible(false);
    setFeedbackMessage(null);
    if (!userId) {
      setError('Cannot upload without a session. Please refresh and try again.');
      return;
    }
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    setUploading(true);
    try {
      const prepared = await Promise.all(
        fileArray.map(
          (file) =>
            new Promise<{ file: File; base64: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result;
                if (typeof result === 'string') resolve({ file, base64: result });
                else reject(new Error('Unable to read file'));
              };
              reader.onerror = () => reject(reader.error ?? new Error('File read error'));
              reader.readAsDataURL(file);
            })
        )
      );

      const uploadPayload = prepared.map(({ file, base64 }) => ({
        imageBase64: base64,
        filename: file.name,
        size: file.size,
        userId,
      }));

      const uploadRes = await fetch('/api/portfolio/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ uploads: uploadPayload, userId }),
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      const uploadRecords: Array<{ id?: string; path?: string; filename?: string | null }> =
        Array.isArray(uploadData?.uploads) ? uploadData.uploads : [];

      const parsedDrafts: DraftRow[] = [];
      for (const [index, item] of prepared.entries()) {
        const uploadMeta = uploadRecords[index] ?? {};
        const visionRes = await fetch('/api/vision/analyze?useGemini=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: item.base64 }),
        });
        if (!visionRes.ok) {
          const data = await visionRes.json().catch(() => ({}));
          throw new Error(data?.error || `Vision error ${visionRes.status}`);
        }
        const data = (await visionRes.json()) as VisionAnalysisResult;
        setRawTexts((prev) => [...prev, data.text ?? '']);
        const parsed = hydrateDrafts(await parseHoldingsFromVision(data)).map((draft) => ({
          ...draft,
          uploadId: uploadMeta?.id ?? uploadMeta?.path ?? null,
          uploadName: uploadMeta?.filename ?? item.file.name,
        }));
        parsedDrafts.push(...parsed);
        setPreviews((prev) => [
          ...prev,
          {
            id: uploadMeta?.id ?? item.file.name ?? String(index),
            name: item.file.name,
            image: item.base64,
            path: uploadMeta?.path,
          },
        ]);
      }

      if (!parsedDrafts.length) {
        setTipsVisible(true);
      }
      console.info('ocr.upload.summary', {
        uploads: uploadRecords.length,
        drafts: parsedDrafts.length,
        selected: parsedDrafts.filter((draft) => draft.selected).length,
      });
      applyDraftUpdate((prev) => hydrateDrafts([...prev, ...parsedDrafts]));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    void handleFiles(files);
    event.target.value = '';
  };

  const handleDraftChange = (id: string, field: keyof DraftHolding, value: string) => {
    const numericValue = parseNumber(value);
    const toDraftValue = (draft: DraftRow) => {
      if (field === 'ticker') {
        return { ...draft, ticker: value.toUpperCase() };
      }
      if (field === 'contracts') {
        return {
          ...draft,
          contracts: numericValue,
          shares: draft.assetType === 'option' ? numericValue : draft.shares,
        };
      }
      return {
        ...draft,
        [field]: numericValue,
        costBasisSource: field === 'costBasis' ? 'manual' : draft.costBasisSource,
      };
    };

    if (mergeAccounts) {
      const groupKey = findGroupKeyForDraft(id);
      if (!groupKey) return;
      applyDraftUpdate((list) => {
        const group = list.filter((draft) => draftGroupingKey(draft) === groupKey);
        if (!group.length) return list;
        if (field === 'shares' || field === 'contracts') {
          const nextShares = parseNumber(value);
          const currentTotal = group.reduce((sum, draft) => sum + (draft.shares ?? 0), 0);
          const divisor = group.length || 1;
          return list.map((draft) => {
            if (draftGroupingKey(draft) !== groupKey) return draft;
            const distributed =
              nextShares === null
                ? null
                : currentTotal > 0
                  ? (draft.shares ?? 0) * (nextShares / currentTotal)
                  : nextShares / divisor;
            return {
              ...draft,
              shares: distributed,
              contracts: field === 'contracts' ? distributed : draft.contracts,
            };
          });
        }
        return list.map((draft) => (draftGroupingKey(draft) === groupKey ? toDraftValue(draft) : draft));
      });
      return;
    }

    applyDraftUpdate((list) => list.map((draft) => (draft.id === id ? toDraftValue(draft) : draft)));
  };

  const toggleSelected = (id: string) => {
    if (mergeAccounts) {
      const groupKey = findGroupKeyForDraft(id);
      if (!groupKey) return;
      applyDraftUpdate((prev) =>
        prev.map((draft) =>
          draftGroupingKey(draft) === groupKey ? { ...draft, selected: !draft.selected } : draft
        )
      );
      return;
    }
    applyDraftUpdate((prev) => prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d)));
  };

  const removeDraft = (id: string) => {
    if (mergeAccounts) {
      const groupKey = findGroupKeyForDraft(id);
      if (!groupKey) return;
      applyDraftUpdate((prev) => prev.filter((draft) => draftGroupingKey(draft) !== groupKey));
      return;
    }
    applyDraftUpdate((prev) => prev.filter((d) => d.id !== id));
  };

  const setDraftInputValue = (
    id: string,
    field: 'ticker' | 'shares' | 'contracts' | 'costBasis' | 'marketValue' | 'optionStrike' | 'optionExpiration',
    value: string
  ) => {
    setDraftInputs((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const clearDraftInputValue = (
    id: string,
    field: 'ticker' | 'shares' | 'contracts' | 'costBasis' | 'marketValue' | 'optionStrike' | 'optionExpiration'
  ) => {
    setDraftInputs((prev) => {
      const current = prev[id];
      if (!current) return prev;
      const { [field]: _removed, ...rest } = current;
      const next = { ...prev };
      if (Object.keys(rest).length === 0) {
        delete next[id];
      } else {
        next[id] = rest;
      }
      return next;
    });
  };

  const getDraftInputValue = (
    draft: DraftRow,
    field: 'ticker' | 'shares' | 'contracts' | 'costBasis' | 'marketValue' | 'optionStrike' | 'optionExpiration'
  ): string => {
    const value = draftInputs[draft.id]?.[field];
    if (value !== undefined) return value;
    const fallback = draft[field];
    return fallback === null || fallback === undefined ? '' : String(fallback);
  };

  const renderConfidenceBadge = (value?: number | null) => {
    const confidence = value ?? 0;
    const label = formatConfidence(confidence);
    const tone =
      confidence >= 0.8
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
        : confidence >= 0.5
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${tone}`}>
        {label}
      </span>
    );
  };

  const renderBrokerBadge = (value?: string | null) => {
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
  };

  const handleDraftStringChange = (
    id: string,
    field: 'optionExpiration' | 'optionRight' | 'buySell',
    value: string
  ) => {
    const normalized =
      field === 'optionRight'
        ? value.toLowerCase()
        : field === 'buySell'
          ? value.toLowerCase()
          : value;
    if (mergeAccounts) {
      const groupKey = findGroupKeyForDraft(id);
      if (!groupKey) return;
      applyDraftUpdate((list) =>
        list.map((draft) =>
          draftGroupingKey(draft) === groupKey ? { ...draft, [field]: normalized } : draft
        )
      );
      return;
    }
    applyDraftUpdate((list) => list.map((draft) => (draft.id === id ? { ...draft, [field]: normalized } : draft)));
  };

  const handleFeedback = (ok: boolean) => {
    setFeedbackMessage(ok ? 'Thanks! We will keep refining the OCR.' : 'Thanks! We will use this to improve parsing.');
    console.info('ocr.feedback', {
      ok,
      drafts: activeDrafts.length,
      uploads: previews.length,
    });
  };

  const handleReportIssue = () => {
    console.warn('ocr.reportIssue', {
      uploads: previews.map((preview) => preview.path ?? preview.name),
      drafts: activeDrafts.length,
    });
    setFeedbackMessage('Issue report logged. Thanks for the feedback.');
  };

  const resetManualForm = useCallback(() => {
    setManualFields({
      ticker: '',
      shares: '',
      contracts: '',
      costBasis: '',
      marketValue: '',
      optionStrike: '',
      optionExpiration: '',
      optionRight: '',
      buySell: '',
    });
    setManualError(null);
  }, []);

  const handleAddManualDraft = () => {
    setManualOpen(true);
    resetManualForm();
  };

  const handleSaveManualDraft = () => {
    const ticker = manualFields.ticker.trim().toUpperCase();
    if (!isTickerFormatValid(ticker)) {
      setManualError('Enter a valid ticker (A-Z, 1-6 chars).');
      return;
    }
    if (manualType === 'equity') {
      const shares = parseNumber(manualFields.shares);
      if (!shares || shares <= 0) {
        setManualError('Enter a share count greater than zero.');
        return;
      }
      const costBasis = parseNumber(manualFields.costBasis);
      const marketValue = parseNumber(manualFields.marketValue);
      const saveEquity = async () => {
        if (!userId) {
          setManualError('Missing user session. Please refresh and try again.');
          return;
        }
        const payload = [
          {
            ticker,
            shareQty: shares,
            assetType: 'equity',
            costBasis: costBasis ?? null,
            marketValue: marketValue ?? null,
            confidence: 1,
            source: 'manual',
          },
        ];
        const res = await fetch('/api/portfolio/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
          body: JSON.stringify({ holdings: payload, replace: false }),
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
          throw new Error(message || `Failed to save holding (${res.status})`);
        }
        await refreshHoldings();
        setManualOpen(false);
        resetManualForm();
      };
      void saveEquity().catch((err) => {
        console.error('Failed to save manual holding', err);
        setManualError(err instanceof Error ? err.message : 'Failed to save holding');
      });
      return;
    }

    const contracts = parseNumber(manualFields.contracts);
    if (!contracts || contracts <= 0) {
      setManualError('Enter a contracts count greater than zero.');
      return;
    }
    const optionStrike = parseNumber(manualFields.optionStrike);
    if (!optionStrike || optionStrike <= 0) {
      setManualError('Enter a strike price.');
      return;
    }
    if (!isOptionExpirationValid(manualFields.optionExpiration)) {
      setManualError('Enter a valid expiration (e.g., 1/17/2026).');
      return;
    }
    const optionRight = manualFields.optionRight === 'call' || manualFields.optionRight === 'put'
      ? manualFields.optionRight
      : null;
    if (!optionRight) {
      setManualError('Select call or put.');
      return;
    }
    const buySell = manualFields.buySell === 'buy' || manualFields.buySell === 'sell'
      ? manualFields.buySell
      : null;
    if (!buySell) {
      setManualError('Select buy or sell.');
      return;
    }
    const costBasis = parseNumber(manualFields.costBasis);
    const marketValue = parseNumber(manualFields.marketValue);
    const saveOption = async () => {
      if (!userId) {
        setManualError('Missing user session. Please refresh and try again.');
        return;
      }
      const payload = [
        {
          ticker,
          shareQty: contracts,
          optionStrike,
          optionExpiration: manualFields.optionExpiration.trim(),
          optionRight,
          buySell,
          costBasis: costBasis ?? null,
          marketValue: marketValue ?? null,
          confidence: 1,
          source: 'manual',
        },
      ];
      const res = await fetch('/api/portfolio/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ options: payload, replace: false }),
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
        throw new Error(message || `Failed to save option (${res.status})`);
      }
      await refreshHoldings();
      setManualOpen(false);
      resetManualForm();
    };
    void saveOption().catch((err) => {
      console.error('Failed to save manual option', err);
      setManualError(err instanceof Error ? err.message : 'Failed to save option');
    });
  };

  const handleCommit = async () => {
    if (!userId) {
      setError('Cannot save holdings without a session. Please refresh and try again.');
      return;
    }
    const workingDrafts = mergeAccounts ? mergedDrafts : drafts;
    const readyDrafts = workingDrafts.filter((draft) => draft.selected && isDraftReady(draft));
    if (!readyDrafts.length) {
      setSaveHoldingsError('Select at least one holding with a valid share count.');
      return;
    }

    const invalidTickers = readyDrafts
      .filter((draft) => !isTickerFormatValid(draft.ticker))
      .map((draft) => draft.ticker);
    if (invalidTickers.length) {
      setSaveHoldingsError(
        `Fix invalid tickers: ${invalidTickers.slice(0, 4).join(', ')}${invalidTickers.length > 4 ? '…' : ''}`
      );
      return;
    }

    const invalidOptions = readyDrafts
      .filter((draft) => (draft.assetType ?? 'equity') === 'option')
      .filter(
        (draft) =>
          !draft.optionStrike ||
          draft.optionStrike <= 0 ||
          !isOptionExpirationValid(draft.optionExpiration ?? null)
      )
      .map((draft) => draft.ticker);
    if (invalidOptions.length) {
      setSaveHoldingsError(
        `Options need strike/expiration: ${invalidOptions.slice(0, 4).join(', ')}${
          invalidOptions.length > 4 ? '…' : ''
        }`
      );
      return;
    }

    const uniqueTickers = Array.from(new Set(readyDrafts.map((draft) => draft.ticker.toUpperCase())));
    if (uniqueTickers.length) {
      try {
        const validateRes = await fetch(
          `/api/stocks/validate?symbols=${encodeURIComponent(uniqueTickers.join(','))}`
        );
        if (!validateRes.ok) {
          const text = await validateRes.text().catch(() => '');
          throw new Error(text || `Ticker validation failed (${validateRes.status})`);
        }
        const data = (await validateRes.json()) as { invalid?: string[] };
        if (data?.invalid?.length) {
          setSaveHoldingsError(`Alpaca could not validate: ${data.invalid.slice(0, 4).join(', ')}${data.invalid.length > 4 ? '…' : ''}`);
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to validate tickers with Alpaca.';
        setSaveHoldingsError(message);
        return;
      }
    }

    const missingCost = readyDrafts
      .map((draft) => ({
        draft,
        history: historyMap.get(draft.ticker.toUpperCase()),
      }))
      .filter(({ draft, history }) => (draft.costBasis ?? history?.costBasis ?? null) === null)
      .map(({ draft }) => draft.ticker);
    if (missingCost.length) {
      setSaveHoldingsError(`Add cost basis for ${missingCost.slice(0, 3).join(', ')}${missingCost.length > 3 ? '…' : ''}`);
      return;
    }

    setSavingHoldings(true);
    setSaveHoldingsError(null);
    try {
      const historyByTicker = new Map(
        holdings.map((holding) => [holding.ticker?.toUpperCase?.() ?? '', holding])
      );
      const isUuid = (value?: string | null) =>
        Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
      const equityDrafts = readyDrafts.filter((draft) => (draft.assetType ?? 'equity') !== 'option');
      const optionDrafts = readyDrafts.filter((draft) => (draft.assetType ?? 'equity') === 'option');

      const holdingsPayload = equityDrafts.map((draft) => {
        const existing = historyByTicker.get(draft.ticker.toUpperCase());
        const costBasis = draft.costBasis ?? existing?.costBasis ?? null;
        const brokerValue = draft.broker ?? detectBrokerage(draft.source)?.value ?? null;
        return {
          id: existing?.id ?? (isUuid(draft.id) ? draft.id : undefined),
          ticker: draft.ticker,
          shareQty: draft.shares,
          assetType: draft.assetType ?? existing?.type ?? 'equity',
          optionStrike: draft.optionStrike ?? existing?.optionStrike ?? null,
          optionExpiration: draft.optionExpiration ?? existing?.optionExpiration ?? null,
          optionRight: draft.optionRight ?? existing?.optionRight ?? null,
          costBasis,
          marketValue:
            draft.marketValue ??
            (costBasis && draft.shares ? costBasis * draft.shares : null) ??
            existing?.marketValue ??
            null,
          confidence: draft.confidence ?? existing?.confidence ?? null,
          source: brokerValue ?? existing?.source ?? null,
          draftId: isUuid(draft.id) ? draft.id : null,
          uploadId: draft.uploadId ?? existing?.uploadId ?? null,
        };
      });

      if (holdingsPayload.length) {
        const res = await fetch('/api/portfolio/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
          body: JSON.stringify({ holdings: holdingsPayload, replace: false }),
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
      }

      if (optionDrafts.length) {
        const optionsPayload = optionDrafts.map((draft) => ({
          id: isUuid(draft.id) ? draft.id : undefined,
          ticker: draft.ticker,
          shareQty: draft.contracts ?? draft.shares,
          optionStrike: draft.optionStrike ?? null,
          optionExpiration: draft.optionExpiration ?? null,
          optionRight: draft.optionRight ?? null,
          buySell: draft.buySell ?? null,
          costBasis: draft.costBasis ?? null,
          marketValue: draft.marketValue ?? null,
          confidence: draft.confidence ?? null,
          source: draft.broker ?? detectBrokerage(draft.source)?.value ?? null,
          draftId: isUuid(draft.id) ? draft.id : null,
          uploadId: draft.uploadId ?? null,
        }));
        const res = await fetch('/api/portfolio/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
          body: JSON.stringify({ options: optionsPayload, replace: false }),
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
          throw new Error(message || `Failed to save options (${res.status})`);
        }
      }

      mergeStocksFromDrafts(equityDrafts);
      if (mergeAccounts) {
        const readyKeys = new Set(readyDrafts.map((draft) => draftGroupingKey(draft)));
        const keptRaw = drafts.filter((draft) => !readyKeys.has(draftGroupingKey(draft)));
        const keptMerged = mergedDrafts.filter((draft) => !readyKeys.has(draftGroupingKey(draft)));
        setDrafts(keptRaw);
        setMergedDrafts(keptMerged);
        await saveDraftsRemote(keptRaw, true, userId);
      } else {
        const readyIds = new Set(readyDrafts.map((draft) => draft.id));
        const kept = drafts.filter((draft) => !readyIds.has(draft.id));
        setDrafts(kept);
        await saveDraftsRemote(kept, true, userId);
      }
      await refreshHoldings();
      setMode('dashboard');
    } catch (err) {
      console.error('Failed to save holdings to Supabase', err);
      setSaveHoldingsError(err instanceof Error ? err.message : 'Failed to save holdings');
    } finally {
      setSavingHoldings(false);
    }
  };

  const handleDeleteHolding = async (id: string) => {
    if (!userId) return;
    setDeletingHoldingId(id);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/holdings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = text;
        try {
          const parsed = text ? (JSON.parse(text) as { error?: string }) : null;
          message = parsed?.error ?? message;
        } catch {
          // ignore parse errors; fallback to raw text
        }
        throw new Error(message || `Failed to delete holding (${res.status})`);
      }
      await refreshHoldings();
    } catch (err) {
      console.error('Failed to delete holding', err);
      setError(err instanceof Error ? err.message : 'Failed to delete holding');
    } finally {
      setDeletingHoldingId(null);
    }
  };

  const handleDeleteOption = async (id: string) => {
    if (!userId) return;
    setDeletingOptionId(id);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/options', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = text;
        try {
          const parsed = text ? (JSON.parse(text) as { error?: string }) : null;
          message = parsed?.error ?? message;
        } catch {
          // ignore parse errors; fallback to raw text
        }
        throw new Error(message || `Failed to delete option (${res.status})`);
      }
      await refreshHoldings();
    } catch (err) {
      console.error('Failed to delete option', err);
      setError(err instanceof Error ? err.message : 'Failed to delete option');
    } finally {
      setDeletingOptionId(null);
    }
  };

  const handleUpdateOption = async (
    id: string,
    updates: { costBasis?: number | null; shareQty?: number | null }
  ) => {
    if (!userId) return;
    const option = options.find((row) => row.id === id);
    if (!option) return;
    setError(null);
    try {
      const payload = {
        id: option.id,
        ticker: option.ticker,
        shareQty: updates.shareQty ?? option.shareQty,
        optionStrike: option.optionStrike ?? null,
        optionExpiration: option.optionExpiration ?? null,
        optionRight: option.optionRight ?? null,
        buySell: option.buySell ?? null,
        costBasis: updates.costBasis ?? option.costBasis ?? null,
        marketValue: option.marketValue ?? null,
        confidence: option.confidence ?? null,
        source: option.source ?? null,
        uploadId: option.uploadId ?? null,
        draftId: option.draftId ?? null,
      };
      const res = await fetch('/api/portfolio/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [USER_HEADER_KEY]: userId },
        body: JSON.stringify({ options: [payload], replace: false }),
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
        throw new Error(message || `Failed to update option (${res.status})`);
      }
      await refreshHoldings();
    } catch (err) {
      console.error('Failed to update option', err);
      setError(err instanceof Error ? err.message : 'Failed to update option');
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
          options={options}
          stats={portfolioStats}
          loading={holdingsLoading}
          error={holdingsError}
          onUploadClick={handleStartUpload}
          onRefresh={handleRefreshHoldings}
          onDeleteHolding={handleDeleteHolding}
          deletingId={deletingHoldingId}
          onDeleteOption={handleDeleteOption}
          deletingOptionId={deletingOptionId}
          onUpdateOption={handleUpdateOption}
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddManualDraft}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                Add manual holding
              </button>
              {holdings.length > 0 && (
                <button
                  onClick={handleShowDashboard}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  View Portfolio
                </button>
              )}
            </div>
          </header>

          {holdingsError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-500">
              <AlertCircle size={16} /> {holdingsError}
            </div>
          )}

          <section className="mb-8">
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 cursor-pointer hover:border-blue-500 transition bg-white dark:bg-gray-800">
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />
              <Upload size={32} className="text-blue-500" />
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                Drag & drop images here, or <span className="text-blue-500">browse</span> (multi-file supported)
              </div>
              {uploading && <div className="text-sm text-blue-500">Analyzing screenshot…</div>}
            </label>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
                <AlertCircle size={16} /> {error}
              </div>
            )}
          </section>

          {manualOpen && (
            <section className="mb-8 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Manual entry</span>
                <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setManualType('equity')}
                    className={`px-3 py-1.5 text-xs font-semibold ${
                      manualType === 'equity'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    Equity
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualType('option')}
                    className={`px-3 py-1.5 text-xs font-semibold ${
                      manualType === 'option'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    Option
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-gray-600 dark:text-gray-300">
                  Ticker
                  <input
                    value={manualFields.ticker}
                    onChange={(e) => setManualFields((prev) => ({ ...prev, ticker: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                  />
                </label>
                {manualType === 'equity' ? (
                  <>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Shares
                      <input
                        value={manualFields.shares}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, shares: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Cost Basis
                      <input
                        value={manualFields.costBasis}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, costBasis: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Market Value
                      <input
                        value={manualFields.marketValue}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, marketValue: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Contracts
                      <input
                        value={manualFields.contracts}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, contracts: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Buy/Sell
                      <select
                        value={manualFields.buySell}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, buySell: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      >
                        <option value="">Select</option>
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                      </select>
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Right
                      <select
                        value={manualFields.optionRight}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, optionRight: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      >
                        <option value="">Select</option>
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                      </select>
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Strike
                      <input
                        value={manualFields.optionStrike}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, optionStrike: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Expiration
                      <input
                        value={manualFields.optionExpiration}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, optionExpiration: e.target.value }))}
                        placeholder="1/17/2026"
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Cost Basis
                      <input
                        value={manualFields.costBasis}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, costBasis: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                      Market Value
                      <input
                        value={manualFields.marketValue}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, marketValue: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      />
                    </label>
                  </>
                )}
              </div>
              {manualError && (
                <p className="mt-3 text-xs text-red-600">{manualError}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveManualDraft}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-md"
                >
                  Save holding
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualOpen(false);
                    resetManualForm();
                  }}
                  className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold px-3 py-2 rounded-md"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {previews.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-lg">Upload Previews</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{previews.length} file{previews.length === 1 ? '' : 's'}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {previews.map((preview) => (
                  <article
                    key={preview.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
                  >
                    <div className="relative h-48 bg-gray-100 dark:bg-gray-900">
                      <Image
                        src={preview.image}
                        alt={preview.name}
                        fill
                        className="object-contain p-3"
                        unoptimized
                      />
                    </div>
                    <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
                      <p className="font-semibold truncate">{preview.name}</p>
                      {preview.path && <p className="text-xs text-gray-500">{preview.path}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {tipsVisible && (
            <section className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
              <p className="font-semibold mb-2">Couldn&apos;t detect any holdings.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Try cropping the screenshot to the holdings area.</li>
                <li>Zoom in so the ticker and share count are readable.</li>
                <li>Use a light theme if possible to boost OCR clarity.</li>
              </ul>
            </section>
          )}

          {activeDrafts.length > 0 && (
            <section className="mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">
                  Detected Holdings ({selectedCount} selected, {readyCount} ready)
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <button
                    type="button"
                    onClick={handleAddManualDraft}
                    className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 text-sm font-semibold px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    Add manual holding
                  </button>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={mergeAccounts}
                      onChange={(e) => setMergeAccounts(e.target.checked)}
                    />
                    <span className="inline-flex items-center gap-1">
                      <Shuffle size={14} /> Merge Accounts
                    </span>
                  </label>
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
              </div>
              {selectedCount > 0 && readyCount === 0 && (
                <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">
                  Add share counts for the selected rows to continue.
                </p>
              )}
              {missingCostCount > 0 && (
                <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">
                  {missingCostCount} row{missingCostCount === 1 ? '' : 's'} need a cost basis to keep P&amp;L accurate.
                </p>
              )}
              {saveHoldingsError && (
                <div className="mb-3 flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle size={16} /> {saveHoldingsError}
                </div>
              )}
              <div className="mb-4 flex flex-col gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm text-gray-700 dark:text-gray-200">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">Did this extract correctly?</span>
                  <button
                    type="button"
                    onClick={() => handleFeedback(true)}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                  >
                    Yes, looks good
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFeedback(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Needs fixes
                  </button>
                  <button
                    type="button"
                    onClick={handleReportIssue}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    Report Issue
                  </button>
                </div>
                {feedbackMessage && <p className="text-xs text-gray-600 dark:text-gray-300">{feedbackMessage}</p>}
              </div>
              <div className="overflow-x-auto">
                {equityDrafts.length > 0 && (
                  <table className="min-w-full text-xs sm:text-sm bg-white dark:bg-gray-800 rounded-md shadow">
                    <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      <tr>
                        <th className="p-3 text-left">Use</th>
                        <th className="p-3 text-left">Ticker</th>
                        <th className="p-3 text-left">Type</th>
                        <th className="p-3 text-left">Shares</th>
                        <th className="p-3 text-left">Cost Basis</th>
                        <th className="p-3 text-left">Market Value</th>
                        <th className="p-3 text-left">Live</th>
                        <th className="p-3 text-left">Confidence</th>
                        <th className="p-3 text-left">Source</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {equityDrafts.map((draft) => {
                        const historyHolding = historyMap.get(draft.ticker.toUpperCase());
                        const resolvedCostBasis = draft.costBasis ?? historyHolding?.costBasis ?? null;
                        const costBasisMissing = resolvedCostBasis === null || resolvedCostBasis === undefined;
                        const lastKnownCost = historyHolding?.costBasis ?? undefined;
                        const costBasisPlaceholder =
                          draft.costBasisSource === 'history' || costBasisMissing ? lastKnownCost : undefined;
                        const detectedBroker = draft.broker ?? detectBrokerage(draft.source)?.value ?? null;
                        const tickerInput = getDraftInputValue(draft, 'ticker');
                        const tickerValid = isTickerFormatValid(tickerInput);
                        const sharesInput = getDraftInputValue(draft, 'shares');
                        const sharesValue = parseNumber(sharesInput);
                        const sharesValid = sharesValue !== null && sharesValue > 0;

                        return (
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
                            <div className="flex flex-col gap-1">
                              <input
                                value={getDraftInputValue(draft, 'ticker')}
                                onChange={(e) => setDraftInputValue(draft.id, 'ticker', e.target.value)}
                                onBlur={() => {
                                  const value = draftInputs[draft.id]?.ticker ?? '';
                                  handleDraftChange(draft.id, 'ticker', value);
                                  clearDraftInputValue(draft.id, 'ticker');
                                }}
                                className={`w-24 rounded-md border px-2 py-1 text-sm ${
                                  tickerValid
                                    ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                                    : 'border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-900/30'
                                }`}
                              />
                              {draft.assetType === 'option' && (
                                <div className="text-[11px] text-gray-600 dark:text-gray-300">
                                  {draft.optionStrike ? `$${draft.optionStrike}` : '—'}{' '}
                                  {draft.optionRight ? draft.optionRight.toUpperCase() : 'OPTION'}{' '}
                                  {draft.optionExpiration ?? ''}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
                              {draft.assetType === 'option' ? 'Option' : 'Equity'}
                            </span>
                          </td>
                          <td className="p-3">
                            <input
                              value={getDraftInputValue(draft, 'shares')}
                              onChange={(e) => setDraftInputValue(draft.id, 'shares', e.target.value)}
                              onBlur={() => {
                                const value = draftInputs[draft.id]?.shares ?? '';
                                handleDraftChange(draft.id, 'shares', value);
                                clearDraftInputValue(draft.id, 'shares');
                              }}
                              className={`w-24 rounded-md border px-2 py-1 text-sm ${
                                sharesValid
                                  ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                                  : 'border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-900/30'
                              }`}
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={getDraftInputValue(draft, 'costBasis')}
                              placeholder={costBasisPlaceholder ? costBasisPlaceholder.toString() : undefined}
                              onChange={(e) => setDraftInputValue(draft.id, 'costBasis', e.target.value)}
                              onBlur={() => {
                                const value = draftInputs[draft.id]?.costBasis ?? '';
                                handleDraftChange(draft.id, 'costBasis', value);
                                clearDraftInputValue(draft.id, 'costBasis');
                              }}
                              className={`w-28 rounded-md border px-2 py-1 text-sm ${
                                costBasisMissing
                                  ? 'border-amber-500 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/30'
                                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                              }`}
                            />
                            {costBasisMissing ? (
                              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                Add cost basis to lock in P&amp;L.
                              </p>
                            ) : draft.costBasisSource === 'history' ? (
                              <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">Using last saved value</p>
                            ) : null}
                          </td>
                          <td className="p-3">
                            <input
                              value={getDraftInputValue(draft, 'marketValue')}
                              onChange={(e) => setDraftInputValue(draft.id, 'marketValue', e.target.value)}
                              onBlur={() => {
                                const value = draftInputs[draft.id]?.marketValue ?? '';
                                handleDraftChange(draft.id, 'marketValue', value);
                                clearDraftInputValue(draft.id, 'marketValue');
                              }}
                              className="w-28 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="p-3">
                            {historyHolding?.livePrice || historyHolding?.liveGain ? (
                              <div className="text-xs text-gray-700 dark:text-gray-200">
                                <div>
                                  ${historyHolding.livePrice?.toFixed(2) ?? '—'}{' '}
                                  <span className="text-[11px] text-gray-500">/share</span>
                                </div>
                                <div
                                  className={
                                    historyHolding.liveGain !== null && historyHolding.liveGain !== undefined
                                      ? historyHolding.liveGain >= 0
                                        ? 'text-emerald-600'
                                        : 'text-rose-600'
                                      : 'text-gray-500'
                                  }
                                >
                                  {historyHolding.liveGain !== null && historyHolding.liveGain !== undefined
                                    ? `${historyHolding.liveGain >= 0 ? '+' : ''}$${historyHolding.liveGain.toFixed(2)}`
                                    : '—'}{' '}
                                  {historyHolding.liveGainPercent !== null &&
                                  historyHolding.liveGainPercent !== undefined
                                    ? `(${(historyHolding.liveGainPercent * 100).toFixed(2)}%)`
                                    : ''}
                                </div>
                                <div className="text-[11px] text-gray-500">from Alpaca</div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="p-3">{renderConfidenceBadge(draft.confidence)}</td>
                          <td className="p-3">
                            <div className="flex flex-col gap-2">
                              {renderBrokerBadge(detectedBroker)}
                              <select
                                value={detectedBroker ?? ''}
                                onChange={(e) => {
                                  const next = e.target.value || null;
                                  if (mergeAccounts) {
                                    const groupKey = findGroupKeyForDraft(draft.id);
                                    if (!groupKey) return;
                                    applyDraftUpdate((list) =>
                                      list.map((item) =>
                                        draftGroupingKey(item) === groupKey ? { ...item, broker: next } : item
                                      )
                                    );
                                  } else {
                                    applyDraftUpdate((list) =>
                                      list.map((item) => (item.id === draft.id ? { ...item, broker: next } : item))
                                    );
                                  }
                                }}
                                className="w-40 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                              >
                                <option value="">Unknown</option>
                                {BROKERAGE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {draft.uploadName && (
                                <span className="text-[11px] text-gray-400">{draft.uploadName}</span>
                              )}
                            </div>
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
                      );
                    })}
                  </tbody>
                </table>
                )}
                {optionDrafts.length > 0 && (
                  <table className="mt-6 min-w-full text-xs sm:text-sm bg-white dark:bg-gray-800 rounded-md shadow">
                    <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      <tr>
                        <th className="p-3 text-left">Use</th>
                        <th className="p-3 text-left">Ticker</th>
                        <th className="p-3 text-left">Type</th>
                        <th className="p-3 text-left">Contracts</th>
                        <th className="p-3 text-left">Buy/Sell</th>
                        <th className="p-3 text-left">Right</th>
                        <th className="p-3 text-left">Strike</th>
                        <th className="p-3 text-left">Expiration</th>
                        <th className="p-3 text-left">Market Value</th>
                        <th className="p-3 text-left">Confidence</th>
                        <th className="p-3 text-left">Source</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {optionDrafts.map((draft) => {
                        const detectedBroker = draft.broker ?? detectBrokerage(draft.source)?.value ?? null;
                        const tickerInput = getDraftInputValue(draft, 'ticker');
                        const tickerValid = isTickerFormatValid(tickerInput);
                        const contractsInput = getDraftInputValue(draft, 'contracts');
                        const contractsValue = parseNumber(contractsInput);
                        const contractsValid = contractsValue !== null && contractsValue > 0;
                        const strikeInput = getDraftInputValue(draft, 'optionStrike');
                        const strikeValue = parseNumber(strikeInput);
                        const strikeValid = strikeValue !== null && strikeValue > 0;
                        const expirationInput = getDraftInputValue(draft, 'optionExpiration');
                        const expirationValid = isOptionExpirationValid(expirationInput);
                        return (
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
                                value={getDraftInputValue(draft, 'ticker')}
                                onChange={(e) => setDraftInputValue(draft.id, 'ticker', e.target.value)}
                                onBlur={() => {
                                  const value = draftInputs[draft.id]?.ticker ?? '';
                                  handleDraftChange(draft.id, 'ticker', value);
                                  clearDraftInputValue(draft.id, 'ticker');
                                }}
                                className={`w-24 rounded-md border px-2 py-1 text-sm ${
                                  tickerValid
                                    ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                                    : 'border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-900/30'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <span className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
                                Option
                              </span>
                            </td>
                            <td className="p-3">
                              <input
                                value={getDraftInputValue(draft, 'contracts')}
                                onChange={(e) => setDraftInputValue(draft.id, 'contracts', e.target.value)}
                                onBlur={() => {
                                  const value = draftInputs[draft.id]?.contracts ?? '';
                                  handleDraftChange(draft.id, 'contracts', value);
                                  clearDraftInputValue(draft.id, 'contracts');
                                }}
                                className={`w-20 rounded-md border px-2 py-1 text-sm ${
                                  contractsValid
                                    ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                                    : 'border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-900/30'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <select
                                value={draft.buySell ?? ''}
                                onChange={(e) => handleDraftStringChange(draft.id, 'buySell', e.target.value)}
                                className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                              >
                                <option value="">—</option>
                                <option value="buy">Buy</option>
                                <option value="sell">Sell</option>
                              </select>
                            </td>
                            <td className="p-3">
                              <select
                                value={draft.optionRight ?? ''}
                                onChange={(e) => handleDraftStringChange(draft.id, 'optionRight', e.target.value)}
                                className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                              >
                                <option value="">—</option>
                                <option value="call">Call</option>
                                <option value="put">Put</option>
                              </select>
                            </td>
                            <td className="p-3">
                              <input
                                value={getDraftInputValue(draft, 'optionStrike')}
                                onChange={(e) => setDraftInputValue(draft.id, 'optionStrike', e.target.value)}
                                onBlur={() => {
                                  const value = draftInputs[draft.id]?.optionStrike ?? '';
                                  handleDraftChange(draft.id, 'optionStrike', value);
                                  clearDraftInputValue(draft.id, 'optionStrike');
                                }}
                                className={`w-24 rounded-md border px-2 py-1 text-sm ${
                                  strikeValid
                                    ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                                    : 'border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-900/30'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <input
                                value={getDraftInputValue(draft, 'optionExpiration')}
                                onChange={(e) => setDraftInputValue(draft.id, 'optionExpiration', e.target.value)}
                                onBlur={() => {
                                  const value = draftInputs[draft.id]?.optionExpiration ?? '';
                                  handleDraftStringChange(draft.id, 'optionExpiration', value);
                                  clearDraftInputValue(draft.id, 'optionExpiration');
                                }}
                                className={`w-28 rounded-md border px-2 py-1 text-sm ${
                                  expirationValid
                                    ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'
                                    : 'border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-900/30'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <input
                                value={getDraftInputValue(draft, 'marketValue')}
                                onChange={(e) => setDraftInputValue(draft.id, 'marketValue', e.target.value)}
                                onBlur={() => {
                                  const value = draftInputs[draft.id]?.marketValue ?? '';
                                  handleDraftChange(draft.id, 'marketValue', value);
                                  clearDraftInputValue(draft.id, 'marketValue');
                                }}
                                className="w-28 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="p-3">{renderConfidenceBadge(draft.confidence)}</td>
                            <td className="p-3">
                              <div className="flex flex-col gap-2">
                                {renderBrokerBadge(detectedBroker)}
                                <select
                                  value={detectedBroker ?? ''}
                                  onChange={(e) => {
                                    const next = e.target.value || null;
                                    if (mergeAccounts) {
                                      const groupKey = findGroupKeyForDraft(draft.id);
                                      if (!groupKey) return;
                                      applyDraftUpdate((list) =>
                                        list.map((item) =>
                                          draftGroupingKey(item) === groupKey ? { ...item, broker: next } : item
                                        )
                                      );
                                    } else {
                                      applyDraftUpdate((list) =>
                                        list.map((item) => (item.id === draft.id ? { ...item, broker: next } : item))
                                      );
                                    }
                                  }}
                                  className="w-40 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                                >
                                  <option value="">Unknown</option>
                                  {BROKERAGE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                {draft.uploadName && (
                                  <span className="text-[11px] text-gray-400">{draft.uploadName}</span>
                                )}
                              </div>
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
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {rawTexts.length > 0 && (
            <section className="mb-12">
              <h2 className="text-lg font-semibold mb-2">Raw OCR Text</h2>
              <pre className="bg-gray-900 text-gray-100 text-xs sm:text-sm rounded-lg p-4 overflow-auto max-h-60 whitespace-pre-wrap">
                {rawTexts.join('\n\n---\n\n')}
              </pre>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
