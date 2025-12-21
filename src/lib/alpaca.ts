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
  const data = await get<{ snapshot: AlpacaStockSnapshot }>(
    `${ALPACA_DATA_BASE_V2}/stocks/${encodeURIComponent(symbol)}/snapshot`
  );
  return data?.snapshot;
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
