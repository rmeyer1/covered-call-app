import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAlpacaAuth, getOptionChainByType, getUnderlyingPrice, getLogoUrl } from '@/lib/alpaca';
import { callsAtExpiration, selectPutsByMoneyness, buildSuggestions } from '@/lib/options';
import type { OptionContract } from '@/lib/options';
import { logAxiosError } from '@/lib/logger';
import { DEFAULT_DAYS_AHEAD, parseSelectionFromParams, pickExpirationDate } from '@/lib/expirations';

type Moneyness = 'OTM' | 'ITM';

export async function GET(req: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await context.params;
  const T = ticker.toUpperCase();
  const sp = req.nextUrl.searchParams;
  const requestedDaysAhead = Number(sp.get('daysAhead') ?? DEFAULT_DAYS_AHEAD);
  const fallbackDaysAhead = Number.isFinite(requestedDaysAhead) && requestedDaysAhead > 0
    ? requestedDaysAhead
    : DEFAULT_DAYS_AHEAD;
  const expirySelection = parseSelectionFromParams(sp, { mode: 'custom', daysAhead: fallbackDaysAhead });
  const moneyness = (sp.get('moneyness')?.toUpperCase() as Moneyness) || 'OTM';
  const count = Number(sp.get('count') ?? '3');

  const { keyId, secretKey } = getAlpacaAuth();
  if (!keyId || !secretKey) {
    return NextResponse.json({ error: 'Alpaca API keys are not configured. Please set ALPACA_API_KEY_ID and ALPACA_SECRET_KEY.' }, { status: 500 });
  }

  try {
    const [currentPrice, chainRaw, logoUrl] = await Promise.all([
      getUnderlyingPrice(T),
      getOptionChainByType(T, 'put'),
      getLogoUrl(T),
    ]);
    const chain = chainRaw as OptionContract[];

    const nextExp = pickExpirationDate(chain, T, expirySelection, fallbackDaysAhead);
    if (!nextExp) return NextResponse.json({ error: 'No suitable expiration date found.' }, { status: 404 });

    const putsAtExp = callsAtExpiration(chain, T, nextExp); // works for both calls and puts
    if (!putsAtExp?.length) return NextResponse.json({ error: 'No puts found for expiration.' }, { status: 404 });

    const selected = selectPutsByMoneyness(putsAtExp, currentPrice, moneyness, Math.max(1, Math.min(count, 5)));
    const suggestions = buildSuggestions(currentPrice, selected, nextExp);

    return NextResponse.json({ currentPrice, selectedExpiration: nextExp.toISOString().split('T')[0], suggestions, logoUrl: logoUrl ?? undefined });
  } catch (error: unknown) {
    logAxiosError(error, 'GET /api/cash-secured-puts/[ticker]');
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json({ error: 'Upstream Alpaca error', status: error.response.status }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
