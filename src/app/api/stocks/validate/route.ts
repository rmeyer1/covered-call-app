import { NextRequest, NextResponse } from 'next/server';
import { getAsset } from '@/lib/alpaca';

function parseSymbols(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const symbols = parseSymbols(req.nextUrl.searchParams.get('symbols'));
  if (!symbols.length) {
    return NextResponse.json({ error: 'symbols is required' }, { status: 400 });
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const asset = await getAsset(symbol);
        if (!asset) return { symbol, valid: false };
        if (asset.status && asset.status.toLowerCase() !== 'active') {
          return { symbol, valid: false };
        }
        if (asset.tradable === false) return { symbol, valid: false };
        return { symbol, valid: true };
      } catch {
        return { symbol, valid: false };
      }
    })
  );

  const valid = results.filter((row) => row.valid).map((row) => row.symbol);
  const invalid = results.filter((row) => !row.valid).map((row) => row.symbol);
  return NextResponse.json({ valid, invalid });
}
