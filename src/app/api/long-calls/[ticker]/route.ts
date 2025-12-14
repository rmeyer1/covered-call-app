import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { logAxiosError } from '@/lib/logger';
import { getAlpacaAuth, getOptionChain, getUnderlyingPrice, getLogoUrl } from '@/lib/alpaca';
import {
  callsAtExpiration,
  selectCallsByMoneyness,
  buildLongCallSuggestions,
  Moneyness,
} from '@/lib/options';
import { parseSelectionFromParams, pickExpirationDate } from '@/lib/expirations';

export async function GET(req: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const params = await context.params;
  const ticker = params.ticker.toUpperCase();
  const sp = req.nextUrl.searchParams;
  const defaultDaysAhead = 45;
  const requestedDaysAhead = Number(sp.get('daysAhead') ?? defaultDaysAhead);
  const fallbackDaysAhead = Number.isFinite(requestedDaysAhead) && requestedDaysAhead > 0
    ? requestedDaysAhead
    : defaultDaysAhead;
  const expirySelection = parseSelectionFromParams(sp, { mode: 'custom', daysAhead: fallbackDaysAhead });
  const moneyness = (sp.get('moneyness')?.toUpperCase() as Moneyness) || 'ATM';
  const count = Number(sp.get('count') ?? '3');

  const { keyId, secretKey } = getAlpacaAuth();
  if (!keyId || !secretKey) {
    return NextResponse.json(
      { error: 'Alpaca API keys are not configured. Please set the ALPACA_API_KEY_ID and ALPACA_SECRET_KEY environment variables.' },
      { status: 500 }
    );
  }

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    const [currentPrice, optionChain, logoUrl] = await Promise.all([
      getUnderlyingPrice(ticker),
      getOptionChain(ticker),
      getLogoUrl(ticker),
    ]);

    if (!optionChain || optionChain.length === 0) {
      return NextResponse.json({ error: 'Could not retrieve options chain. The ticker may be invalid or have no options.' }, { status: 404 });
    }

    const nextExp = pickExpirationDate(optionChain, ticker, expirySelection, fallbackDaysAhead);
    if (!nextExp) {
      return NextResponse.json({ error: 'No suitable expiration date found.' }, { status: 404 });
    }

    const calls = callsAtExpiration(optionChain, ticker, nextExp);
    if (!calls || calls.length === 0) {
      return NextResponse.json({ error: 'No calls found for the selected expiration date.' }, { status: 404 });
    }

    const selected = selectCallsByMoneyness(calls, currentPrice, moneyness, Math.max(1, Math.min(count, 5)));
    const suggestions = buildLongCallSuggestions(currentPrice, selected, nextExp);

    const selectedExpiration = nextExp.toISOString().split('T')[0];
    return NextResponse.json({ currentPrice, selectedExpiration, suggestions, logoUrl: logoUrl ?? undefined });
  } catch (error: unknown) {
    logAxiosError(error, 'GET /api/long-calls/[ticker]');
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      return NextResponse.json({ error: 'Upstream Alpaca error', status }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
