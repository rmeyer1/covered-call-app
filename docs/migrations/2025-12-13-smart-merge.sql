-- Portfolio “Smart Merge” support: asset type + option metadata + sticky cost basis.
-- Run in Supabase SQL editor or CLI before deploying the new code.

alter table if exists public.portfolio_holdings
  add column if not exists type text check (type in ('equity', 'option')) default 'equity',
  add column if not exists option_strike numeric,
  add column if not exists option_expiration text,
  add column if not exists option_right text check (option_right in ('call', 'put'));

alter table if exists public.portfolio_drafts
  add column if not exists asset_type text check (asset_type in ('equity', 'option')) default 'equity',
  add column if not exists option_strike numeric,
  add column if not exists option_expiration text,
  add column if not exists option_right text check (option_right in ('call', 'put'));

-- Prevent duplicate tickers per user while keeping existing IDs.
create unique index if not exists portfolio_holdings_user_ticker_idx
  on public.portfolio_holdings (user_id, ticker);
