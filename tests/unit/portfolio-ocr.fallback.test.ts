import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHoldingsFromVision } from '../../src/lib/portfolio-ocr';
import type { VisionAnalysisResult } from '../../src/lib/vision';
import type { GeminiHoldingsResult } from '../../src/lib/gemini';

function makeVision(text: string, gemini?: GeminiHoldingsResult, geminiError?: string): VisionAnalysisResult {
  return {
    text,
    paragraphs: [],
    raw: {},
    gemini,
    geminiError,
  };
}

test('falls back to heuristic when Gemini confidence is low', async () => {
  const gemini: GeminiHoldingsResult = {
    model: 'gemini-2.5-flash',
    holdings: [
      { ticker: 'AAPL', shares: 10, confidence: 0.5 },
      { ticker: 'MSFT', shares: 5, confidence: 0.5 },
    ],
  };
  const vision = makeVision('AAPL\n10\n$150\nMSFT\n5\n$200', gemini);
  const result = await parseHoldingsFromVision(vision);

  assert.ok(result.length >= 2);
  result.forEach((draft) => {
    assert.equal(draft.parseMode, 'heuristic');
  });
});

test('uses hybrid mode to fill gaps when Gemini is strong', async () => {
  const gemini: GeminiHoldingsResult = {
    model: 'gemini-2.5-flash',
    holdings: [
      { ticker: 'AAPL', shares: 10, confidence: 0.9 },
      { ticker: 'MSFT', shares: 5, confidence: 0.8 },
    ],
  };
  const vision = makeVision('AAPL\n10\n$150\nMSFT\n5\n$200\nGOOG\n3\n$300', gemini);
  const result = await parseHoldingsFromVision(vision);
  const byTicker = new Map(result.map((draft) => [draft.ticker, draft]));

  assert.equal(byTicker.get('AAPL')?.parseMode, 'gemini');
  assert.equal(byTicker.get('MSFT')?.parseMode, 'gemini');
  assert.equal(byTicker.get('GOOG')?.parseMode, 'hybrid');
});

test('honors OCR_USE_GEMINI_ONLY flag', async () => {
  const previous = process.env.OCR_USE_GEMINI_ONLY;
  process.env.OCR_USE_GEMINI_ONLY = 'true';
  const gemini: GeminiHoldingsResult = {
    model: 'gemini-2.5-flash',
    holdings: [],
  };
  const vision = makeVision('AAPL\n10\n$150', gemini);
  const result = await parseHoldingsFromVision(vision);
  assert.equal(result.length, 0);
  if (previous === undefined) {
    delete process.env.OCR_USE_GEMINI_ONLY;
  } else {
    process.env.OCR_USE_GEMINI_ONLY = previous;
  }
});
