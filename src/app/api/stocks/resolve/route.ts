import { NextRequest, NextResponse } from 'next/server';
import { resolveTickerFromName } from '@/lib/stock-lookup';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name') ?? '';
  if (!name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  try {
    const symbol = await resolveTickerFromName(name);
    return NextResponse.json({ symbol });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'resolve failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
