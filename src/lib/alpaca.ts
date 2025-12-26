import axios from 'axios';
import type {
  AlpacaStockSnapshot,
  AlpacaOptionsSnapshotResponse,
  AlpacaOptionsSnapshot,
  AlpacaNewsResponse,
  AlpacaBarResponse,
  AlpacaBar,
} from '@/types/alpaca';
import { logAxiosError, logWarn, logDebug } from '@/lib/logger';
import { mapSnapshotsWithStrike } from '@/lib/options';
import type { OptionContract } from '@/lib/options';

const ALPACA_DATA_BASE_V1BETA1 = 'https://data.alpaca.markets/v1beta1';
const ALPACA_DATA_BASE_V2 = 'https://data.alpaca.markets/v2';
const ALPACA_TRADING_BASE =
  process.env.ALPACA_TRADING_API_URL ??
  process.env.ALPACA_API_BASE_URL ??
  'https://api.alpaca.markets';

export function getAlpacaAuth() {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY ?? process.env.ALPACA_API_SECRET_KEY;
  return { keyId, secretKey };
}

function buildAuthHeaders() {
  const { keyId, secretKey } = getAlpacaAuth();
  if (!keyId || !secretKey) {
    throw new Error('Alpaca API credentials are not configured');
  }
  return {
    'Apca-Api-Key-Id': keyId,
    'Apca-Api-Secret-Key': secretKey,
  };
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const headers = buildAuthHeaders();
    const { data } = await axios.get<T>(url, { headers, params });
    return data;
  } catch (err) {
    logAxiosError(err, 'alpaca.get');
    throw err;
  }
}

export async function getStockSnapshot(symbol: string) {
  const data = await get<AlpacaStockSnapshot>(
    `${ALPACA_DATA_BASE_V2}/stocks/${encodeURIComponent(symbol)}/snapshot`,
    { feed: 'iex' }
  );
  return data;
}

type AlpacaAsset = {
  symbol: string;
  name?: string | null;
  status?: string | null;
  tradable?: boolean | null;
  exchange?: string | null;
};

export async function listAssets(): Promise<AlpacaAsset[]> {
  return get<AlpacaAsset[]>(`${ALPACA_TRADING_BASE}/v2/assets`, {
    status: 'active',
  });
}

export async function getAsset(symbol: string): Promise<AlpacaAsset | null> {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) return null;
  return get<AlpacaAsset>(`${ALPACA_TRADING_BASE}/v2/assets/${encodeURIComponent(trimmed)}`);
}

export async function getDailyBars(symbol: string, limit = 252) {
  const bars: AlpacaBar[] = [];
  let nextPageToken: string | null | undefined;

  do {
    const params: Record<string, unknown> = {
      timeframe: '1Day',
      limit,
    };
    if (nextPageToken) params.page_token = nextPageToken;

    const data = await get<AlpacaBarResponse>(
      `${ALPACA_DATA_BASE_V2}/stocks/${encodeURIComponent(symbol)}/bars`,
      params
    );
    if (Array.isArray(data?.bars)) {
      bars.push(...data.bars);
    }
    nextPageToken = data?.next_page_token;
  } while (nextPageToken && bars.length < limit);

  return bars.slice(0, limit);
}

export async function getMinuteBars(symbol: string, timeframe: '1Min' | '5Min' | '15Min' | '30Min' | '1Hour' = '1Min', limit = 390) {
  const bars: AlpacaBar[] = [];
  let nextPageToken: string | null | undefined;

  do {
    const params: Record<string, unknown> = {
      timeframe,
      limit,
    };
    if (nextPageToken) params.page_token = nextPageToken;

    const data = await get<AlpacaBarResponse>(
      `${ALPACA_DATA_BASE_V2}/stocks/${encodeURIComponent(symbol)}/bars`,
      params
    );
    if (Array.isArray(data?.bars)) {
      bars.push(...data.bars);
    }
    nextPageToken = data?.next_page_token;
  } while (nextPageToken && bars.length < limit);

  return bars.slice(0, limit);
}

export async function getOptionsSnapshots(symbol: string): Promise<Record<string, AlpacaOptionsSnapshot> | undefined> {
  try {
    const response = await get<AlpacaOptionsSnapshotResponse>(
      `${ALPACA_DATA_BASE_V1BETA1}/options/snapshots/${encodeURIComponent(symbol)}`
    );
    const snapshots = response?.snapshots ?? undefined;
    if (!snapshots) return undefined;
    return Object.fromEntries(
      Object.entries(snapshots).map(([key, value]) => [key, normalizeOptionsSnapshot(value as Record<string, unknown>)])
    );
  } catch (err) {
    logAxiosError(err, 'alpaca.getOptionsSnapshots');
    return undefined;
  }
}

function normalizeOptionsSnapshot(raw: Record<string, unknown>): AlpacaOptionsSnapshot {
  const normalizeNumber = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };
  const greeks = typeof raw.greeks === 'object' && raw.greeks ? (raw.greeks as Record<string, unknown>) : undefined;
  return {
    symbol: typeof raw.symbol === 'string' ? raw.symbol : '',
    impliedVolatility:
      normalizeNumber(raw.impliedVolatility) ??
      normalizeNumber(raw.implied_volatility) ??
      normalizeNumber(raw.iv) ??
      normalizeNumber(greeks?.iv) ??
      normalizeNumber(greeks?.impliedVolatility) ??
      normalizeNumber(greeks?.implied_volatility),
    impliedVolatilityLow:
      normalizeNumber(raw.impliedVolatilityLow) ?? normalizeNumber(raw.iv_low) ?? normalizeNumber(raw.ivLow),
    impliedVolatilityHigh:
      normalizeNumber(raw.impliedVolatilityHigh) ?? normalizeNumber(raw.iv_high) ?? normalizeNumber(raw.ivHigh),
    impliedVolatilityPercentile:
      normalizeNumber(raw.ivPercentile) ?? normalizeNumber(raw.iv_percentile) ?? normalizeNumber(raw.iv_percentile_rank),
    impliedVolatilityRank:
      normalizeNumber(raw.ivRank) ?? normalizeNumber(raw.iv_rank) ?? normalizeNumber(raw.iv_rank_percentile),
    historicalVolatility:
      normalizeNumber(raw.historicalVolatility) ?? normalizeNumber(raw.historical_volatility),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
  };
}

export function pickOptionsSnapshot(snapshots?: Record<string, AlpacaOptionsSnapshot>): AlpacaOptionsSnapshot | undefined {
  if (!snapshots) return undefined;
  const values = Object.values(snapshots);
  if (!values.length) return undefined;
  const withIv = values.find(
    (snapshot) =>
      typeof snapshot.impliedVolatility === 'number' ||
      typeof snapshot.impliedVolatilityLow === 'number' ||
      typeof snapshot.impliedVolatilityHigh === 'number' ||
      typeof snapshot.impliedVolatilityPercentile === 'number' ||
      typeof snapshot.impliedVolatilityRank === 'number'
  );
  return withIv ?? values[0];
}

export function aggregateOptionsSnapshots(
  snapshots?: Record<string, AlpacaOptionsSnapshot>
): AlpacaOptionsSnapshot | undefined {
  if (!snapshots) return undefined;
  const values = Object.values(snapshots);
  if (!values.length) return undefined;
  const collect = (key: keyof AlpacaOptionsSnapshot) =>
    values
      .map((value) => value[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const median = (nums: number[]) => {
    if (!nums.length) return undefined;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const impliedVolatility = median(collect('impliedVolatility'));
  const impliedVolatilityLow = median(collect('impliedVolatilityLow'));
  const impliedVolatilityHigh = median(collect('impliedVolatilityHigh'));
  const impliedVolatilityPercentile = median(collect('impliedVolatilityPercentile'));
  const impliedVolatilityRank = median(collect('impliedVolatilityRank'));
  const historicalVolatility = median(collect('historicalVolatility'));
  const updatedAt =
    values
      .map((value) => value.updatedAt)
      .filter((value): value is string => typeof value === 'string')
      .sort()
      .pop() ?? undefined;

  if (
    impliedVolatility === undefined &&
    impliedVolatilityLow === undefined &&
    impliedVolatilityHigh === undefined &&
    impliedVolatilityPercentile === undefined &&
    impliedVolatilityRank === undefined &&
    historicalVolatility === undefined
  ) {
    return undefined;
  }

  return {
    symbol: '',
    impliedVolatility,
    impliedVolatilityLow,
    impliedVolatilityHigh,
    impliedVolatilityPercentile,
    impliedVolatilityRank,
    historicalVolatility,
    updatedAt,
  };
}

export async function getOptionsSnapshot(symbol: string): Promise<AlpacaOptionsSnapshot | undefined> {
  try {
    const response = await get<AlpacaOptionsSnapshotResponse>(
      `${ALPACA_DATA_BASE_V1BETA1}/options/snapshots/${encodeURIComponent(symbol)}`
    );
    const snapshots = response?.snapshots ?? {};
    const firstKey = Object.keys(snapshots)[0];
    return firstKey ? (snapshots[firstKey] as AlpacaOptionsSnapshot) : undefined;
  } catch (err) {
    logAxiosError(err, 'alpaca.getOptionsSnapshot');
    return undefined;
  }
}

export async function getNews(symbol: string, limit = 5) {
  try {
    const data = await get<AlpacaNewsResponse>(`${ALPACA_DATA_BASE_V1BETA1}/news`, {
      symbols: symbol,
      limit,
    });
    return Array.isArray(data?.news) ? data.news : [];
  } catch (err) {
    logAxiosError(err, 'alpaca.getNews');
    return [];
  }
}

export async function getOptionChain(ticker: string): Promise<OptionContract[]> {
  return getOptionChainByType(ticker, 'call');
}

export async function getOptionChainByType(ticker: string, type: 'call' | 'put'): Promise<OptionContract[]> {
  let allSnapshots: OptionContract[] = [];
  let next_page_token: string | null = null;

  do {
    const params = new URLSearchParams({ type, limit: '1000' });
    if (next_page_token) params.append('page_token', next_page_token);
    let res;
    try {
      const { keyId, secretKey } = getAlpacaAuth();
      res = await axios.get(`${ALPACA_DATA_BASE_V1BETA1}/options/snapshots/${ticker}`, {
        headers: {
          'Apca-Api-Key-Id': keyId,
          'Apca-Api-Secret-Key': secretKey,
        },
        params,
      });
    } catch (err) {
      logAxiosError(err, 'alpaca.getOptionChain');
      throw err;
    }

    const snapshots = res?.data?.snapshots as Record<string, OptionContract | Record<string, unknown>> | undefined;
    if (!snapshots || Object.keys(snapshots).length === 0) {
      logWarn('alpaca.getOptionChain: no snapshots', {
        ticker,
        hasData: !!res?.data,
        keys: res?.data ? Object.keys(res.data) : [],
      });
      throw new Error('No option snapshots returned from Alpaca for ticker');
    }

    const page = mapSnapshotsWithStrike(snapshots);
    allSnapshots = allSnapshots.concat(page);
    next_page_token = res.data.next_page_token;
  } while (next_page_token);

  logDebug('alpaca.getOptionChain: sample', allSnapshots[0]);
  return allSnapshots;
}

export async function getOptionChainByTypePage(
  ticker: string,
  type: 'call' | 'put',
  limit = 250
): Promise<OptionContract[]> {
  const params = new URLSearchParams({ type, limit: String(limit) });
  let res;
  try {
    const { keyId, secretKey } = getAlpacaAuth();
    res = await axios.get(`${ALPACA_DATA_BASE_V1BETA1}/options/snapshots/${ticker}`, {
      headers: {
        'Apca-Api-Key-Id': keyId,
        'Apca-Api-Secret-Key': secretKey,
      },
      params,
    });
  } catch (err) {
    logAxiosError(err, 'alpaca.getOptionChainPage');
    throw err;
  }

  const snapshots = res?.data?.snapshots as Record<string, OptionContract | Record<string, unknown>> | undefined;
  if (!snapshots || Object.keys(snapshots).length === 0) {
    logWarn('alpaca.getOptionChainPage: no snapshots', {
      ticker,
      hasData: !!res?.data,
      keys: res?.data ? Object.keys(res.data) : [],
    });
    return [];
  }
  return mapSnapshotsWithStrike(snapshots);
}

export async function getUnderlyingPrice(ticker: string) {
  try {
    const { keyId, secretKey } = getAlpacaAuth();
    const res = await axios.get(`${ALPACA_DATA_BASE_V2}/stocks/${ticker}/trades/latest`, {
      headers: {
        'Apca-Api-Key-Id': keyId,
        'Apca-Api-Secret-Key': secretKey,
      },
    });
    const price = res?.data?.trade?.p;
    if (typeof price !== 'number') {
      logWarn('alpaca.getUnderlyingPrice: unexpected response shape', {
        hasData: !!res?.data,
        keys: res?.data ? Object.keys(res.data) : [],
      });
      throw new Error('Missing latest trade price from Alpaca');
    }
    return price;
  } catch (err) {
    logAxiosError(err, 'alpaca.getUnderlyingPrice');
    throw err;
  }
}

export async function getLogoUrl(ticker: string) {
  const publishableToken = process.env.LOGO_DEV_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
  if (!publishableToken) {
    logWarn('alpaca.getLogoUrl: logo.dev token missing');
    return null;
  }
  const symbol = ticker.toUpperCase();
  const url = `https://img.logo.dev/ticker/${encodeURIComponent(symbol)}?token=${publishableToken}`;
  return url;
}
