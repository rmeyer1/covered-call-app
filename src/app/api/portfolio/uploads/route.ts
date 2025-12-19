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

function resolveUserId(req: NextRequest, bodyUserId?: unknown): string | null {
  const headerUserId = req.headers.get(USER_ID_HEADER);
  if (typeof bodyUserId === 'string' && bodyUserId.trim()) return bodyUserId.trim();
  if (headerUserId && headerUserId.trim()) return headerUserId.trim();
  const fallback = process.env.PORTFOLIO_DEFAULT_USER_ID;
  return fallback && fallback.trim() ? fallback.trim() : null;
}

async function storeUpload(
  input: { imageBase64: string; filename?: string; checksum?: string | null; size?: number },
  userId: string
): Promise<UploadRecord> {
  const { imageBase64, filename, checksum, size } = input;
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

  const persisted = await supabaseRestFetch<UploadRecord[] | UploadRecord>('/rest/v1/portfolio_uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(record),
  }).catch((err) => {
    console.error('Failed to persist upload metadata', err);
    return null;
  });

  if (Array.isArray(persisted) && persisted[0]) return persisted[0];
  if (persisted && !Array.isArray(persisted)) return persisted as UploadRecord;
  return record;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = resolveUserId(req, body?.userId);
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const uploadsPayload = Array.isArray(body?.uploads) ? body.uploads : null;
    if (uploadsPayload && uploadsPayload.length) {
      const uploads = await Promise.all(
        uploadsPayload.map(async (item) => {
          if (!item?.imageBase64 || typeof item.imageBase64 !== 'string') {
            throw new Error('imageBase64 is required for each upload');
          }
          return storeUpload(
            {
              imageBase64: item.imageBase64,
              filename: item.filename,
              checksum: item.checksum,
              size: item.size,
            },
            userId
          );
        })
      );
      return NextResponse.json({ uploads });
    }

    const { imageBase64, filename, checksum, size } = body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

    const upload = await storeUpload({ imageBase64, filename, checksum, size }, userId);
    return NextResponse.json({ uploads: [upload], path: upload.path });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
