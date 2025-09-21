import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { logAxiosError } from '@/lib/logger';
import { callsAtExpiration, buildSuggestions } from '@/lib/options';
import { DEFAULT_DAYS_AHEAD, parseSelectionFromParams, pickExpirationDate } from '@/lib/expirations';
import { getAlpacaAuth, getOptionChain, getUnderlyingPrice, getLogoUrl } from '@/lib/alpaca';


export async function GET(req: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const params = await context.params; // Await params as per previous fix
  const ticker = params.ticker.toUpperCase();

  // Parse query params for what-if controls
  const sp = req.nextUrl.searchParams;
  const requestedDaysAhead = Number(sp.get('daysAhead') ?? DEFAULT_DAYS_AHEAD);
  const fallbackDaysAhead = Number.isFinite(requestedDaysAhead) && requestedDaysAhead > 0
    ? requestedDaysAhead
    : DEFAULT_DAYS_AHEAD;
  const expirySelection = parseSelectionFromParams(sp, { mode: 'custom', daysAhead: fallbackDaysAhead });
  const otmFactorsParam = sp.get('otmFactors') ?? '1.1,1.15,1.2';
  const otmFactors = otmFactorsParam
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);

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

    const suggestions = buildSuggestions(currentPrice, calls, nextExp, otmFactors.length ? otmFactors : [1.1, 1.15, 1.2]);

    return NextResponse.json({
      currentPrice,
      selectedExpiration: nextExp.toISOString().split('T')[0],
      suggestions,
      logoUrl: logoUrl ?? undefined,
    });
  } catch (error: any) {
    logAxiosError(error, 'GET /api/suggestions/[ticker]');
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      if (status === 403) {
        return NextResponse.json({ error: 'Forbidden. Please check your Alpaca API keys.' }, { status });
      }
      if (status === 422) {
        return NextResponse.json({ error: 'Invalid ticker provided.' }, { status });
      }
      return NextResponse.json(
        {
          error: 'Upstream Alpaca error',
          status,
          details: typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data),
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: error?.message || 'Unknown server error' }, { status: 500 });
  }
}
