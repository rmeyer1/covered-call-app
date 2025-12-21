import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHoldingsFromVision } from '../../src/lib/portfolio-ocr';
import type { VisionAnalysisResult } from '../../src/lib/vision';
import type { GeminiHoldingsResult } from '../../src/lib/gemini';

test('parseHoldingsFromVision uses Gemini holdings when present', () => {
  const gemini: GeminiHoldingsResult = {
    model: 'gemini-1.5-flash',
    holdings: [
      {
        ticker: 'AAPL',
        shares: 12,
        marketValue: 2345.67,
        costBasis: 2100.0,
        confidence: 0.93,
        sourceText: 'AAPL 12 2345.67',
      },
    ],
  };
  const vision: VisionAnalysisResult = {
    text: '',
    paragraphs: [],
    raw: {},
    gemini,
  };

  const result = parseHoldingsFromVision(vision);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.ticker, 'AAPL');
  assert.equal(result[0]?.shares, 12);
  assert.equal(result[0]?.marketValue, 2345.67);
  assert.equal(result[0]?.costBasis, 2100.0);
  assert.equal(result[0]?.costBasisSource, 'ocr');
  assert.ok((result[0]?.confidence ?? 0) >= 0.9);
});

test('parseHoldingsFromVision maps Gemini option fields', () => {
  const gemini: GeminiHoldingsResult = {
    model: 'gemini-1.5-flash',
    holdings: [
      {
        ticker: 'TSLA',
        shares: 1,
        assetType: 'option',
        optionRight: 'call',
        optionStrike: 250,
        optionExpiration: '2025-03-21',
        marketValue: 425.0,
        confidence: 0.8,
      },
    ],
  };
  const vision: VisionAnalysisResult = {
    text: '',
    paragraphs: [],
    raw: {},
    gemini,
  };

  const result = parseHoldingsFromVision(vision);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.assetType, 'option');
  assert.equal(result[0]?.optionRight, 'call');
  assert.equal(result[0]?.optionStrike, 250);
  assert.equal(result[0]?.optionExpiration, '2025-03-21');
});
