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

function hasMagnitudeSuffix(candidate?: { raw?: string | null }): boolean {
  return /[kmb]\b/i.test(candidate?.raw ?? '');
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

export function mergeDraftRows(map: Map<string, DraftRow>, incoming: DraftRow) {
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

export function parseHoldingsFromVision(result: VisionAnalysisResult): DraftRow[] {
  const byTicker = new Map<string, DraftRow>();

  parseHoldingsFromParagraphs(result).forEach((candidate) => {
    mergeDraftRows(byTicker, candidate);
  });

  parseHoldingsFromPlainText(result.text ?? '').forEach((candidate) => {
    mergeDraftRows(byTicker, candidate);
  });

  return Array.from(byTicker.values());
}

export function mergeDraftRowList(drafts: DraftRow[]): DraftRow[] {
  const byTicker = new Map<string, DraftRow>();
  drafts.forEach((draft) => mergeDraftRows(byTicker, draft));
  return Array.from(byTicker.values());
}
