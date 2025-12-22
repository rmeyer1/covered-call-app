import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHoldingsFromVision } from '../../src/lib/portfolio-ocr';
import type { VisionAnalysisResult } from '../../src/lib/vision';

test('parses single-stock detail view without over-parsing', async () => {
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

  const result = await parseHoldingsFromVision(vision);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.ticker, 'S');
  assert.equal(result[0]?.shares, 1000);
  assert.equal(result[0]?.costBasis, 1.11);
  assert.equal(result[0]?.marketValue, 870);
});

test('parses shares when value is on the next line', async () => {
  const vision: VisionAnalysisResult = {
    text: [
      'Alphabet Class A',
      '$308.79',
      'Shares',
      '15',
      'Your market value',
      '$4,713.64',
      'Your average cost',
      '$171.17',
    ].join('\n'),
    paragraphs: [],
    raw: {},
  };

  const result = await parseHoldingsFromVision(vision);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.shares, 15);
  assert.equal(result[0]?.marketValue, 4713.64);
  assert.equal(result[0]?.costBasis, 171.17);
});

test('chooses share candidate closest to derived value', async () => {
  const vision: VisionAnalysisResult = {
    text: [
      'Invesco Exchange-Traded Fund',
      'Trust II Invesco NASDAQ 100 ETF',
      '$252.94',
      'Your market value',
      '$7,929.71',
      'Your average cost',
      '$208.36',
      'Shares',
      '+$1,382.09 (+21.11%)',
      '31.424835',
      '21.70%',
    ].join('\n'),
    paragraphs: [],
    raw: {},
  };

  const result = await parseHoldingsFromVision(vision);
  assert.equal(result.length, 1);
  assert.ok(Math.abs((result[0]?.shares ?? 0) - 31.424835) < 0.01);
});
