-- ============================================================
-- MATCHMIND PRODUCTION DATABASE SCHEMA
-- ============================================================


-- USERS -------------------------------------------------------

create table public.users (

  id uuid primary key references auth.users(id) on delete cascade,

  email text unique not null,

  full_name text,
  avatar_url text,

  plan text default 'free'
  check (plan in ('free','pro','elite')),

  token_balance integer default 3,

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

insert into public.users (id,email,plan,token_balance)
values (new.id,new.email,'free',3)
on conflict (id) do nothing;

return new;

end;

$$;


create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();



-- FIXTURES CACHE ---------------------------------------------

create table public.fixtures_cache (

  id uuid primary key default gen_random_uuid(),

  match_id text unique not null,   -- IMPORTANT (UUID compatible)

  date date not null,

  league text not null,

  home_team text not null,
  away_team text not null,

  match_time timestamptz,

  venue text,

  status text default 'NS',

  created_at timestamptz default now()

);



-- PREDICTIONS ------------------------------------------------

create table public.predictions (

  id uuid primary key default gen_random_uuid(),

  match_id text unique,    -- TEXT avoids bigint errors

  home_team text not null,
  away_team text not null,

  league text not null,

  match_date timestamptz,

  outcome text,

  confidence integer,

  risk text
  check (risk in ('Low','Medium','High')),

  summary text,

  reasons text[] default '{}',

  key_stat text,
  watch_out text,

  btts_confidence integer,
  over25_confidence integer,

  result text,
  actual_outcome text,

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
  check (status in ('active','canceled','past_due','trialing')),

  current_period_end timestamptz,

  created_at timestamptz default now()

);



-- STREAK LOG -------------------------------------------------

create table public.streak_log (

  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.users(id) on delete cascade,

  log_date date not null,

  streak_day integer not null,

  unique(user_id,log_date)

);



-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table users enable row level security;
alter table predictions enable row level security;
alter table fixtures_cache enable row level security;
alter table token_transactions enable row level security;
alter table subscriptions enable row level security;



-- USERS POLICIES --------------------------------------------

create policy "users_select_own"
on users
for select
using (auth.uid() = id);


create policy "users_update_own"
on users
for update
using (auth.uid() = id);



-- PREDICTIONS POLICIES --------------------------------------

create policy "predictions_read"
on predictions
for select
to authenticated
using (true);


create policy "predictions_insert"
on predictions
for insert
to authenticated
with check (true);



-- FIXTURES POLICIES -----------------------------------------

create policy "fixtures_read"
on fixtures_cache
for select
to authenticated
using (true);



-- TOKEN POLICIES --------------------------------------------

create policy "transactions_own"
on token_transactions
for select
using (auth.uid() = user_id);



-- SUBSCRIPTIONS POLICIES ------------------------------------

create policy "subscriptions_own"
on subscriptions
for select
using (auth.uid() = user_id);



-- ============================================================
-- INDEXES (Performance)
-- ============================================================

create index idx_predictions_match_id
on predictions(match_id);

create index idx_predictions_league
on predictions(league);

create index idx_fixtures_date
on fixtures_cache(date);

create index idx_transactions_user
on token_transactions(user_id);

create index idx_subscriptions_user
on subscriptions(user_id);