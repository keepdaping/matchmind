-- ============================================================
-- MATCHMIND — Migration v3
-- Adds team IDs and league ID to fixtures_cache
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.fixtures_cache
  ADD COLUMN IF NOT EXISTS home_team_id integer,
  ADD COLUMN IF NOT EXISTS away_team_id integer,
  ADD COLUMN IF NOT EXISTS league_id integer;

-- Index for fast lookups by team
CREATE INDEX IF NOT EXISTS idx_fixtures_home_team_id ON fixtures_cache(home_team_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_away_team_id ON fixtures_cache(away_team_id);

-- Also add btts_confidence and over25_confidence to predictions if missing
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS btts_confidence integer,
  ADD COLUMN IF NOT EXISTS over25_confidence integer,
  ADD COLUMN IF NOT EXISTS probability numeric(5,4),
  ADD COLUMN IF NOT EXISTS market_probability numeric(5,4),
  ADD COLUMN IF NOT EXISTS value numeric(5,4),
  ADD COLUMN IF NOT EXISTS tier text default 'pro';
