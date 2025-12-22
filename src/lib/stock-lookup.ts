import { getStockSnapshot, listAssets } from '@/lib/alpaca';
import { logWarn } from '@/lib/logger';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedAt = 0;
let cachedAssets: Array<{ symbol: string; name: string }> = [];

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .replace(/\b(incorporated|inc|corp|corporation|co|company|ltd|plc|class)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  if (candidate.includes(query)) return 0.9;
  const queryTokens = new Set(query.split(' ').filter(Boolean));
  const candTokens = new Set(candidate.split(' ').filter(Boolean));
  if (!queryTokens.size || !candTokens.size) return 0;
  let overlap = 0;
  queryTokens.forEach((token) => {
    if (candTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(queryTokens.size, candTokens.size);
}

async function loadAssets(): Promise<Array<{ symbol: string; name: string }>> {
  const now = Date.now();
  if (cachedAssets.length && now - cachedAt < CACHE_TTL_MS) {
    return cachedAssets;
  }
  const assets = await listAssets();
  cachedAssets = (assets ?? [])
    .filter((asset) => asset?.symbol && asset?.name)
    .map((asset) => ({ symbol: asset.symbol.toUpperCase(), name: String(asset.name) }));
  cachedAt = now;
  return cachedAssets;
}

export async function resolveTickerFromName(name: string): Promise<string | null> {
  const normalizedQuery = normalizeName(name);
  if (!normalizedQuery) return null;
  const assets = await loadAssets();
  const scored = assets
    .map((asset) => ({
      symbol: asset.symbol,
      score: scoreMatch(normalizedQuery, normalizeName(asset.name)),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.85) return null;

  try {
    await getStockSnapshot(best.symbol);
    return best.symbol;
  } catch (err) {
    logWarn('stockLookup.resolveTickerFromName: verification failed', {
      name,
      symbol: best.symbol,
    });
    return null;
  }
}

