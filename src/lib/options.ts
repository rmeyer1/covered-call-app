import { differenceInDays } from 'date-fns';
import { getExpirationFromSymbol } from './expirations';

export { getExpirationFromSymbol, nextExpirationDateForChain } from './expirations';

export function callsAtExpiration(optionChain: any[], ticker: string, expDate: Date): any[] {
  const expStr = expDate.toISOString().split('T')[0];
  return optionChain.filter((option: any) => getExpirationFromSymbol(option.symbol, ticker) === expStr);
}

export function buildSuggestions(currentPrice: number, calls: any[], nextExp: Date, otmFactors: number[] = [1.1, 1.15, 1.2]) {
  const today = new Date();
  const daysToExp = differenceInDays(nextExp, today);
  return otmFactors.map((otmFactor) => {
    const targetStrike = Math.round((currentPrice * otmFactor) / 5) * 5;
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
      delta: closestCall.greeks?.delta,
      theta: closestCall.greeks?.theta,
      gamma: closestCall.greeks?.gamma,
      vega: closestCall.greeks?.vega,
      impliedVolatility: closestCall.impliedVolatility,
      yieldMonthly: yieldMonthly.toFixed(2),
      yieldAnnualized: yieldAnnualized.toFixed(2),
      expiration: nextExp.toISOString().split('T')[0],
      dte: daysToExp,
    };
  });
}

export function mapSnapshotsWithStrike(snapshots: Record<string, any>) {
  return Object.entries(snapshots).map(([symbol, snapshot]) => {
    const strikePart = symbol.slice(-8);
    const strike_price = parseInt(strikePart, 10) / 1000;
    return {
      ...snapshot,
      symbol,
      strike_price,
    };
  });
}

// Shared domain helpers for dashboards
export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export function selectCallsByMoneyness(calls: any[], currentPrice: number, moneyness: Moneyness, count = 3) {
  const withDelta = calls.filter((c) => typeof c?.greeks?.delta === 'number');
  const useDelta = withDelta.length >= count;
  if (useDelta) {
    let low = 0, high = 1, target = 0.5;
    if (moneyness === 'ITM') { low = 0.55; high = 0.8; target = 0.65; }
    else if (moneyness === 'ATM') { low = 0.45; high = 0.55; target = 0.5; }
    else { low = 0.25; high = 0.45; target = 0.35; }
    const band = withDelta.filter((c) => c.greeks.delta >= low && c.greeks.delta <= high);
    const pool = band.length ? band : withDelta;
    return pool
      .map((c) => ({ c, score: Math.abs((c.greeks.delta ?? target) - target) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map((x) => x.c);
  }
  const sorted = [...calls].sort((a, b) => a.strike_price - b.strike_price);
  if (moneyness === 'ITM') return sorted.filter((c) => c.strike_price <= currentPrice).reverse().slice(0, count);
  if (moneyness === 'OTM') return sorted.filter((c) => c.strike_price >= currentPrice).slice(0, count);
  return [...sorted]
    .map((c) => ({ c, d: Math.abs(c.strike_price - currentPrice) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.c);
}

export function selectPutsByMoneyness(puts: any[], currentPrice: number, moneyness: Moneyness, count = 3) {
  const withDelta = puts.filter((p) => typeof p?.greeks?.delta === 'number');
  const useDelta = withDelta.length >= count;
  if (useDelta) {
    let low = -1, high = 0, target = -0.2;
    if (moneyness === 'OTM') { low = -0.35; high = -0.1; target = -0.2; }
    else if (moneyness === 'ITM') { low = -0.75; high = -0.55; target = -0.65; }
    else { low = -0.55; high = -0.45; target = -0.5; }
    const band = withDelta.filter((p) => p.greeks.delta >= low && p.greeks.delta <= high);
    const pool = band.length ? band : withDelta;
    return pool
      .map((p) => ({ p, score: Math.abs((p.greeks.delta ?? target) - target) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map((x) => x.p);
  }
  const sorted = [...puts].sort((a, b) => a.strike_price - b.strike_price);
  if (moneyness === 'OTM') return sorted.filter((p) => p.strike_price <= currentPrice).reverse().slice(0, count);
  if (moneyness === 'ITM') return sorted.filter((p) => p.strike_price > currentPrice).slice(0, count);
  return [...sorted]
    .map((p) => ({ p, d: Math.abs(p.strike_price - currentPrice) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.p);
}

export function buildLongCallSuggestions(
  currentPrice: number,
  selectedCalls: any[],
  nextExp: Date
) {
  const dte = differenceInDays(nextExp, new Date());
  return selectedCalls.map((c) => {
    const bid = c?.latestQuote?.bp ?? 0;
    const ask = c?.latestQuote?.ap ?? 0;
    const premium = (bid + ask) / 2 || ask || bid || 0;
    const strike = c.strike_price;
    const intrinsic = Math.max(currentPrice - strike, 0);
    const extrinsic = Math.max(premium - intrinsic, 0);
    const breakeven = strike + premium;
    return {
      strike,
      premium,
      delta: c?.greeks?.delta ?? null,
      theta: c?.greeks?.theta ?? null,
      gamma: c?.greeks?.gamma ?? null,
      vega: c?.greeks?.vega ?? null,
      impliedVolatility: c?.impliedVolatility ?? null,
      intrinsic,
      extrinsic,
      breakeven,
      dte,
    };
  });
}

export function buildCspSuggestions(
  selectedPuts: any[],
  nextExp: Date
) {
  const dte = differenceInDays(nextExp, new Date());
  return selectedPuts.map((p) => {
    const bid = p?.latestQuote?.bp ?? 0;
    const ask = p?.latestQuote?.ap ?? 0;
    const premium = bid || (bid + ask) / 2 || ask || 0;
    const strike = p.strike_price;
    const breakeven = strike - premium;
    const roc = (premium / strike) * 100;
    const rocAnnual = roc * (365 / Math.max(1, dte));
    return {
      strike,
      premium,
      bid,
      ask,
      delta: p?.greeks?.delta ?? null,
      theta: p?.greeks?.theta ?? null,
      gamma: p?.greeks?.gamma ?? null,
      vega: p?.greeks?.vega ?? null,
      impliedVolatility: p?.impliedVolatility ?? null,
      returnPct: roc.toFixed(2),
      returnAnnualized: rocAnnual.toFixed(2),
      breakeven,
      dte,
    };
  });
}

export function buildLongPutSuggestions(
  currentPrice: number,
  selectedPuts: any[],
  nextExp: Date
) {
  const dte = differenceInDays(nextExp, new Date());
  return selectedPuts.map((p) => {
    const bid = p?.latestQuote?.bp ?? 0;
    const ask = p?.latestQuote?.ap ?? 0;
    const premium = (bid + ask) / 2 || ask || bid || 0;
    const strike = p.strike_price;
    const intrinsic = Math.max(strike - currentPrice, 0);
    const extrinsic = Math.max(premium - intrinsic, 0);
    const breakeven = strike - premium;
    return {
      strike,
      premium,
      delta: p?.greeks?.delta ?? null,
      theta: p?.greeks?.theta ?? null,
      gamma: p?.greeks?.gamma ?? null,
      vega: p?.greeks?.vega ?? null,
      impliedVolatility: p?.impliedVolatility ?? null,
      intrinsic,
      extrinsic,
      breakeven,
      dte,
    };
  });
}
