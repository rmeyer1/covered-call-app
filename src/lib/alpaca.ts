import axios from 'axios';
import { logAxiosError, logWarn, logDebug } from '@/lib/logger';
import { mapSnapshotsWithStrike } from '@/lib/options';

const ALPACA_DATA_BASE = 'https://data.alpaca.markets/v1beta1';

export function getAlpacaAuth() {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY ?? process.env.ALPACA_API_SECRET_KEY;
  return { keyId, secretKey };
}

export async function getOptionChain(ticker: string) {
  return getOptionChainByType(ticker, 'call');
}

export async function getOptionChainByType(ticker: string, type: 'call' | 'put') {
  let allSnapshots: any[] = [];
  let next_page_token: string | null = null;

  do {
    const params = new URLSearchParams({ type, limit: '1000' });
    if (next_page_token) params.append('page_token', next_page_token);
    let res;
    try {
      const { keyId, secretKey } = getAlpacaAuth();
      res = await axios.get(`${ALPACA_DATA_BASE}/options/snapshots/${ticker}`, {
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

    const snapshots = res?.data?.snapshots as Record<string, any> | undefined;
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
    const res = await axios.get(`https://data.alpaca.markets/v2/stocks/${ticker}/trades/latest`, {
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
