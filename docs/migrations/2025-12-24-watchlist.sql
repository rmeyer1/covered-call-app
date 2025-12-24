-- Watchlist persistence: table, constraints, and RLS.
-- Run in Supabase SQL editor or CLI before deploying the new code.

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  ticker text not null check (char_length(ticker) > 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists watchlist_items_user_ticker_idx
  on public.watchlist_items (user_id, ticker);

create index if not exists watchlist_items_user_position_idx
  on public.watchlist_items (user_id, position);

alter table public.watchlist_items enable row level security;

create policy if not exists "watchlist_items_select_own"
  on public.watchlist_items
  for select
  using (auth.uid() = user_id);

create policy if not exists "watchlist_items_insert_own"
  on public.watchlist_items
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "watchlist_items_update_own"
  on public.watchlist_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "watchlist_items_delete_own"
  on public.watchlist_items
  for delete
  using (auth.uid() = user_id);
