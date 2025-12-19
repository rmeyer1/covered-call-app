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
  const blacklist = new Set(['TOTAL', 'VALUE', 'PRICE', 'CASH', 'EQUITY']);
  if (blacklist.has(upper)) return null;
  return upper;
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
  columnX?: number
): OcrNumericCandidate | undefined {
  if (columnX === undefined) return undefined;
  const scored = numericCandidates
    .map((candidate) => {
      const rect = normalizeBoundingBox(candidate.boundingBox);
      if (!rect) return null;
      const distance = Math.abs(rect.centerX - columnX);
      const score =
        (hasCurrencySymbol(candidate.raw) ? 3 : 0) +
        (candidate.raw.includes('.') ? 1 : 0) -
        distance * 0.1;
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

  let best: { candidate: OcrNumericCandidate; score: number } | null = null;

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
  columnHints: ColumnHints,
  viewType: ViewType,
  companyName?: string | null
): Promise<DraftRow | null> {
  if (!row.tokens.length) return null;
  const rowText = row.text;
  const optionMatch = parseOptionContract(rowText);
  const tickerToken = row.tokens.find((token) => normalizeTicker(token.text));
  let ticker = optionMatch?.ticker ?? normalizeTicker(tickerToken?.text ?? '');
  if (!ticker && companyName && viewType !== 'list') {
    ticker = await searchTickerByName(companyName);
  }
  if (!ticker) return null;

  const numericCandidates = tokenizeNumeric(row.tokens);
  if (!numericCandidates.length && !optionMatch) return null;

  const layoutBoost = viewType === 'detail' && companyName ? 0.05 : 0;
  const sharesCandidate =
    pickNumericByColumn(numericCandidates, columnHints.shares) ??
    findValueNearLabel(row.tokens, numericCandidates, /shares?|qty|quantity/i) ??
    (tickerToken ? pickSharesCandidate(numericCandidates, tickerToken.index) : undefined);
  const sharesValue = sharesCandidate?.value ?? optionMatch?.quantity ?? null;

  const costCandidate =
    pickNumericByColumn(numericCandidates, columnHints.cost) ??
    findValueNearLabel(row.tokens, numericCandidates, /cost|basis|avg|average|trade/i);
  const marketCandidate =
    pickNumericByColumn(numericCandidates, columnHints.market) ??
    findValueNearLabel(row.tokens, numericCandidates, /market\s*value|position/i) ??
    pickNextNumeric(numericCandidates, costCandidate?.index ?? sharesCandidate?.index ?? tickerToken?.index ?? 0, true);

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
        layoutBoost
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

function buildDraftRowFromParagraph(
  paragraph: VisionAnalysisResult['paragraphs'][number]
): DraftRow | null {
  if (!paragraph?.text || isHeaderParagraph(paragraph)) return null;
  const tokens = tokenizeParagraph(paragraph);
  if (!tokens.length) return null;

  const optionMatch = parseOptionContract(paragraph.text ?? '');
  const tickerToken =
    tokens.find((token) => normalizeTicker(token.text) !== null) ??
    (optionMatch
      ? tokens.find((token) => token.text.toUpperCase() === optionMatch.ticker)
      : undefined);
  const ticker = optionMatch?.ticker ?? normalizeTicker(tickerToken?.text ?? '');
  if (!ticker) return null;

  const numericCandidates = tokenizeNumeric(tokens);
  if (!numericCandidates.length && !optionMatch) return null;

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
  const confidence = Math.min(1, Math.max(0.35, avgConfidence + completenessBoost));

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

function parseHoldingsFromParagraphs(result: VisionAnalysisResult): DraftRow[] {
  const candidates = result.paragraphs?.map((paragraph) => buildDraftRowFromParagraph(paragraph)) ?? [];
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

function parseHoldingsFromPlainText(text: string): DraftRow[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length);

  const results: DraftRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const option = parseOptionContract(line);
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

    const ticker = normalizeTicker(line);
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
  const byTicker = new Map<string, DraftRow>();

  const positionedTokens = buildPositionedTokens(result);
  const rows = groupTokensIntoRows(positionedTokens);
  const headerRow = rows.find((row) => row.isHeader);
  const columnHints = buildColumnHints(headerRow);
  const companyName = extractCompanyName(result);
  const viewType = classifyViewType(rows);

  for (const row of rows) {
    if (row.isHeader) continue;
    const candidate = await buildDraftRowFromLayoutRow(row, columnHints, viewType, companyName);
    if (candidate) mergeDraftRows(byTicker, candidate);
  }

  parseHoldingsFromParagraphs(result).forEach((candidate) => {
    mergeDraftRows(byTicker, candidate);
  });

  parseHoldingsFromPlainText(result.text ?? '').forEach((candidate) => {
    mergeDraftRows(byTicker, candidate);
  });

  return Array.from(byTicker.values());
}
