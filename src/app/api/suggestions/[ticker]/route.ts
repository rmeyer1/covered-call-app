import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { addDays, differenceInDays, parseISO, closestTo } from 'date-fns';

const ALPACA_DATA_BASE = 'https://data.alpaca.markets/v1beta1';

async function getOptionChain(ticker: string) {
  let allSnapshots: any[] = [];
  let next_page_token: string | null = null;

  do {
    const params = new URLSearchParams({
      type: 'call',
      limit: '1000',
    });
    if (next_page_token) {
      params.append('page_token', next_page_token);
    }
    const res = await axios.get(`${ALPACA_DATA_BASE}/options/snapshots/${ticker}`, {
      headers: {
        'Apca-Api-Key-Id': process.env.NEXT_PUBLIC_ALPACA_API_KEY_ID,
        'Apca-Api-Secret-Key': process.env.NEXT_PUBLIC_ALPACA_SECRET_KEY,
      },
      params,
    });
    const snapshotsWithSymbolAndStrike = Object.entries(res.data.snapshots).map(([symbol, snapshot]) => {
        const strikePart = symbol.slice(-8);
        const strike_price = parseInt(strikePart, 10) / 1000;
        return {
            ...snapshot,
            symbol,
            strike_price,
        };
    });
    allSnapshots = allSnapshots.concat(snapshotsWithSymbolAndStrike);
    next_page_token = res.data.next_page_token;
  } while (next_page_token);

  console.log(allSnapshots[0]);
  return allSnapshots;
}

async function getUnderlyingPrice(ticker: string) {
  const res = await axios.get(`https://data.alpaca.markets/v2/stocks/${ticker}/trades/latest`, {
    headers: {
      'Apca-Api-Key-Id': process.env.NEXT_PUBLIC_ALPACA_API_KEY_ID,
      'Apca-Api-Secret-Key': process.env.NEXT_PUBLIC_ALPACA_SECRET_KEY
    },
  });
  return res.data.trade.p;
}

export async function GET(req: NextRequest, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();

  if (!process.env.NEXT_PUBLIC_ALPACA_API_KEY_ID || !process.env.NEXT_PUBLIC_ALPACA_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Alpaca API keys are not configured. Please set the ALPACA_API_KEY_ID and ALPACA_SECRET_KEY environment variables.' },
      { status: 500 }
    );
  }

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    const currentPrice = await getUnderlyingPrice(ticker);
    const optionChain = await getOptionChain(ticker);

    if (!optionChain || optionChain.length === 0) {
      return NextResponse.json({ error: 'Could not retrieve options chain. The ticker may be invalid or have no options.' }, { status: 404 });
    }

    const getExpirationFromSymbol = (symbol: string) => {
        const datePart = symbol.substring(ticker.length, ticker.length + 6);
        const year = `20${datePart.substring(0, 2)}`;
        const month = datePart.substring(2, 4);
        const day = datePart.substring(4, 6);
        return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const targetDate = addDays(today, 35);
    const expDates = [...new Set(optionChain.map((option: any) => parseISO(getExpirationFromSymbol(option.symbol))))];
    const nextExp = closestTo(targetDate, expDates.filter((d: Date) => d > today));

    if (!nextExp) {
      return NextResponse.json({ error: 'No suitable expiration date found.' }, { status: 404 });
    }

    const daysToExp = differenceInDays(nextExp, today);
    const calls = optionChain.filter((option: any) => getExpirationFromSymbol(option.symbol) === nextExp.toISOString().split('T')[0]);

    if (!calls || calls.length === 0) {
      return NextResponse.json({ error: 'No calls found for the selected expiration date.' }, { status: 404 });
    }

    const suggestions = [1.1, 1.15, 1.2].map((otmFactor) => {
      const targetStrike = Math.round(currentPrice * otmFactor / 5) * 5;
      const closestCall = calls.reduce((prev: any, curr: any) =>
        Math.abs(curr.strike_price - targetStrike) < Math.abs(prev.strike_price - targetStrike) ? curr : prev
      );
      const premium = (closestCall.latestQuote.bp + closestCall.latestQuote.ap) / 2;
      const yieldMonthly = (premium / currentPrice) * 100;
      const yieldAnnualized = yieldMonthly * (365 / daysToExp);

      return {
        otmPercent: Math.round((otmFactor - 1) * 100),
        strike: closestCall.strike_price,
        premium,
        delta: closestCall.greeks.delta,
        yieldMonthly: yieldMonthly.toFixed(2),
        yieldAnnualized: yieldAnnualized.toFixed(2),
        expiration: nextExp.toISOString().split('T')[0],
      };
    });

    return NextResponse.json({ currentPrice, suggestions });
  } catch (error: any) {
    console.error(error);
    if (error.response) {
      if (error.response.status === 403) {
        return NextResponse.json({ error: 'Forbidden. Please check your Alpaca API keys.' }, { status: 403 });
      }
      if (error.response.status === 422) {
        return NextResponse.json({ error: 'Invalid ticker provided.' }, { status: 422 });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}