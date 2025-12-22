export type BrokerageOption = {
  value: string;
  label: string;
  keywords: string[];
};

export const BROKERAGE_OPTIONS: BrokerageOption[] = [
  { value: 'fidelity', label: 'Fidelity', keywords: ['fidelity'] },
  { value: 'vanguard', label: 'Vanguard', keywords: ['vanguard'] },
  { value: 'robinhood', label: 'Robinhood', keywords: ['robinhood'] },
  { value: 'schwab', label: 'Charles Schwab', keywords: ['schwab', 'charles schwab'] },
  { value: 'trowe', label: 'T. Rowe Price', keywords: ['t rowe', 't. rowe', 'rowe price'] },
  { value: 'etrade', label: 'E*TRADE', keywords: ['etrade', 'e-trade'] },
  { value: 'tdameritrade', label: 'TD Ameritrade', keywords: ['td ameritrade', 'ameritrade'] },
  { value: 'merrill', label: 'Merrill', keywords: ['merrill', 'merrill edge'] },
  { value: 'interactivebrokers', label: 'Interactive Brokers', keywords: ['interactive brokers', 'ibkr'] },
  { value: 'webull', label: 'Webull', keywords: ['webull'] },
  { value: 'sofi', label: 'SoFi', keywords: ['sofi'] },
  { value: 'public', label: 'Public', keywords: ['public.com', 'public'] },
  { value: 'ally', label: 'Ally Invest', keywords: ['ally invest', 'ally'] },
  { value: 'm1', label: 'M1 Finance', keywords: ['m1 finance', 'm1'] },
  { value: 'stash', label: 'Stash', keywords: ['stash'] },
  { value: 'acorns', label: 'Acorns', keywords: ['acorns'] },
];

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectBrokerage(input?: string | null): BrokerageOption | null {
  if (!input) return null;
  const normalized = normalizeText(input);
  if (!normalized) return null;
  for (const option of BROKERAGE_OPTIONS) {
    if (option.keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return option;
    }
  }
  return null;
}

export function resolveBrokerLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  const found = BROKERAGE_OPTIONS.find((option) => option.value === value);
  return found?.label ?? value;
}
