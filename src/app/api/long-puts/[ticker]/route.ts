import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAlpacaAuth, getOptionChainByType, getUnderlyingPrice, getLogoUrl } from '@/lib/alpaca';
import {
  callsAtExpiration,
  selectPutsByMoneyness,
  buildLongPutSuggestions,
  Moneyness,
} from '@/lib/options';
import { logAxiosError } from '@/lib/logger';
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

  try {
    const [currentPrice, chain, logoUrl] = await Promise.all([
      getUnderlyingPrice(ticker),
      getOptionChainByType(ticker, 'put'),
      getLogoUrl(ticker),
    ]);

    const nextExp = pickExpirationDate(chain, ticker, expirySelection, fallbackDaysAhead);
    if (!nextExp) return NextResponse.json({ error: 'No suitable expiration date found.' }, { status: 404 });

    const putsAtExp = callsAtExpiration(chain, ticker, nextExp);
    if (!putsAtExp?.length) return NextResponse.json({ error: 'No puts found for the selected expiration date.' }, { status: 404 });

    const selected = selectPutsByMoneyness(putsAtExp, currentPrice, moneyness, Math.max(1, Math.min(count, 5)));
    const suggestions = buildLongPutSuggestions(currentPrice, selected, nextExp);

    return NextResponse.json({ currentPrice, selectedExpiration: nextExp.toISOString().split('T')[0], suggestions, logoUrl: logoUrl ?? undefined });
  } catch (error: any) {
    logAxiosError(error, 'GET /api/long-puts/[ticker]');
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json({ error: 'Upstream Alpaca error', status: error.response.status }, { status: 502 });
    }
    return NextResponse.json({ error: error?.message || 'Unknown server error' }, { status: 500 });
  }
}
