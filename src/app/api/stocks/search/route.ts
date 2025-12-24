import { NextRequest, NextResponse } from 'next/server';
import { getLogoUrl, getStockSnapshot, listAssets } from '@/lib/alpaca';

type AlpacaAsset = Awaited<ReturnType<typeof listAssets>>[number];

const CACHE_TTL_MS = 60 * 60 * 1000;
let cachedAssets: AlpacaAsset[] | null = null;
let cachedAt = 0;

async function getAssets(): Promise<AlpacaAsset[]> {
  const now = Date.now();
  if (cachedAssets && now - cachedAt < CACHE_TTL_MS) return cachedAssets;
  const assets = await listAssets();
  cachedAssets = assets;
  cachedAt = now;
  return assets;
}

function normalizeQuery(raw: string | null): string {
  return (raw ?? '').trim().toUpperCase();
}

function matchAssets(assets: AlpacaAsset[], query: string): AlpacaAsset[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const scored = assets
    .filter((asset) => asset.symbol)
    .map((asset) => {
      const symbol = asset.symbol.toUpperCase();
      const name = (asset.name ?? '').toLowerCase();
      const symbolStarts = symbol.startsWith(query);
      const nameIncludes = name.includes(lower);
      if (!symbolStarts && !nameIncludes) return null;
      const score = (symbolStarts ? 2 : 0) + (nameIncludes ? 1 : 0);
      return { asset, score };
    })
    .filter((row): row is { asset: AlpacaAsset; score: number } => row !== null)
    .sort((a, b) => b.score - a.score || a.asset.symbol.localeCompare(b.asset.symbol));
  return scored.map((row) => row.asset).slice(0, 8);
}

export async function GET(req: NextRequest) {
  const query = normalizeQuery(req.nextUrl.searchParams.get('query'));
  if (!query) {
    return NextResponse.json({ results: [] });
  }
  try {
    const assets = await getAssets();
    const matches = matchAssets(assets, query);
    const results = await Promise.all(
      matches.map(async (asset) => {
        const symbol = asset.symbol.toUpperCase();
        let lastPrice: number | null = null;
        let changePercent: number | null = null;
        try {
          const snapshot = await getStockSnapshot(symbol);
          lastPrice = snapshot?.latestTrade?.p ?? snapshot?.dailyBar?.c ?? null;
          const prevClose = snapshot?.prevDailyBar?.c ?? snapshot?.dailyBar?.o ?? null;
          if (lastPrice !== null && prevClose !== null && prevClose !== 0) {
            changePercent = (lastPrice - prevClose) / prevClose;
          }
        } catch {
          // ignore snapshot failures
        }
        const logoUrl = await getLogoUrl(symbol);
        return {
          ticker: symbol,
          name: asset.name ?? null,
          logoUrl,
          lastPrice,
          changePercent,
        };
      })
    );
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
