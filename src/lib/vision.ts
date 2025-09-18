import axios from 'axios';
import { logAxiosError, logError } from '@/lib/logger';

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

interface Vertex {
  x?: number;
  y?: number;
}

interface BoundingPoly {
  vertices?: Vertex[];
  normalizedVertices?: Vertex[];
}

interface VisionSymbol {
  text?: string;
  property?: { detectedBreak?: { type?: string } };
  confidence?: number;
}

interface VisionWord {
  symbols?: VisionSymbol[];
  boundingBox?: BoundingPoly;
  confidence?: number;
}

interface VisionParagraph {
  words?: VisionWord[];
  boundingBox?: BoundingPoly;
  confidence?: number;
}

interface VisionBlock {
  paragraphs?: VisionParagraph[];
  boundingBox?: BoundingPoly;
  blockType?: string;
  confidence?: number;
}

interface VisionPage {
  width?: number;
  height?: number;
  blocks?: VisionBlock[];
  confidence?: number;
}

interface FullTextAnnotation {
  text?: string;
  pages?: VisionPage[];
}

interface AnnotateImageResponse {
  fullTextAnnotation?: FullTextAnnotation;
  error?: { message?: string };
}

interface AnnotateResponse {
  responses?: AnnotateImageResponse[];
}

export interface ParagraphInfo {
  text: string;
  boundingBox?: BoundingPoly;
  confidence?: number;
  words: Array<{
    text: string;
    boundingBox?: BoundingPoly;
    confidence?: number;
  }>;
  tokens: Array<{
    text: string;
    boundingBox?: BoundingPoly;
    confidence?: number;
  }>;
}

export interface VisionAnalysisResult {
  text: string;
  paragraphs: ParagraphInfo[];
  raw: AnnotateImageResponse;
}

function getApiKey() {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    logError('vision.getApiKey missing GOOGLE_VISION_API_KEY');
  }
  return key;
}

function normalizeBase64(input: string): string {
  if (!input) return input;
  const match = input.match(/base64,(.*)$/);
  return match ? match[1] : input;
}

function buildWordText(word: VisionWord): string {
  if (!word.symbols || !word.symbols.length) return '';
  let result = '';
  word.symbols.forEach((symbol) => {
    if (!symbol.text) return;
    result += symbol.text;
    const breakType = symbol.property?.detectedBreak?.type;
    if (breakType === 'SPACE' || breakType === 'SURE_SPACE') {
      result += ' ';
    }
    if (breakType === 'EOL_SURE_SPACE' || breakType === 'LINE_BREAK') {
      result += '\n';
    }
  });
  return result.trim();
}

function buildParagraphInfo(paragraph: VisionParagraph): ParagraphInfo {
  const words = (paragraph.words || []).map((word) => ({
    text: buildWordText(word),
    boundingBox: word.boundingBox,
    confidence: word.confidence,
  })).filter((word) => word.text.length);
  const text = words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  const tokens = words
    .flatMap((word) =>
      word.text
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => ({
          text: token,
          boundingBox: word.boundingBox,
          confidence: word.confidence ?? paragraph.confidence,
        }))
    )
    .filter((token) => token.text.length);
  return {
    text,
    boundingBox: paragraph.boundingBox,
    confidence: paragraph.confidence,
    words,
    tokens,
  };
}

function extractParagraphs(annotation?: FullTextAnnotation): ParagraphInfo[] {
  if (!annotation?.pages?.length) return [];
  const collected: ParagraphInfo[] = [];
  annotation.pages.forEach((page) => {
    page.blocks?.forEach((block) => {
      block.paragraphs?.forEach((paragraph) => {
        const info = buildParagraphInfo(paragraph);
        if (info.text) collected.push(info);
      });
    });
  });
  return collected;
}

export async function analyzeImageWithVision({
  base64,
  imageUri,
}: {
  base64?: string;
  imageUri?: string;
}): Promise<VisionAnalysisResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Google Vision API key is not set');
  }

  const request = {
    requests: [
      {
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', model: 'builtin/latest' as const }],
        image: base64 ? { content: normalizeBase64(base64) } : { source: { imageUri } },
        imageContext: {
          languageHints: ['en'],
        },
      },
    ],
  };

  try {
    const { data } = await axios.post<AnnotateResponse>(`${VISION_ENDPOINT}?key=${apiKey}`, request);
    const response = data.responses?.[0];
    if (!response) {
      throw new Error('Vision API returned no responses');
    }
    if (response.error?.message) {
      throw new Error(response.error.message);
    }
    const annotation = response.fullTextAnnotation;
    const paragraphs = extractParagraphs(annotation);
    return {
      text: annotation?.text ?? '',
      paragraphs,
      raw: response,
    };
  } catch (err) {
    logAxiosError(err, 'vision.analyzeImageWithVision');
    throw err;
  }
}
