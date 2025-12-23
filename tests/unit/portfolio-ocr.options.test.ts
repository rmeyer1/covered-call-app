import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHoldingsFromVision } from '../../src/lib/portfolio-ocr';
import type { VisionAnalysisResult } from '../../src/lib/vision';

test('parses option contracts from list text', async () => {
  const vision: VisionAnalysisResult = {
    text: [
      '2 CIFR $14 Put 1/19',
      'ASST $0.5 Call 02/16/2026 3',
    ].join('\n'),
    paragraphs: [],
    raw: {},
  };

  const result = await parseHoldingsFromVision(vision);
  const c = result.find((row) => row.ticker === 'CIFR');
  const a = result.find((row) => row.ticker === 'ASST');
  assert.ok(c);
  assert.equal(c?.assetType, 'option');
  assert.equal(c?.optionRight, 'put');
  assert.equal(c?.optionStrike, 14);
  assert.equal(c?.optionExpiration, '1/19');
  assert.equal(c?.contracts, 2);

  assert.ok(a);
  assert.equal(a?.assetType, 'option');
  assert.equal(a?.optionRight, 'call');
  assert.equal(a?.optionStrike, 0.5);
  assert.equal(a?.optionExpiration, '02/16/2026');
  assert.equal(a?.contracts, 3);
});

test('parses short option quantities as negative', async () => {
  const vision: VisionAnalysisResult = {
    text: ['Sell 1 AAPL $200 Call 2025-01-17'].join('\n'),
    paragraphs: [],
    raw: {},
  };

  const result = await parseHoldingsFromVision(vision);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.assetType, 'option');
  assert.equal(result[0]?.contracts, 1);
  assert.equal(result[0]?.buySell, 'sell');
  assert.equal(result[0]?.optionRight, 'call');
  assert.equal(result[0]?.optionStrike, 200);
  assert.equal(result[0]?.optionExpiration, '2025-01-17');
});
