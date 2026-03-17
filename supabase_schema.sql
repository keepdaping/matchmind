-- ============================================================
-- MATCHMIND PRODUCTION DATABASE SCHEMA
-- v2 — Fixed schema (see changelog at bottom)
-- ============================================================


-- USERS -------------------------------------------------------

create table public.users (

  id uuid primary key references auth.users(id) on delete cascade,

  email text unique not null,

  full_name text,
  avatar_url text,

  plan text default 'free'
    check (plan in ('free', 'pro', 'elite')),

  token_balance integer default 3,

  -- [FIX #5] Track daily free prediction usage
  free_predictions_today integer default 0,
  free_predictions_reset_date date default current_date,

  streak integer default 0,
  last_visit_date date,

  created_at timestamptz default now()

);


-- AUTO CREATE USER PROFILE -----------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.users (id, email, plan, token_balance)
  values (new.id, new.email, 'free', 3)
  on conflict (id) do nothing;

  return new;

end;
$$;


create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();


-- [FIX #5] Reset free prediction counter daily
create or replace function public.reset_free_predictions_if_needed(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    free_predictions_today = 0,
    free_predictions_reset_date = current_date
  where id = _user_id
    and free_predictions_reset_date < current_date;
end;
$$;


-- [FIX #4] SHARED MATCH PREDICTIONS CACHE --------------------
-- One AI-generated prediction per match, shared across all users.
-- Saves tokens — if match already predicted, return cached result.

create table public.match_predictions_cache (

  id uuid primary key default gen_random_uuid(),

  match_id text unique not null,

  home_team text not null,
  away_team text not null,

  league text not null,

  match_date timestamptz,

  -- [FIX #6] tier column added
  tier text default 'pro'
    check (tier in ('free', 'pro', 'elite')),

  outcome text,
  confidence integer,

  risk text
    check (risk in ('Low', 'Medium', 'High')),

  summary text,
  reasons text[] default '{}',
  key_stat text,
  watch_out text,

  btts_confidence integer,
  over25_confidence integer,

  -- Elite-only fields
  tactical_breakdown jsonb,
  injury_impact jsonb,
  pressure_index jsonb,
  referee_factor text,
  weather_factor text,
  value_signal jsonb,
  predicted_lineup jsonb,
  correct_score_suggestion text,
  elite_verdict text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()

);


-- PREDICTIONS (per-user unlock log) --------------------------
-- Tracks which user unlocked which match.
-- Does NOT store AI data — that lives in match_predictions_cache.

create table public.predictions (

  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.users(id) on delete cascade,

  -- [FIX #2] References shared cache, not standalone AI output
  match_id text not null references public.match_predictions_cache(match_id) on delete cascade,

  -- [FIX #6] tier the user unlocked at
  tier text default 'pro'
    check (tier in ('free', 'pro', 'elite')),

  result text,
  actual_outcome text,

  created_at timestamptz default now()

);

-- Each user unlocks each match only once
create unique index idx_predictions_user_match on predictions(user_id, match_id);

-- [FIX #2] Drop any ghost constraint left from old schema if re-running
-- Run this manually in Supabase SQL editor if you hit the duplicate key error:
-- ALTER TABLE predictions DROP CONSTRAINT IF EXISTS predictions_match_id_key;


-- FIXTURES CACHE ---------------------------------------------

create table public.fixtures_cache (

  id uuid primary key default gen_random_uuid(),

  match_id text unique not null,

  date date not null,

  league text not null,

  home_team text not null,
  away_team text not null,

  match_time timestamptz,

  venue text,

  status text default 'NS',

  created_at timestamptz default now()

);


-- TOKEN TRANSACTIONS ----------------------------------------

create table public.token_transactions (

  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.users(id) on delete cascade,

  amount integer not null,

  type text
    check (type in (
      'signup_bonus',
      'purchase',
      'subscription_grant',
      'prediction_unlock',
      'referral',
      'streak_reward'
    )),

  reference text,

  created_at timestamptz default now()

);


-- SUBSCRIPTIONS ----------------------------------------------

create table public.subscriptions (

  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.users(id) on delete cascade,

  stripe_subscription_id text unique,
  stripe_customer_id text,

  plan text,

  status text
    check (status in ('active', 'canceled', 'past_due', 'trialing')),

  current_period_end timestamptz,

  created_at timestamptz default now()

);


-- STREAK LOG -------------------------------------------------

create table public.streak_log (

  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.users(id) on delete cascade,

  log_date date not null,

  streak_day integer not null,

  unique(user_id, log_date)

);


-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table users enable row level security;
alter table predictions enable row level security;
alter table match_predictions_cache enable row level security;
alter table fixtures_cache enable row level security;
alter table token_transactions enable row level security;
alter table subscriptions enable row level security;
-- [FIX #7] streak_log was missing RLS
alter table streak_log enable row level security;


-- USERS POLICIES --------------------------------------------

create policy "users_select_own"
on users for select
using (auth.uid() = id);

create policy "users_update_own"
on users for update
using (auth.uid() = id);


-- PREDICTIONS POLICIES (unlock log) -------------------------

create policy "predictions_select_own"
on predictions for select
to authenticated
using (auth.uid() = user_id);

create policy "predictions_insert_own"
on predictions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "predictions_update_own"
on predictions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


-- MATCH PREDICTIONS CACHE POLICIES --------------------------
-- [FIX #4] Shared cache — all authenticated users can read,
-- only service role (server) can write

create policy "match_cache_read"
on match_predictions_cache for select
to authenticated
using (true);

-- Inserts/updates done server-side via service role key only
-- (no client insert policy needed here)


-- FIXTURES POLICIES -----------------------------------------

create policy "fixtures_read"
on fixtures_cache for select
to authenticated
using (true);

-- [FIX #8] Server-side insert/update for fixture caching
-- Done via service role key — no client insert policy needed
-- but adding explicit policy for clarity:
create policy "fixtures_service_insert"
on fixtures_cache for insert
to service_role
with check (true);

create policy "fixtures_service_update"
on fixtures_cache for update
to service_role
using (true);


-- TOKEN POLICIES --------------------------------------------

create policy "transactions_own"
on token_transactions for select
using (auth.uid() = user_id);


-- SUBSCRIPTIONS POLICIES ------------------------------------

create policy "subscriptions_own"
on subscriptions for select
using (auth.uid() = user_id);


-- [FIX #7] STREAK LOG POLICIES
create policy "streak_log_select_own"
on streak_log for select
to authenticated
using (auth.uid() = user_id);

create policy "streak_log_insert_own"
on streak_log for insert
to authenticated
with check (auth.uid() = user_id);


-- ============================================================
-- TOKEN UTILITIES
-- ============================================================

create or replace function public.decrement_user_tokens(_user uuid, _amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  update public.users
  set token_balance = token_balance - _amount
  where id = _user and token_balance >= _amount
  returning token_balance into new_balance;

  if new_balance is null then
    raise exception 'Insufficient tokens';
  end if;

  return new_balance;
end;
$$;


-- [FIX #5] Enforce free plan daily prediction limit
create or replace function public.check_and_increment_free_predictions(_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  user_plan text;
  preds_today integer;
  reset_date date;
begin
  select plan, free_predictions_today, free_predictions_reset_date
  into user_plan, preds_today, reset_date
  from public.users
  where id = _user_id;

  -- Pro/Elite bypass the limit
  if user_plan in ('pro', 'elite') then
    return true;
  end if;

  -- Reset counter if it's a new day
  if reset_date < current_date then
    update public.users
    set free_predictions_today = 1,
        free_predictions_reset_date = current_date
    where id = _user_id;
    return true;
  end if;

  -- Free plan: max 1 per day
  if preds_today >= 1 then
    return false;
  end if;

  -- Increment
  update public.users
  set free_predictions_today = free_predictions_today + 1
  where id = _user_id;

  return true;
end;
$$;


-- ============================================================
-- INDEXES (Performance)
-- ============================================================

create index idx_predictions_user_id on predictions(user_id);
create index idx_predictions_match_id on predictions(match_id);

create index idx_match_cache_match_id on match_predictions_cache(match_id);
create index idx_match_cache_league on match_predictions_cache(league);
create index idx_match_cache_date on match_predictions_cache(match_date);

create index idx_fixtures_date on fixtures_cache(date);
create index idx_fixtures_league on fixtures_cache(league);

create index idx_transactions_user on token_transactions(user_id);
create index idx_subscriptions_user on subscriptions(user_id);
create index idx_streak_log_user on streak_log(user_id);


-- ============================================================
-- CHANGELOG (v2 fixes)
-- ============================================================
-- FIX #2  Ghost constraint — removed unique(match_id) from predictions.
--         Use: ALTER TABLE predictions DROP CONSTRAINT IF EXISTS predictions_match_id_key;
--         in Supabase SQL editor if upgrading from v1.
-- FIX #3  SDK version — update package.json: npm install @anthropic-ai/sdk@latest
-- FIX #4  Added match_predictions_cache table for cross-user prediction sharing.
--         predictions table is now an unlock log only.
-- FIX #5  Added free_predictions_today + reset logic for daily free plan limit.
--         check_and_increment_free_predictions() enforces 1/day for free users.
-- FIX #6  Added tier column to both match_predictions_cache and predictions.
-- FIX #7  Added RLS + policies to streak_log (was completely unprotected).
-- FIX #8  Added service_role insert/update policies for fixtures_cache.
-- ============================================================
