import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHoldingsFromVision } from '../../src/lib/portfolio-ocr';
import type { VisionAnalysisResult } from '../../src/lib/vision';

test('parses single-stock detail view without over-parsing', () => {
  const vision: VisionAnalysisResult = {
    text: [
      'S',
      '$0.87',
      'Your market value',
      '$870.00',
      'Your average cost',
      '$1.11',
      'Shares',
      '1,000',
    ].join('\n'),
    paragraphs: [],
    raw: {},
  };

  const result = parseHoldingsFromVision(vision);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.ticker, 'S');
  assert.equal(result[0]?.shares, 1000);
  assert.equal(result[0]?.costBasis, 1.11);
  assert.equal(result[0]?.marketValue, 870);
});
