import { addDays, closestTo, differenceInDays, parseISO } from 'date-fns';

export function getExpirationFromSymbol(symbol: string, ticker: string): string {
  const datePart = symbol.substring(ticker.length, ticker.length + 6);
  const year = `20${datePart.substring(0, 2)}`;
  const month = datePart.substring(2, 4);
  const day = datePart.substring(4, 6);
  return `${year}-${month}-${day}`;
}

export function nextExpirationDateForChain(optionChain: any[], ticker: string, daysAhead = 35): Date | null {
  const today = new Date();
  const targetDate = addDays(today, daysAhead);
  const expDates = [
    ...new Set(
      optionChain.map((option: any) => parseISO(getExpirationFromSymbol(option.symbol, ticker)))
    ),
  ];
  const futureDates = expDates.filter((d: Date) => d > today);
  const nextExp = futureDates.length ? closestTo(targetDate, futureDates) : null;
  return nextExp as Date | null;
}

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
