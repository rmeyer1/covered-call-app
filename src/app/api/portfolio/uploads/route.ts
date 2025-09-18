import { NextRequest, NextResponse } from 'next/server';
import { uploadToSupabaseStorage, supabaseRestFetch } from '@/lib/supabase';

const USER_ID_HEADER = 'x-portfolio-user-id';

interface UploadRecord {
  id?: string;
  user_id?: string | null;
  path: string;
  filename: string;
  status: string;
  size: number;
  checksum?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, filename, checksum, size, userId: bodyUserId } = body ?? {};
    const headerUserId = req.headers.get(USER_ID_HEADER);
    const userId = typeof bodyUserId === 'string' && bodyUserId.trim().length
      ? bodyUserId.trim()
      : headerUserId?.trim() ?? process.env.PORTFOLIO_DEFAULT_USER_ID ?? null;
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }
    const contentTypeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const contentType = contentTypeMatch?.[1] ?? 'image/png';
    const detectedExtension = contentType.split('/').pop() ?? 'png';
    const normalizedFilename = (() => {
      if (!filename || !filename.trim()) {
        return `screenshot.${detectedExtension}`;
      }
      if (filename.includes('.')) return filename;
      return `${filename}.${detectedExtension}`;
    })();
    const uploadsPath = `${Date.now()}-${Math.random().toString(36).slice(2)}-${normalizedFilename}`;
    const base64Data = imageBase64.replace(/^data:.+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const storedPath = await uploadToSupabaseStorage(
      'portfolio-uploads',
      uploadsPath,
      buffer,
      contentType,
      userId
    );

    const record: UploadRecord = {
      path: storedPath,
      filename: normalizedFilename,
      status: 'stored',
      size: size ?? buffer.length,
      checksum: checksum ?? null,
      user_id: userId,
    };
    try {
      await supabaseRestFetch('/rest/v1/portfolio_uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(record),
      });
    } catch (err) {
      // If table insert fails, still return success for upload to unblock flow.
      console.error('Failed to persist upload metadata', err);
    }

    return NextResponse.json({ path: storedPath });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
