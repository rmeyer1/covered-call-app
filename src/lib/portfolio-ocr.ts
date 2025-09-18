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
  'MARKET',
  'VALUE',
  'TOTAL',
  'CHANGE',
]);

function createDraftId(): string {
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const sanitized = value.replace(/[^0-9.\-]/g, '');
  if (!sanitized) return null;
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTicker(text: string): string | null {
  const upper = text.toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(upper)) return null;
  const blacklist = new Set(['TOTAL', 'VALUE', 'PRICE', 'CASH', 'EQUITY']);
  if (blacklist.has(upper)) return null;
  return upper;
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

function buildDraftRowFromParagraph(
  paragraph: VisionAnalysisResult['paragraphs'][number]
): DraftRow | null {
  if (!paragraph?.text || isHeaderParagraph(paragraph)) return null;
  const tokens = tokenizeParagraph(paragraph);
  if (!tokens.length) return null;

  const tickerToken = tokens.find((token) => normalizeTicker(token.text) !== null);
  if (!tickerToken) return null;
  const ticker = normalizeTicker(tickerToken.text);
  if (!ticker) return null;

  const numericCandidates = tokenizeNumeric(tokens);
  if (!numericCandidates.length) return null;

  const sharesCandidate = pickSharesCandidate(numericCandidates, tickerToken.index);
  if (!sharesCandidate || sharesCandidate.value <= 0) return null;

  const costCandidate = pickNextNumeric(numericCandidates, sharesCandidate.index, true);
  const marketCandidate = pickNextNumeric(
    numericCandidates,
    costCandidate?.index ?? sharesCandidate.index,
    true
  );

  const usedConfidences = [
    tickerToken.confidence,
    sharesCandidate.confidence,
    costCandidate?.confidence,
    marketCandidate?.confidence,
    paragraph.confidence,
  ].filter((value): value is number => typeof value === 'number');

  const avgConfidence =
    usedConfidences.length > 0
      ? usedConfidences.reduce((sum, value) => sum + value, 0) / usedConfidences.length
      : 0.5;
  const completenessBoost =
    (sharesCandidate ? 0.15 : 0) + (costCandidate || marketCandidate ? 0.1 : 0);
  const confidence = Math.min(1, Math.max(0.35, avgConfidence + completenessBoost));

  return {
    id: createDraftId(),
    ticker,
    shares: sharesCandidate.value,
    costBasis: costCandidate?.value ?? null,
    marketValue: marketCandidate?.value ?? costCandidate?.value ?? null,
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
    const match = line.match(/(?:\$)\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?/);
    const parsed = parseNumber(match?.[0] ?? null);
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractSecondaryValue(lines: string[], sharesValue: number | null): number | null {
  const candidates: number[] = [];
  lines.forEach((line) => {
    if (hasPercent(line)) return;
    const matches = line.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) || [];
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
    costBasis: chooseValue(existing.costBasis, incoming.costBasis),
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
