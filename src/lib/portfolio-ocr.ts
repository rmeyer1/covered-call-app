import type { DraftRow, OcrNumericCandidate, OcrTokenCandidate } from '@/types';
import type { VisionAnalysisResult } from '@/lib/vision';

const headerKeywords = new Set([
  'TICKER',
  'SYMBOL',
  'NAME',
  'SHARE',
  'QTY',
  'QUANTITY',
  'PRICE',
  'COST',
  'BASIS',
  'AVG',
  'AVERAGE',
  'TRADE',
  'MARKET',
  'VALUE',
  'TOTAL',
  'CHANGE',
]);

const tickerStopwords = new Set([
  'APY',
  'YTD',
  'SHARES',
  'SHARE',
  'RETURN',
  'RETURNS',
  'BALANCE',
  'NAV',
  'ACCOUNT',
  'SUMMARY',
  'TOTAL',
  'VALUE',
  'PRICE',
  'CASH',
  'EQUITY',
  'AVAILABLE',
  'GAIN',
  'GAINS',
  'LOSS',
  'LOSSES',
  'MARGIN',
  'DAY',
  'PORTFOLIO',
  'INVEST',
  'INVESTMENT',
  'INVESTMENTS',
  'URL',
  'HTTPS',
  'HTTP',
  'WWW',
  'LOGIN',
  'SIGNIN',
  'SIGNUP',
  'DOWNLOAD',
  'UPLOAD',
  'ACCOUNT',
  'PROFILE',
  'HOMEPAGE',
  'HOME',
  'MENU',
  'SETTINGS',
  'HELP',
  'SUPPORT',
  'DOCUMENTS',
  'DOCS',
  'TERMS',
  'PRIVACY',
  'DISCLAIMER',
  'AND',
]);

const urlLikePattern = /https?:\/\/|www\.|[A-Z0-9._%+-]+\.[A-Z]{2,}/i;
const noisyRowPattern =
  /\b(YTD|APY|SHARES?|RETURN|RETURNS|GAIN|GAINS|BALANCE|SUMMARY|ACCOUNT|NET\s+WORTH|NAV|PERFORMANCE|INTEREST|DIVIDEND|STATEMENT|DOWNLOAD|UPLOAD|HOMEPAGE)\b/i;

const optionPattern =
  /(?:^|\s)(\d{1,3})?\s*([A-Z]{1,6})\s+\$?(\d+(?:\.\d+)?)\s+(Call|Put)\s+(\d{1,2}\/\d{1,2})/i;

interface OptionMatch {
  ticker: string;
  strike: number;
  right: 'call' | 'put';
  expiration: string;
  quantity?: number | null;
}

type ViewType = 'detail' | 'list' | 'unknown';

interface BoundingRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface PositionedToken extends OcrTokenCandidate {
  rect: BoundingRect;
  paragraphIndex: number;
}

interface LayoutRow {
  tokens: PositionedToken[];
  text: string;
  centerY: number;
  height: number;
  isHeader: boolean;
}

interface ColumnHints {
  ticker?: number;
  shares?: number;
  cost?: number;
  market?: number;
}

interface LayoutContext {
  columnHints: ColumnHints;
  columnCenters: number[];
  columnTolerance: number;
  denseRowBand: { minY: number; maxY: number } | null;
}

function createDraftId(): string {
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, '').trim();
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)([kmb])?/i);
  if (!match) return null;
  const [, numeric, suffixRaw] = match;
  const parsed = Number.parseFloat(numeric);
  if (!Number.isFinite(parsed)) return null;
  const suffix = suffixRaw?.toLowerCase();
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
  return parsed * multiplier;
}

function normalizeTicker(text: string): string | null {
  const upper = text.toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(upper)) return null;
  if (tickerStopwords.has(upper)) return null;
  if (urlLikePattern.test(text)) return null;
  return upper;
}

const tickerValidationCache = new Map<string, boolean>();
const pendingTickerValidations = new Map<string, Promise<boolean>>();

async function validateTickerSymbol(ticker: string): Promise<boolean> {
  const symbol = ticker.toUpperCase();
  if (tickerStopwords.has(symbol)) return false;
  const cached = tickerValidationCache.get(symbol);
  if (typeof cached === 'boolean') return cached;
  const pending = pendingTickerValidations.get(symbol);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(symbol)}`);
      if (!res.ok) {
        tickerValidationCache.set(symbol, false);
        return false;
      }
      const data = (await res.json().catch(() => null)) as { results?: Array<{ symbol?: string; tradable?: boolean }> } | null;
      const found =
        Array.isArray(data?.results) &&
        data.results.some((asset) => (asset.symbol ?? '').toUpperCase() === symbol && asset.tradable !== false);
      tickerValidationCache.set(symbol, found);
      return found;
    } catch {
      tickerValidationCache.set(symbol, false);
      return false;
    } finally {
      pendingTickerValidations.delete(symbol);
    }
  })();
  pendingTickerValidations.set(symbol, task);
  return task;
}

async function resolveTickerSymbol(
  text: string | undefined | null,
  options: { allowSingleLetter?: boolean } = {}
): Promise<string | null> {
  const normalized = normalizeTicker(text ?? '');
  if (!normalized) return null;
  if (normalized.length === 1 && !options.allowSingleLetter) {
    return (await validateTickerSymbol(normalized)) ? normalized : null;
  }
  const valid = await validateTickerSymbol(normalized);
  return valid ? normalized : null;
}

function normalizeBoundingBox(bounding?: VisionAnalysisResult['paragraphs'][number]['boundingBox']): BoundingRect | null {
  const vertices = bounding?.normalizedVertices?.length
    ? bounding.normalizedVertices
    : bounding?.vertices;
  if (!vertices?.length) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function parseOptionContract(text: string): OptionMatch | null {
  const match = text.match(optionPattern);
  if (!match) return null;
  const [, quantityRaw, tickerRaw, strikeRaw, rightRaw, expirationRaw] = match;
  const ticker = normalizeTicker(tickerRaw ?? '');
  const strike = parseNumber(strikeRaw);
  if (!ticker || strike === null) return null;
  const right = rightRaw?.toLowerCase() === 'put' ? 'put' : 'call';
  const quantity = parseNumber(quantityRaw ?? '') ?? null;
  const expiration = expirationRaw?.trim() ?? '';
  if (!expiration) return null;
  return { ticker, strike, right, expiration, quantity };
}

function tokenizeParagraph(paragraph: VisionAnalysisResult['paragraphs'][number]): OcrTokenCandidate[] {
  const tokens = paragraph.tokens ?? [];
  if (!tokens.length) return [];
  return tokens.map<OcrTokenCandidate>((token, index) => ({
    raw: token.text,
    text: token.text.replace(/^[^A-Z0-9$%.-]+|[^A-Z0-9$%.-]+$/g, '') || token.text,
    confidence: token.confidence ?? paragraph.confidence ?? 0.5,
    index,
    boundingBox: token.boundingBox,
  }));
}

function buildPositionedTokens(result: VisionAnalysisResult): PositionedToken[] {
  const positioned: PositionedToken[] = [];
  result.paragraphs?.forEach((paragraph, paragraphIndex) => {
    const fallbackRect = normalizeBoundingBox(paragraph.boundingBox);
    const tokens = tokenizeParagraph(paragraph);
    tokens.forEach((token) => {
      const rect = normalizeBoundingBox(token.boundingBox) ?? fallbackRect;
      if (!rect) return;
      positioned.push({
        ...token,
        rect,
        paragraphIndex,
      });
    });
  });
  return positioned;
}

function computeBoundsFromTokens(tokens: PositionedToken[]): BoundingRect | null {
  if (!tokens.length) return null;
  const xs = tokens.flatMap((token) => [token.rect.minX, token.rect.maxX]);
  const ys = tokens.flatMap((token) => [token.rect.minY, token.rect.maxY]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function filterTokensByEdge(tokens: PositionedToken[], bounds: BoundingRect | null): PositionedToken[] {
  if (!bounds || !tokens.length) return tokens;
  const rangeY = bounds.maxY - bounds.minY || 1;
  const relativeMargin = rangeY * 0.08;
  const absoluteMargin = rangeY > 5 ? 8 : 0;
  const margin = Math.min(rangeY * 0.25, Math.max(relativeMargin, absoluteMargin));
  const lowerBound = bounds.minY + margin;
  const upperBound = bounds.maxY - margin;

  return tokens.filter((token) => token.rect.centerY >= lowerBound && token.rect.centerY <= upperBound);
}

function groupTokensIntoRows(tokens: PositionedToken[]): LayoutRow[] {
  if (!tokens.length) return [];
  const sorted = [...tokens].sort((a, b) => a.rect.centerY - b.rect.centerY);
  const heights = sorted
    .map((token) => token.rect.height)
    .filter((height) => height > 0)
    .sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;
  const maxHeight = heights[heights.length - 1] ?? medianHeight;
  const normalizedUnits = maxHeight <= 5;
  const rowThreshold = normalizedUnits ? medianHeight * 2.2 : medianHeight * 0.9 + 4;

  const rows: LayoutRow[] = [];
  sorted.forEach((token) => {
    const current = rows[rows.length - 1];
    if (current && Math.abs(token.rect.centerY - current.centerY) <= rowThreshold) {
      current.tokens.push(token);
      return;
    }
    rows.push({
      tokens: [token],
      text: '',
      centerY: token.rect.centerY,
      height: token.rect.height,
      isHeader: false,
    });
  });

  return rows.map((row) => {
    const ordered = row.tokens.sort((a, b) => a.rect.centerX - b.rect.centerX);
    const centerY =
      ordered.reduce((sum, token) => sum + token.rect.centerY, 0) / Math.max(ordered.length, 1);
    const height = Math.max(...ordered.map((token) => token.rect.height));
    const text = ordered.map((token) => token.raw).join(' ');
    return {
      tokens: ordered,
      text,
      centerY,
      height,
      isHeader: isHeaderText(text),
    };
  });
}

function computeDenseRowBand(rows: LayoutRow[]): { minY: number; maxY: number } | null {
  const candidates = rows.filter((row) => !row.isHeader);
  if (candidates.length < 2) return null;
  const centers = candidates.map((row) => row.centerY).sort((a, b) => a - b);
  const heights = candidates
    .map((row) => row.height)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;
  const range = centers[centers.length - 1] - centers[0] || 1;
  const windowSize = Math.max(range * 0.35, medianHeight * 4, range * 0.18);

  let bestStart = centers[0];
  let bestCount = 1;
  let left = 0;

  centers.forEach((center, right) => {
    while (center - centers[left] > windowSize) {
      left += 1;
    }
    const count = right - left + 1;
    if (count > bestCount) {
      bestCount = count;
      bestStart = centers[left];
    }
  });

  return { minY: bestStart, maxY: bestStart + windowSize };
}

function isRowInBand(row: LayoutRow, band: { minY: number; maxY: number } | null): boolean {
  if (!band) return true;
  return row.centerY >= band.minY && row.centerY <= band.maxY;
}

function isHeaderParagraph(paragraph: VisionAnalysisResult['paragraphs'][number]): boolean {
  if (!paragraph?.text) return false;
  const upperTokens = paragraph.text
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((token) => token.length);
  if (!upperTokens.length) return false;
  const keywordMatches = upperTokens.filter((token) => headerKeywords.has(token));
  return keywordMatches.length >= upperTokens.length * 0.6;
}

function isHeaderText(text: string): boolean {
  const upperTokens = text
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((token) => token.length);
  if (!upperTokens.length) return false;
  const keywordMatches = upperTokens.filter((token) => headerKeywords.has(token));
  return keywordMatches.length >= upperTokens.length * 0.5;
}

function hasCurrencySymbol(raw: string): boolean {
  return /\$|USD|US\$/i.test(raw);
}

function hasPercent(raw: string): boolean {
  return /%/.test(raw);
}

function pickNumericNearHeader(
  numericCandidates: OcrNumericCandidate[],
  headerIndex: number
): OcrNumericCandidate | undefined {
  const nearby = numericCandidates
    .filter((candidate) => candidate.index > headerIndex - 1 && candidate.index <= headerIndex + 6)
    .map((candidate) => ({
      candidate,
      score:
        (hasCurrencySymbol(candidate.raw) ? 3 : 0) +
        (candidate.raw.includes('.') ? 1 : 0) +
        (candidate.index === headerIndex + 1 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.index - b.candidate.index);
  return nearby[0]?.candidate;
}

function tokenizeNumeric(tokens: OcrTokenCandidate[]): OcrNumericCandidate[] {
  return tokens
    .map<OcrNumericCandidate | null>((token) => {
      const value = parseNumber(token.raw);
      if (value === null) return null;
      return {
        text: token.text,
        value,
        raw: token.raw,
        confidence: token.confidence,
        index: token.index,
        boundingBox: token.boundingBox,
      } satisfies OcrNumericCandidate;
    })
    .filter((candidate): candidate is OcrNumericCandidate => candidate !== null);
}

function pickSharesCandidate(
  numericCandidates: OcrNumericCandidate[],
  tickerIndex: number
): OcrNumericCandidate | undefined {
  const candidates = numericCandidates
    .filter((candidate) => candidate.index > tickerIndex && !hasCurrencySymbol(candidate.raw) && !hasPercent(candidate.raw))
    .map((candidate) => ({
      candidate,
      score:
        (Number.isInteger(candidate.value) ? 2 : 0) +
        (candidate.raw.includes('.') ? 0 : 1) +
        (candidate.value >= 1 && candidate.value <= 1_000_000 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.index - b.candidate.index);

  return candidates[0]?.candidate ?? numericCandidates.find((candidate) => candidate.index > tickerIndex);
}

function pickNextNumeric(
  numericCandidates: OcrNumericCandidate[],
  afterIndex: number,
  preferCurrency = false
): OcrNumericCandidate | undefined {
  const filtered = numericCandidates.filter((candidate) => candidate.index > afterIndex);
  if (!filtered.length) return undefined;
  const scored = filtered
    .map((candidate) => ({
      candidate,
      score:
        (preferCurrency && hasCurrencySymbol(candidate.raw) ? 2 : 0) +
        (candidate.raw.includes('.') ? 1 : 0) +
        (candidate.value >= 0 ? 0.5 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.index - b.candidate.index);
  return scored[0]?.candidate ?? filtered[0];
}

function pickNumericByColumn(
  numericCandidates: OcrNumericCandidate[],
  columnX?: number,
  extraColumns: number[] = [],
  tolerance = 0.05
): OcrNumericCandidate | undefined {
  const targets = [columnX, ...extraColumns.filter((value) => value !== undefined)].filter(
    (value): value is number => typeof value === 'number'
  );
  if (!targets.length) return undefined;
  const scored = numericCandidates
    .map((candidate) => {
      const rect = normalizeBoundingBox(candidate.boundingBox);
      if (!rect) return null;
      const distance = Math.min(...targets.map((value) => Math.abs(rect.centerX - value)));
      const alignmentScore = Math.max(0, 1 - distance / Math.max(tolerance * 2, 0.01));
      const score =
        (hasCurrencySymbol(candidate.raw) ? 3 : 0) +
        (candidate.raw.includes('.') ? 1 : 0) -
        distance * 0.05 +
        alignmentScore * 1.5;
      return { candidate, score };
    })
    .filter((entry): entry is { candidate: OcrNumericCandidate; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.candidate;
}

function findValueNearLabel(
  tokens: PositionedToken[],
  numericCandidates: OcrNumericCandidate[],
  pattern: RegExp
): OcrNumericCandidate | undefined {
  const labels = tokens.filter((token) => pattern.test(token.text));
  if (!labels.length) return undefined;
  const numerics = numericCandidates
    .map((candidate) => {
      const rect = normalizeBoundingBox(candidate.boundingBox);
      return rect ? { candidate, rect } : null;
    })
    .filter((entry): entry is { candidate: OcrNumericCandidate; rect: BoundingRect } => entry !== null);

  let best: { candidate: OcrNumericCandidate; score: number } | undefined;

  labels.forEach((label) => {
    numerics.forEach(({ candidate, rect }) => {
      const dx = Math.abs(rect.centerX - label.rect.centerX);
      const dy = rect.centerY - label.rect.centerY;
      if (dy < -rect.height * 0.6) return;
      const distancePenalty = Math.hypot(dx, dy * 1.35);
      const score =
        (hasCurrencySymbol(candidate.raw) ? 2 : 0) +
        (hasPercent(candidate.raw) ? -1 : 0) +
        (dy >= 0 ? 1 : 0) +
        Math.max(0, 6 - distancePenalty);
      if (!best || score > best.score) {
        best = { candidate, score };
      }
    });
  });

  return best?.candidate;
}

function buildColumnTargets(columnHints: ColumnHints, columnCenters: number[], tolerance: number): number[] {
  const hintValues = Object.values(columnHints).filter((value): value is number => typeof value === 'number');
  return mergeCentersWithTolerance([...columnCenters], hintValues, Math.max(tolerance, 0.01));
}

function columnAlignmentScore(
  rect: BoundingRect | null,
  columnHints: ColumnHints,
  columnCenters: number[],
  tolerance: number
): number {
  if (!rect) return 0;
  const targets = buildColumnTargets(columnHints, columnCenters, tolerance);
  if (!targets.length) return 0;
  const minDistance = Math.min(...targets.map((target) => Math.abs(rect.centerX - target)));
  return Math.max(0, 1 - minDistance / Math.max(tolerance * 2, 0.01));
}

function findAnchoredNumericCandidate(
  numericCandidates: OcrNumericCandidate[],
  tickerRect: BoundingRect | null,
  columnHints: ColumnHints,
  columnCenters: number[],
  tolerance: number
): { candidate: OcrNumericCandidate; alignment: number } | null {
  if (!tickerRect) return null;
  const targets = buildColumnTargets(columnHints, columnCenters, tolerance);

  const best = numericCandidates
    .map((candidate) => {
      const rect = normalizeBoundingBox(candidate.boundingBox);
      if (!rect) return null;
      const distanceToTicker = Math.hypot(rect.centerX - tickerRect.centerX, (rect.centerY - tickerRect.centerY) * 1.1);
      const hasMonetaryHint = hasCurrencySymbol(candidate.raw) || candidate.raw.includes('.');
      if (!hasMonetaryHint) return null;
      const proximityLimit = Math.max(tickerRect.height * 3, tolerance * 3);
      if (distanceToTicker > proximityLimit) return null;
      const alignment =
        targets.length > 0
          ? Math.max(0, 1 - Math.min(...targets.map((target) => Math.abs(rect.centerX - target))) / Math.max(tolerance * 2, 0.01))
          : 0.5;
      if (targets.length > 0 && alignment < 0.2) return null;
      const score =
        (hasCurrencySymbol(candidate.raw) ? 3 : 0) +
        (candidate.raw.includes('.') ? 1.5 : 0) +
        alignment * 2 -
        distanceToTicker * 0.05;
      return { candidate, score, alignment };
    })
    .filter((entry): entry is { candidate: OcrNumericCandidate; score: number; alignment: number } => entry !== null)
    .sort((a, b) => b.score - a.score)[0];

  return best ?? null;
}

function classifyViewType(rows: LayoutRow[]): ViewType {
  if (!rows.length) return 'unknown';
  const tickerCount = rows.reduce(
    (sum, row) => sum + row.tokens.filter((token) => normalizeTicker(token.text)).length,
    0
  );
  const headerRow = rows.find((row) => row.isHeader);
  if (headerRow && tickerCount > 1) return 'list';
  const labelRows = rows.filter((row) => /shares?|qty|quantity|market value|position|cost/i.test(row.text));
  if (tickerCount > 1 && rows.length > 2) return 'list';
  if (labelRows.length) return 'detail';
  return 'unknown';
}

function buildColumnHints(headerRow?: LayoutRow): ColumnHints {
  if (!headerRow) return {};
  const hints: ColumnHints = {};
  headerRow.tokens.forEach((token) => {
    const upper = token.text.toUpperCase();
    if (/TICKER|SYMBOL|NAME/.test(upper)) hints.ticker = token.rect.centerX;
    if (/SHARE|QTY|QUANTITY/.test(upper)) hints.shares = token.rect.centerX;
    if (/COST|BASIS|AVG|AVERAGE|TRADE/.test(upper)) hints.cost = token.rect.centerX;
    if (/MARKET|VALUE|POSITION/.test(upper)) hints.market = token.rect.centerX;
  });
  return hints;
}

function mergeCentersWithTolerance(base: number[], extras: number[], tolerance: number): number[] {
  const merged = [...base];
  extras.forEach((value) => {
    if (!merged.some((center) => Math.abs(center - value) <= tolerance)) {
      merged.push(value);
    }
  });
  return merged.sort((a, b) => a - b);
}

function computeColumnCenters(rows: LayoutRow[], columnHints: ColumnHints): { centers: number[]; tolerance: number } {
  const hintValues = Object.values(columnHints).filter((value): value is number => typeof value === 'number');
  const numericXs: number[] = [];

  rows.forEach((row) => {
    if (row.isHeader) return;
    row.tokens.forEach((token) => {
      if (/\d/.test(token.raw) || hasCurrencySymbol(token.raw)) {
        numericXs.push(token.rect.centerX);
      }
    });
  });

  const referenceXs = numericXs.length ? numericXs : hintValues;
  if (!referenceXs.length) {
    return { centers: [], tolerance: 0.05 };
  }

  referenceXs.sort((a, b) => a - b);
  const minX = referenceXs[0];
  const maxX = referenceXs[referenceXs.length - 1];
  const rangeX = Math.max(maxX - minX, 1);
  const tolerance = Math.max(rangeX * 0.02, 0.02);

  if (!numericXs.length) {
    return { centers: mergeCentersWithTolerance([], hintValues, tolerance), tolerance };
  }

  const clusters: number[] = [];
  let bucket: number[] = [];

  numericXs.forEach((value, index) => {
    const previous = numericXs[index - 1];
    if (bucket.length === 0 || (previous !== undefined && Math.abs(value - previous) <= tolerance)) {
      bucket.push(value);
    } else {
      clusters.push(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);
      bucket = [value];
    }
  });

  if (bucket.length) {
    clusters.push(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);
  }

  const centers = mergeCentersWithTolerance(clusters, hintValues, tolerance);
  return { centers, tolerance };
}

function extractCompanyName(result: VisionAnalysisResult): string | null {
  const paragraphs =
    result.paragraphs?.map((paragraph) => ({
      text: paragraph.text?.trim() ?? '',
      rect: normalizeBoundingBox(paragraph.boundingBox),
      confidence: paragraph.confidence ?? 0.5,
    })) ?? [];

  const candidates = paragraphs
    .filter((entry) => entry.rect && entry.text.length > 3 && !isHeaderText(entry.text))
    .filter((entry) => !/\d{2,}/.test(entry.text));
  if (!candidates.length) return null;

  const scored = candidates
    .map((entry) => {
      const uppercasePenalty = entry.text === entry.text.toUpperCase() ? 0.2 : 0;
      const yBoost = entry.rect ? Math.max(0, 1 - Math.min(entry.rect.minY, 1)) : 0;
      const lengthBoost = Math.min(entry.text.length / 40, 1);
      const score = (entry.confidence ?? 0.5) + yBoost + lengthBoost - uppercasePenalty + (entry.rect?.height ?? 0);
      return { ...entry, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const cleaned = best?.text?.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned;
}

async function searchTickerByName(companyName: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(companyName)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ symbol?: string }> };
    const match = data?.results?.find((item) => item.symbol);
    return match?.symbol ? match.symbol.toUpperCase() : null;
  } catch {
    return null;
  }
}

function averageConfidence(values: Array<number | null | undefined>): number {
  const filtered = values.filter((value): value is number => typeof value === 'number');
  if (!filtered.length) return 0.5;
  const avg = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  return Math.max(0.2, Math.min(1, avg));
}

function hasMagnitudeSuffix(candidate?: { raw?: string | null }): boolean {
  return /[kmb]\b/i.test(candidate?.raw ?? '');
}

async function buildDraftRowFromLayoutRow(
  row: LayoutRow,
  layoutContext: LayoutContext,
  viewType: ViewType,
  companyName?: string | null
): Promise<DraftRow | null> {
  const { columnHints, columnCenters, columnTolerance, denseRowBand } = layoutContext;
  if (!row.tokens.length || !isRowInBand(row, denseRowBand)) return null;
  if (noisyRowPattern.test(row.text) || urlLikePattern.test(row.text)) return null;
  const rowText = row.text;
  const optionMatchRaw = parseOptionContract(rowText);
  let optionMatch: OptionMatch | null = null;
  if (optionMatchRaw?.ticker) {
    const validatedTicker = await resolveTickerSymbol(optionMatchRaw.ticker, { allowSingleLetter: true });
    if (validatedTicker) {
      optionMatch = { ...optionMatchRaw, ticker: validatedTicker };
    }
  }
  const tickerToken = row.tokens.find((token) => normalizeTicker(token.text));
  const tickerFromToken = tickerToken ? await resolveTickerSymbol(tickerToken.text) : null;
  let ticker = optionMatch?.ticker ?? tickerFromToken;
  if (!ticker && companyName && viewType !== 'list') {
    ticker = await resolveTickerSymbol(await searchTickerByName(companyName));
  }
  if (!ticker) return null;

  const numericCandidates = tokenizeNumeric(row.tokens);
  if (!numericCandidates.length) return null;

  const tickerRect = tickerToken?.rect ?? row.tokens[0]?.rect ?? null;
  const anchoredNumeric = findAnchoredNumericCandidate(
    numericCandidates,
    tickerRect,
    columnHints,
    columnCenters,
    columnTolerance
  );
  if (!anchoredNumeric) return null;

  const layoutBoost = viewType === 'detail' && companyName ? 0.05 : 0;
  const sharesCandidate =
    pickNumericByColumn(numericCandidates, columnHints.shares, columnCenters, columnTolerance) ??
    findValueNearLabel(row.tokens, numericCandidates, /shares?|qty|quantity/i) ??
    (tickerToken ? pickSharesCandidate(numericCandidates, tickerToken.index) : undefined);
  const sharesValue = sharesCandidate?.value ?? optionMatch?.quantity ?? null;

  const costCandidate =
    pickNumericByColumn(numericCandidates, columnHints.cost, columnCenters, columnTolerance) ??
    findValueNearLabel(row.tokens, numericCandidates, /cost|basis|avg|average|trade/i);
  const marketCandidate =
    pickNumericByColumn(numericCandidates, columnHints.market, columnCenters, columnTolerance) ??
    findValueNearLabel(row.tokens, numericCandidates, /market\s*value|position/i) ??
    pickNextNumeric(numericCandidates, costCandidate?.index ?? sharesCandidate?.index ?? tickerToken?.index ?? 0, true);

  const costAlignment = columnAlignmentScore(
    normalizeBoundingBox(costCandidate?.boundingBox),
    columnHints,
    columnCenters,
    columnTolerance
  );
  const marketAlignment = columnAlignmentScore(
    normalizeBoundingBox(marketCandidate?.boundingBox),
    columnHints,
    columnCenters,
    columnTolerance
  );
  const dominantAlignment = Math.max(anchoredNumeric?.alignment ?? 0, costAlignment, marketAlignment);

  let resolvedCostBasis = costCandidate?.value ?? null;
  let resolvedCostSource: DraftRow['costBasisSource'] = costCandidate ? 'ocr' : undefined;
  let resolvedMarketValue = marketCandidate?.value ?? costCandidate?.value ?? null;

  if (
    costCandidate &&
    sharesValue &&
    hasMagnitudeSuffix(costCandidate) &&
    (!marketCandidate || marketCandidate === costCandidate)
  ) {
    resolvedMarketValue = costCandidate.value;
    resolvedCostBasis = null;
    resolvedCostSource = undefined;
  }

  const confidence = Math.min(
    1,
    Math.max(
      0.3,
      averageConfidence([
        tickerToken?.confidence,
        sharesCandidate?.confidence,
        costCandidate?.confidence,
        marketCandidate?.confidence,
      ]) +
        (sharesValue ? 0.15 : -0.05) +
        (resolvedMarketValue ? 0.1 : 0) +
        layoutBoost +
        (dominantAlignment ? Math.min(0.12, dominantAlignment * 0.1) : -0.05)
    )
  );

  return {
    id: createDraftId(),
    ticker,
    shares: sharesValue,
    assetType: optionMatch ? 'option' : 'equity',
    optionStrike: optionMatch?.strike ?? null,
    optionExpiration: optionMatch?.expiration ?? null,
    optionRight: optionMatch?.right ?? null,
    costBasis: resolvedCostBasis,
    costBasisSource: resolvedCostSource,
    marketValue: resolvedMarketValue,
    confidence,
    source: rowText,
    selected: true,
  };
}

async function buildDraftRowFromParagraph(
  paragraph: VisionAnalysisResult['paragraphs'][number],
  denseRowBand?: { minY: number; maxY: number } | null
): Promise<DraftRow | null> {
  if (!paragraph?.text || isHeaderParagraph(paragraph)) return null;
  if (noisyRowPattern.test(paragraph.text) || urlLikePattern.test(paragraph.text)) return null;
  const tokens = tokenizeParagraph(paragraph);
  if (!tokens.length) return null;
  const paragraphRect = normalizeBoundingBox(paragraph.boundingBox);
  if (denseRowBand && paragraphRect) {
    const withinBand = paragraphRect.centerY >= denseRowBand.minY && paragraphRect.centerY <= denseRowBand.maxY;
    if (!withinBand) return null;
  }

  const optionMatchRaw = parseOptionContract(paragraph.text ?? '');
  let optionMatch: OptionMatch | null = null;
  if (optionMatchRaw?.ticker) {
    const validatedTicker = await resolveTickerSymbol(optionMatchRaw.ticker, { allowSingleLetter: true });
    if (validatedTicker) {
      optionMatch = { ...optionMatchRaw, ticker: validatedTicker };
    }
  }

  const tickerToken =
    tokens.find((token) => normalizeTicker(token.text) !== null) ??
    (optionMatch
      ? tokens.find((token) => token.text.toUpperCase() === optionMatch.ticker)
      : undefined);
  const ticker = optionMatch?.ticker ?? (tickerToken ? await resolveTickerSymbol(tickerToken.text) : null);
  if (!ticker) return null;

  const numericCandidates = tokenizeNumeric(tokens);
  if (!numericCandidates.length && !optionMatch) return null;

  const tickerRect = tickerToken?.boundingBox ? normalizeBoundingBox(tickerToken.boundingBox) : null;
  const anchoredNumeric =
    tickerToken &&
    numericCandidates.find((candidate) => {
      if (!hasCurrencySymbol(candidate.raw) && !candidate.raw.includes('.')) return false;
      const rect = normalizeBoundingBox(candidate.boundingBox);
      if (rect && tickerRect) {
        const distance = Math.hypot(rect.centerX - tickerRect.centerX, (rect.centerY - tickerRect.centerY) * 1.1);
        return distance <= Math.max(tickerRect.height * 3, 0.08);
      }
      return Math.abs(candidate.index - tickerToken.index) <= 3;
    });
  if (!anchoredNumeric && !optionMatch) return null;

  const sharesCandidate = tickerToken
    ? pickSharesCandidate(numericCandidates, tickerToken.index)
    : undefined;
  const sharesValue = sharesCandidate?.value ?? optionMatch?.quantity ?? null;

  const tickerIndex = tickerToken?.index ?? 0;
  const costHeaderIndex = tokens.findIndex((token) =>
    /COST|BASIS|AVG|TRADE/.test(token.text.toUpperCase())
  );
  const costFromHeader =
    costHeaderIndex >= 0 ? pickNumericNearHeader(numericCandidates, costHeaderIndex) : undefined;

  const costCandidate =
    costFromHeader ?? pickNextNumeric(numericCandidates, sharesCandidate?.index ?? tickerIndex, true);
  const marketCandidate = pickNextNumeric(
    numericCandidates,
    costCandidate?.index ?? sharesCandidate?.index ?? tickerIndex,
    true
  );

  // If the only/highest-confidence value has a magnitude suffix (K/M/B) and shares are known,
  // treat it as a total value and derive cost per share later instead of using it as cost-per-share.
  let resolvedCostBasis = costCandidate?.value ?? null;
  let resolvedCostSource: DraftRow['costBasisSource'] = costCandidate ? 'ocr' : undefined;
  let resolvedMarketValue = marketCandidate?.value ?? costCandidate?.value ?? null;

  if (
    costCandidate &&
    sharesValue &&
    hasMagnitudeSuffix(costCandidate) &&
    (!marketCandidate || marketCandidate === costCandidate)
  ) {
    resolvedMarketValue = costCandidate.value;
    resolvedCostBasis = null;
    resolvedCostSource = undefined;
  }

  const usedConfidences = [
    tickerToken?.confidence,
    sharesCandidate?.confidence,
    costCandidate?.confidence,
    marketCandidate?.confidence,
    paragraph.confidence,
  ].filter((value): value is number => typeof value === 'number');

  const avgConfidence =
    usedConfidences.length > 0
      ? usedConfidences.reduce((sum, value) => sum + value, 0) / usedConfidences.length
      : 0.5;
  const completenessBoost =
    (sharesValue && sharesValue > 0 ? 0.15 : 0) +
    (costCandidate || marketCandidate ? 0.1 : 0) +
    (optionMatch ? 0.05 : 0);
  const confidence = Math.min(
    1,
    Math.max(0.35, avgConfidence + completenessBoost + (anchoredNumeric ? 0.05 : -0.05))
  );

  return {
    id: createDraftId(),
    ticker,
    shares: sharesValue,
    assetType: optionMatch ? 'option' : 'equity',
    optionStrike: optionMatch?.strike ?? null,
    optionExpiration: optionMatch?.expiration ?? null,
    optionRight: optionMatch?.right ?? null,
    costBasis: resolvedCostBasis,
    costBasisSource: resolvedCostSource,
    marketValue: resolvedMarketValue,
    confidence,
    source: paragraph.text,
    selected: true,
  } satisfies DraftRow;
}

async function parseHoldingsFromParagraphs(
  result: VisionAnalysisResult,
  denseRowBand?: { minY: number; maxY: number } | null
): Promise<DraftRow[]> {
  const candidates = await Promise.all(
    result.paragraphs?.map((paragraph) => buildDraftRowFromParagraph(paragraph, denseRowBand)) ?? []
  );
  return candidates.filter((candidate): candidate is DraftRow => candidate !== null);
}

function collectContextLines(lines: string[], startIndex: number): { source: string; sliceEnd: number } {
  const context: string[] = [];
  let pointer = startIndex;
  while (pointer < lines.length) {
    const line = lines[pointer];
    if (!line) {
      pointer += 1;
      break;
    }
    if (pointer !== startIndex && normalizeTicker(line)) {
      break;
    }
    context.push(line);
    pointer += 1;
  }
  return { source: context.join(' '), sliceEnd: pointer };
}

function extractSharesFromLines(lines: string[]): number | null {
  for (const line of lines) {
    if (/share/i.test(line)) {
      const match = line.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/);
      const parsed = parseNumber(match?.[0] ?? null);
      if (parsed !== null && parsed > 0) {
        return parsed;
      }
    }
  }

  for (const line of lines) {
    if (hasCurrencySymbol(line) || hasPercent(line)) continue;
    const match = line.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/);
    const parsed = parseNumber(match?.[0] ?? null);
    if (parsed !== null && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function extractCurrencyValue(lines: string[]): number | null {
  for (const line of lines) {
    if (!hasCurrencySymbol(line)) continue;
    const match = line.match(/(?:\$)\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*[kmb]?/i);
    const parsed = parseNumber(match?.[0] ?? null);
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractSecondaryValue(lines: string[], sharesValue: number | null): number | null {
  const candidates: number[] = [];
  lines.forEach((line) => {
    if (hasPercent(line)) return;
    const matches = line.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*[kmb]?/gi) || [];
    matches.forEach((value) => {
      const parsed = parseNumber(value);
      if (parsed !== null) candidates.push(parsed);
    });
  });
  const unique = candidates.filter((value) => value !== sharesValue);
  return unique[0] ?? null;
}

async function parseHoldingsFromPlainText(text: string): Promise<DraftRow[]> {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length)
    .filter((line) => !noisyRowPattern.test(line) && !urlLikePattern.test(line));

  const results: DraftRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const optionRaw = parseOptionContract(line);
    let option: OptionMatch | null = null;
    if (optionRaw?.ticker) {
      const validatedTicker = await resolveTickerSymbol(optionRaw.ticker, { allowSingleLetter: true });
      if (validatedTicker) {
        option = { ...optionRaw, ticker: validatedTicker };
      }
    }
    if (option) {
      const { source, sliceEnd } = collectContextLines(lines, index);
      const contextLines = lines.slice(index, sliceEnd);
      const shares = option.quantity ?? extractSharesFromLines(contextLines);
      const currencyValue = extractCurrencyValue(contextLines);
      const confidenceBase = 0.5 + (currencyValue ? 0.15 : 0);

      results.push({
        id: createDraftId(),
        ticker: option.ticker,
        shares,
        assetType: 'option',
        optionStrike: option.strike,
        optionExpiration: option.expiration,
        optionRight: option.right,
        costBasis: currencyValue ?? null,
        costBasisSource: currencyValue ? 'ocr' : undefined,
        marketValue: currencyValue ?? null,
        confidence: Math.min(1, confidenceBase),
        source,
        selected: true,
      });

      index = sliceEnd;
      continue;
    }

    const ticker = await resolveTickerSymbol(line);
    if (!ticker) {
      index += 1;
      continue;
    }

    const { source, sliceEnd } = collectContextLines(lines, index);
    const contextLines = lines.slice(index, sliceEnd);
    const shares = extractSharesFromLines(contextLines);
    if (shares === null || shares <= 0) {
      index = sliceEnd;
      continue;
    }

    const currencyValue = extractCurrencyValue(contextLines);
    const secondaryValue = extractSecondaryValue(contextLines, shares);
    const confidenceBase = 0.55 + (currencyValue ? 0.15 : 0) + (secondaryValue ? 0.1 : 0);

    results.push({
      id: createDraftId(),
      ticker,
      shares,
      costBasis: secondaryValue ?? null,
      marketValue: currencyValue ?? secondaryValue ?? null,
      confidence: Math.min(1, confidenceBase),
      source,
      selected: true,
    });

    index = sliceEnd;
  }

  return results;
}

function mergeDraftRows(map: Map<string, DraftRow>, incoming: DraftRow) {
  const existing = map.get(incoming.ticker);
  if (!existing) {
    map.set(incoming.ticker, incoming);
    return;
  }

  const existingConfidence = existing.confidence ?? 0;
  const incomingConfidence = incoming.confidence ?? 0;
  const chooseValue = <T extends number | null | undefined>(current: T, next: T): T => {
    if (next === null || next === undefined) return current;
    if (current === null || current === undefined) return next;
    if (incomingConfidence > existingConfidence + 0.05) return next;
    return current;
  };

  map.set(incoming.ticker, {
    ...existing,
    shares: chooseValue(existing.shares, incoming.shares),
    assetType: incoming.assetType ?? existing.assetType,
    optionStrike: chooseValue(existing.optionStrike, incoming.optionStrike),
    optionExpiration: incoming.optionExpiration ?? existing.optionExpiration ?? null,
    optionRight: incoming.optionRight ?? existing.optionRight ?? null,
    costBasis: chooseValue(existing.costBasis, incoming.costBasis),
    costBasisSource: incoming.costBasisSource ?? existing.costBasisSource,
    marketValue: chooseValue(existing.marketValue, incoming.marketValue),
    confidence: Math.max(existingConfidence, incomingConfidence),
    source: incomingConfidence > existingConfidence && incoming.source ? incoming.source : existing.source,
  });
}

export async function parseHoldingsFromVision(result: VisionAnalysisResult): Promise<DraftRow[]> {
  const positionedTokens = buildPositionedTokens(result);
  const bounds = computeBoundsFromTokens(positionedTokens);
  const filteredTokens = filterTokensByEdge(positionedTokens, bounds);
  const rows = groupTokensIntoRows(filteredTokens);
  const denseRowBand = computeDenseRowBand(rows);
  const rowsInBand = rows.filter((row) => isRowInBand(row, denseRowBand));

  const headerRow = rowsInBand.find((row) => row.isHeader) ?? rows.find((row) => row.isHeader);
  const columnHints = buildColumnHints(headerRow);
  const columnInfo = computeColumnCenters(rowsInBand.length ? rowsInBand : rows, columnHints);
  const companyName = extractCompanyName(result);
  const viewType = classifyViewType(rowsInBand.length ? rowsInBand : rows);

  const layoutContext: LayoutContext = {
    columnHints,
    columnCenters: columnInfo.centers,
    columnTolerance: columnInfo.tolerance,
    denseRowBand,
  };

  const layoutDrafts: DraftRow[] = [];
  for (const row of rows) {
    if (row.isHeader) continue;
    const candidate = await buildDraftRowFromLayoutRow(row, layoutContext, viewType, companyName);
    if (candidate) layoutDrafts.push(candidate);
  }

  const paragraphDrafts = await parseHoldingsFromParagraphs(result, denseRowBand);
  const averageLayoutConfidence =
    layoutDrafts.length > 0
      ? layoutDrafts.reduce((sum, draft) => sum + (draft.confidence ?? 0.5), 0) / layoutDrafts.length
      : 0;
  const usePlainTextFallback = layoutDrafts.length < 2 || averageLayoutConfidence < 0.5;

  const byTicker = new Map<string, DraftRow>();

  if (usePlainTextFallback) {
    const fallbackDrafts = await parseHoldingsFromPlainText(result.text ?? '');
    fallbackDrafts.forEach((candidate) => mergeDraftRows(byTicker, candidate));
    paragraphDrafts
      .filter((candidate) => (candidate.confidence ?? 0.5) > 0.55)
      .forEach((candidate) => mergeDraftRows(byTicker, candidate));
  } else {
    layoutDrafts.forEach((candidate) => mergeDraftRows(byTicker, candidate));
    paragraphDrafts.forEach((candidate) => mergeDraftRows(byTicker, candidate));
  }

  return Array.from(byTicker.values());
}
