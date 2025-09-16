import { NextRequest, NextResponse } from 'next/server';
import { analyzeImageWithVision } from '@/lib/vision';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const base64: string | undefined = body?.imageBase64 ?? body?.base64;
    const imageUri: string | undefined = body?.imageUrl ?? body?.imageUri;

    if (!base64 && !imageUri) {
      return NextResponse.json({ error: 'imageBase64 or imageUrl is required' }, { status: 400 });
    }

    const result = await analyzeImageWithVision({ base64, imageUri });
    return NextResponse.json({
      text: result.text,
      paragraphs: result.paragraphs,
      raw: result.raw,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Vision processing failed';
    const status = message.includes('not set') ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
