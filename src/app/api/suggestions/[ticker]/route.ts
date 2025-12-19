import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAlpacaAuth, getOptionChain, getUnderlyingPrice, getLogoUrl } from '@/lib/alpaca';
import { buildSuggestions, callsAtExpiration } from '@/lib/options';
import { DEFAULT_DAYS_AHEAD, parseSelectionFromParams, pickExpirationDate } from '@/lib/expirations';
import { logAxiosError } from '@/lib/logger';

export async function GET(req: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const params = await context.params;
  const ticker = params.ticker.toUpperCase();
  const sp = req.nextUrl.searchParams;
  const requestedDaysAhead = Number(sp.get('daysAhead') ?? DEFAULT_DAYS_AHEAD);
  const fallbackDaysAhead = Number.isFinite(requestedDaysAhead) && requestedDaysAhead > 0
    ? requestedDaysAhead
    : DEFAULT_DAYS_AHEAD;
  const otmFactors = sp.get('otmFactors')?.split(',').map((n) => Number(n)).filter((n) => !Number.isNaN(n)) ?? undefined;
  const expirySelection = parseSelectionFromParams(sp, { mode: 'custom', daysAhead: fallbackDaysAhead });

  const { keyId, secretKey } = getAlpacaAuth();
  if (!keyId || !secretKey) {
    return NextResponse.json({ error: 'Alpaca API keys are not configured. Please set ALPACA_API_KEY_ID and ALPACA_SECRET_KEY.' }, { status: 500 });
  }

  try {
    const [currentPrice, optionChain, logoUrl] = await Promise.all([
      getUnderlyingPrice(ticker),
      getOptionChain(ticker),
      getLogoUrl(ticker),
    ]);

    const nextExp = pickExpirationDate(optionChain, ticker, expirySelection, fallbackDaysAhead);
    if (!nextExp) return NextResponse.json({ error: 'No suitable expiration date found.' }, { status: 404 });

    const callsAtExp = callsAtExpiration(optionChain, ticker, nextExp);
    if (!callsAtExp?.length) return NextResponse.json({ error: 'No calls found for expiration.' }, { status: 404 });

    const suggestions = buildSuggestions(currentPrice, callsAtExp, nextExp, otmFactors);
    return NextResponse.json({ currentPrice, selectedExpiration: nextExp.toISOString().split('T')[0], suggestions, logoUrl: logoUrl ?? undefined });
  } catch (error: unknown) {
    logAxiosError(error, 'GET /api/suggestions/[ticker]');
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json({ error: 'Upstream Alpaca error', status: error.response.status }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
