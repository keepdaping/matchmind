import { NextResponse } from 'next/server'
import { getTodayFixtures } from '@/lib/football'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const league = searchParams.get('league') || 'All'

    const db = getServiceClient()
    const today = new Date().toISOString().split('T')[0]

    // ── 1. Check Supabase cache first ─────────────────────
    const { data: cached, error: cacheError } = await db
      .from('fixtures_cache')
      .select('*')
      .eq('date', today)
      .order('match_time', { ascending: true })

    if (!cacheError && cached && cached.length > 0) {
      console.log(`[Matches] Returning ${cached.length} cached fixtures`)
      const enriched = cached.map(f => ({
        ...f,
        date: f.match_time || f.date,
      }))
      const filtered = league !== 'All'
        ? enriched.filter(f => f.league === league)
        : enriched
      return NextResponse.json({ fixtures: filtered, source: 'cache' })
    }

    // ── 2. No API key → use demo data ─────────────────────
    if (!process.env.FOOTBALL_API_KEY || process.env.FOOTBALL_API_KEY === 'your_rapidapi_key') {
      console.log('[Matches] No FOOTBALL_API_KEY — using demo fixtures')
      const demoFixtures = getDemoFixtures('All')

      const rows = demoFixtures.map(f => ({
        match_id: String(f.id),
        date: today,
        league: f.league,
        home_team: f.home_team,
        away_team: f.away_team,
        home_team_id: f.home_team_id || null,
        away_team_id: f.away_team_id || null,
        league_id: f.league_id || null,
        match_time: f.date,
        venue: null,
        status: 'NS',
      }))

      const { error: upsertErr } = await db
        .from('fixtures_cache')
        .upsert(rows, { onConflict: 'match_id' })
      if (upsertErr) console.error('[Matches] Demo cache upsert error:', upsertErr.message)

      const filtered = league !== 'All'
        ? demoFixtures.filter(f => f.league === league)
        : demoFixtures

      return NextResponse.json({
        fixtures: filtered,
        source: 'demo',
        notice: 'Add FOOTBALL_API_KEY to .env.local for live fixtures'
      })
    }

    // ── 3. Fetch from API-Football ─────────────────────────
    console.log('[Matches] Fetching live fixtures from API-Football...')
    const fixtures = await getTodayFixtures()

    // ── 4. Cache in Supabase (with team IDs) ──────────────
    if (fixtures.length > 0) {
      const rows = fixtures.map(f => ({
        match_id: String(f.id),
        date: today,
        league: f.league,
        home_team: f.home_team,
        away_team: f.away_team,
        home_team_id: f.home_team_id || null,
        away_team_id: f.away_team_id || null,
        league_id: f.league_id || null,
        match_time: f.date,
        venue: f.venue || null,
        status: f.status || 'NS',
      }))
      const { error: upsertErr } = await db
        .from('fixtures_cache')
        .upsert(rows, { onConflict: 'match_id' })
      if (upsertErr) console.error('[Matches] Cache upsert error:', upsertErr.message)
    }

    // ── 5. Filter by league ────────────────────────────────
    const filtered = league !== 'All'
      ? fixtures.filter(f => f.league === league)
      : fixtures

    // ── 6. No fixtures → fallback to demo ─────────────────
    if (filtered.length === 0) {
      console.log('[Matches] API returned 0 fixtures — falling back to demo')
      const demoFixtures = getDemoFixtures('All')
      const rows = demoFixtures.map(f => ({
        match_id: String(f.id),
        date: today,
        league: f.league,
        home_team: f.home_team,
        away_team: f.away_team,
        home_team_id: null,
        away_team_id: null,
        league_id: null,
        match_time: f.date,
        venue: null,
        status: 'NS',
      }))
      await db.from('fixtures_cache').upsert(rows, { onConflict: 'match_id' })

      return NextResponse.json({
        fixtures: getDemoFixtures(league),
        source: 'demo',
        notice: 'No live fixtures found for today. Showing demo matches.'
      })
    }

    return NextResponse.json({ fixtures: filtered, source: 'api' })

  } catch (err) {
    console.error('[Matches] Unhandled error:', err)
    return NextResponse.json({
      fixtures: getDemoFixtures('All'),
      source: 'demo',
      error: err.message,
    })
  }
}

function getDemoFixtures(league = 'All') {
  const t = (h) => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    return d.toISOString()
  }

  const all = [
    { id: 9001, league: 'Premier League',        league_id: 39,  home_team: 'Arsenal',     home_team_id: 42,  away_team: 'Chelsea',         away_team_id: 49,  date: t(15), status: 'NS' },
    { id: 9002, league: 'Premier League',        league_id: 39,  home_team: 'Liverpool',   home_team_id: 40,  away_team: 'Man City',         away_team_id: 50,  date: t(17), status: 'NS' },
    { id: 9003, league: 'Uganda Premier League', league_id: 671, home_team: 'KCCA FC',     home_team_id: null, away_team: 'Vipers SC',       away_team_id: null, date: t(14), status: 'NS' },
    { id: 9004, league: 'Uganda Premier League', league_id: 671, home_team: 'Express FC',  home_team_id: null, away_team: 'SC Villa',        away_team_id: null, date: t(16), status: 'NS' },
    { id: 9005, league: 'Champions League',      league_id: 2,   home_team: 'Real Madrid', home_team_id: 541, away_team: 'Bayern Munich',    away_team_id: 157, date: t(20), status: 'NS' },
    { id: 9006, league: 'Champions League',      league_id: 2,   home_team: 'Man City',    home_team_id: 50,  away_team: 'PSG',              away_team_id: 85,  date: t(20), status: 'NS' },
    { id: 9007, league: 'La Liga',               league_id: 140, home_team: 'Barcelona',   home_team_id: 529, away_team: 'Atletico Madrid',  away_team_id: 530, date: t(21), status: 'NS' },
    { id: 9008, league: 'Serie A',               league_id: 135, home_team: 'AC Milan',    home_team_id: 489, away_team: 'Inter Milan',      away_team_id: 505, date: t(19), status: 'NS' },
    { id: 9009, league: 'NPFL Nigeria',          league_id: 334, home_team: 'Enyimba FC',  home_team_id: null, away_team: 'Rivers United',  away_team_id: null, date: t(15), status: 'NS' },
    { id: 9010, league: 'Kenya Premier League',  league_id: 700, home_team: 'Gor Mahia',   home_team_id: null, away_team: 'AFC Leopards',   away_team_id: null, date: t(15), status: 'NS' },
  ]

  if (league === 'All') return all
  return all.filter(f => f.league === league)
}
