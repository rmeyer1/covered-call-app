import axios from 'axios';
import { logAxiosError, logError } from '@/lib/logger';

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface GeminiHolding {
  ticker?: string | null;
  shares?: number | string | null;
  marketValue?: number | string | null;
  costBasis?: number | string | null;
  gainPercent?: number | string | null;
  price?: number | string | null;
  assetType?: 'equity' | 'option' | string | null;
  optionRight?: 'call' | 'put' | string | null;
  optionStrike?: number | string | null;
  optionExpiration?: string | null;
  confidence?: number | string | null;
  sourceText?: string | null;
}

export interface GeminiHoldingsResult {
  holdings: GeminiHolding[];
  model: string;
  rawText?: string;
  raw?: unknown;
  confidence?: number | null;
}

function getGeminiApiKey() {
  const key = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) {
    logError('gemini.getGeminiApiKey missing GOOGLE_API_KEY');
  }
  return key;
}

function normalizeBase64(input: string): { data: string; mimeType: string } {
  const match = input.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: 'image/png', data: input };
}

function extractJsonBlock(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1).trim();
  return null;
}

function safeJsonParse(text: string): unknown | null {
  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) return null;
  try {
    return JSON.parse(jsonBlock);
  } catch {
    return null;
  }
}

function buildHoldingsPrompt(ocrText?: string) {
  // Prompt tuned to return stable JSON and avoid layout hallucinations.
  const base = [
    'You are extracting stock holdings from a brokerage portfolio screenshot.',
    'Return ONLY valid JSON with this shape:',
    '{"holdings":[{"ticker":"AAPL","shares":10,"marketValue":1234.56,"costBasis":1200.0,"gainPercent":2.5,"price":123.45,"assetType":"equity","optionRight":null,"optionStrike":null,"optionExpiration":null,"confidence":0.82,"sourceText":""}]}',
    'Rules:',
    '- Use uppercase tickers, omit cash/sweeps.',
    '- Numbers should be plain (no commas, no currency symbols). Use null when missing.',
    '- marketValue is total position value, costBasis is total cost basis if available.',
    '- If the holding is an option, set assetType="option" and include optionRight/optionStrike/optionExpiration (YYYY-MM-DD if shown).',
    '- confidence should be 0-1 per holding based on OCR clarity.',
    '- Do not include extra keys or commentary.',
  ];
  if (ocrText && ocrText.trim()) {
    base.push('OCR text (may be noisy):');
    base.push(ocrText.trim());
  }
  return base.join('\n');
}

export async function analyzeHoldingsWithGemini({
  base64,
  ocrText,
}: {
  base64?: string;
  ocrText?: string;
}): Promise<GeminiHoldingsResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not set');
  }

  const parts: Array<Record<string, unknown>> = [{ text: buildHoldingsPrompt(ocrText) }];
  if (base64) {
    const inline = normalizeBase64(base64);
    parts.push({ inline_data: { mime_type: inline.mimeType, data: inline.data } });
  }

  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  };

  try {
    const { data } = await axios.post(`${GEMINI_ENDPOINT}?key=${apiKey}`, payload);
    const rawText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';
    const parsed = safeJsonParse(rawText) as { holdings?: GeminiHolding[]; confidence?: number } | null;
    const holdings = Array.isArray(parsed?.holdings) ? parsed?.holdings ?? [] : [];
    return {
      holdings,
      model: GEMINI_MODEL,
      rawText,
      raw: data,
      confidence: typeof parsed?.confidence === 'number' ? parsed?.confidence : null,
    };
  } catch (err) {
    logAxiosError(err, 'gemini.analyzeHoldingsWithGemini');
    throw err;
  }
}
