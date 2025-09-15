import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAlpacaAuth, getOptionChainByType, getUnderlyingPrice } from '@/lib/alpaca';
import { nextExpirationDateForChain, callsAtExpiration, selectPutsByMoneyness, buildCspSuggestions } from '@/lib/options';
import { logAxiosError } from '@/lib/logger';

type Moneyness = 'OTM' | 'ITM';


export async function GET(req: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await context.params;
  const T = ticker.toUpperCase();
  const sp = req.nextUrl.searchParams;
  const daysAhead = Number(sp.get('daysAhead') ?? '35');
  const moneyness = (sp.get('moneyness')?.toUpperCase() as Moneyness) || 'OTM';
  const count = Number(sp.get('count') ?? '3');

  const { keyId, secretKey } = getAlpacaAuth();
  if (!keyId || !secretKey) {
    return NextResponse.json({ error: 'Alpaca API keys are not configured. Please set ALPACA_API_KEY_ID and ALPACA_SECRET_KEY.' }, { status: 500 });
  }

  try {
    const currentPrice = await getUnderlyingPrice(T);
    const chain = await getOptionChainByType(T, 'put');

    const nextExp = nextExpirationDateForChain(chain, T, Number.isFinite(daysAhead) ? daysAhead : 35);
    if (!nextExp) return NextResponse.json({ error: 'No suitable expiration date found.' }, { status: 404 });

    const putsAtExp = callsAtExpiration(chain, T, nextExp); // works for both calls and puts
    if (!putsAtExp?.length) return NextResponse.json({ error: 'No puts found for expiration.' }, { status: 404 });

    const selected = selectPutsByMoneyness(putsAtExp, currentPrice, moneyness, Math.max(1, Math.min(count, 5)));
    const suggestions = buildCspSuggestions(selected, nextExp);

    return NextResponse.json({ currentPrice, selectedExpiration: nextExp.toISOString().split('T')[0], suggestions });
  } catch (error: any) {
    logAxiosError(error, 'GET /api/cash-secured-puts/[ticker]');
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json({ error: 'Upstream Alpaca error', status: error.response.status }, { status: 502 });
    }
    return NextResponse.json({ error: error?.message || 'Unknown server error' }, { status: 500 });
  }
}
