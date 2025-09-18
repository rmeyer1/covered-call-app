import { logError } from '@/lib/logger';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are not configured');
  }
}

export async function supabaseRestFetch<T = unknown>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<T> {
  assertConfig();
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY as string,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...init.headers,
  } as Record<string, string>;
  const res = await fetch(url, { ...init, headers });
  const rawBody = await res.text();
  if (!res.ok) {
    logError('supabaseRestFetch error', { path, status: res.status, body: rawBody });
    throw new Error(`Supabase request failed: ${res.status}`);
  }
  if (!rawBody || res.status === 204) {
    return undefined as T;
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody) as T;
    } catch (err) {
      logError('supabaseRestFetch parse error', { path, body: rawBody, err });
      throw err;
    }
  }
  return rawBody as unknown as T;
}

function sanitizeStorageSegment(segment: string): string {
  return segment
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.\-_]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase();
}

function buildStoragePath(objectPath: string | undefined, userId: string | undefined): string {
  const fallbackName = `screenshot-${Date.now().toString(36)}.png`;
  const fallback = `uploads/${fallbackName}`;
  const rawSegments = (objectPath && objectPath.trim() ? objectPath : fallback).split('/');
  const sanitizedSegments = rawSegments
    .map((segment) => sanitizeStorageSegment(segment))
    .filter((segment) => Boolean(segment));

  const prefixSegments = userId ? [sanitizeStorageSegment(userId)] : [];
  const allSegments = [...prefixSegments, ...sanitizedSegments];

  if (!allSegments.length) {
    const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    allSegments.push('uploads', `${unique}.png`);
  } else if (allSegments.length === 1) {
    allSegments.unshift('uploads');
  }

  return allSegments.join('/');
}

export async function uploadToSupabaseStorage(
  bucket: string,
  objectPath: string,
  content: Buffer,
  contentType: string,
  userId?: string
): Promise<string> {
  assertConfig();
  const path = buildStoragePath(objectPath, userId);
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY as string,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: Uint8Array.from(content),
  });
  if (!res.ok) {
    const text = await res.text();
    logError('uploadToSupabaseStorage error', { bucket, objectPath: path, status: res.status, body: text });
    throw new Error(`Supabase storage upload failed: ${res.status}`);
  }
  return path;
}
