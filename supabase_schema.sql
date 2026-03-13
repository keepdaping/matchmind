-- ============================================================
-- MATCHMIND — Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- ─── USERS ────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  full_name       text,
  avatar_url      text,
  plan            text not null default 'free'
                    check (plan in ('free', 'pro', 'elite')),
  token_balance   integer not null default 3,
  streak          integer not null default 0,
  last_visit_date date,
  created_at      timestamptz not null default now()
);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.users (id, email, full_name, plan, token_balance)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'free',
    3
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─── PREDICTIONS ──────────────────────────────────────────
create table if not exists public.predictions (
  id                  uuid primary key default gen_random_uuid(),
  match_id            bigint unique,
  home_team           text not null,
  away_team           text not null,
  league              text not null,
  match_date          timestamptz,
  outcome             text,
  confidence          integer,
  risk                text check (risk in ('Low', 'Medium', 'High')),
  summary             text,
  reasons             text[] default '{}',
  key_stat            text,
  watch_out           text,
  btts_confidence     integer,
  over25_confidence   integer,
  result              text,       -- filled after match: 'correct' | 'incorrect' | 'void'
  actual_outcome      text,       -- what actually happened
  created_at          timestamptz not null default now()
);


-- ─── TOKEN TRANSACTIONS ───────────────────────────────────
create table if not exists public.token_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  amount      integer not null,   -- positive = added, negative = spent
  type        text not null
                check (type in (
                  'signup_bonus', 'purchase', 'subscription_grant',
                  'prediction_unlock', 'referral', 'streak_reward'
                )),
  reference   text,               -- match_id, stripe payment intent, etc.
  created_at  timestamptz not null default now()
);


-- ─── SUBSCRIPTIONS ────────────────────────────────────────
create table if not exists public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  stripe_subscription_id    text unique,
  stripe_customer_id        text,
  plan                      text,
  status                    text check (status in ('active', 'canceled', 'past_due', 'trialing')),
  current_period_end        timestamptz,
  created_at                timestamptz not null default now()
);


-- ─── FIXTURES CACHE ───────────────────────────────────────
create table if not exists public.fixtures_cache (
  id          uuid primary key default gen_random_uuid(),
  match_id    bigint unique not null,
  date        date not null,
  league      text not null,
  home_team   text not null,
  away_team   text not null,
  match_time  timestamptz,
  venue       text,
  status      text default 'NS',
  created_at  timestamptz not null default now()
);


-- ─── USER STREAKS LOG ─────────────────────────────────────
create table if not exists public.streak_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  log_date    date not null,
  streak_day  integer not null,
  unique (user_id, log_date)
);


-- ─── ROW LEVEL SECURITY ───────────────────────────────────
alter table public.users               enable row level security;
alter table public.predictions         enable row level security;
alter table public.token_transactions  enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.fixtures_cache      enable row level security;

-- Users: can only see/edit their own row
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- Predictions: anyone authenticated can read
create policy "predictions_read_all" on public.predictions
  for select using (auth.role() = 'authenticated');

-- Token transactions: own only
create policy "transactions_own" on public.token_transactions
  for select using (auth.uid() = user_id);

-- Subscriptions: own only
create policy "subscriptions_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Fixtures cache: readable by all authenticated users
create policy "fixtures_read_all" on public.fixtures_cache
  for select using (auth.role() = 'authenticated');

-- Service role bypasses RLS (needed for webhook handler)
-- This is automatic for the service role key


-- ─── INDEXES ──────────────────────────────────────────────
create index if not exists idx_predictions_match_id on public.predictions(match_id);
create index if not exists idx_predictions_league   on public.predictions(league);
create index if not exists idx_fixtures_date        on public.fixtures_cache(date);
create index if not exists idx_tokens_user_id       on public.token_transactions(user_id);
create index if not exists idx_subs_user_id         on public.subscriptions(user_id);


-- ─── DONE ─────────────────────────────────────────────────
-- You should now see these tables in your Supabase Table Editor:
-- users, predictions, token_transactions, subscriptions, fixtures_cache, streak_log
