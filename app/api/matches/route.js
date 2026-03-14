import { NextResponse } from 'next/server'
import { getTodayFixtures } from '@/lib/football'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic' // never cache this route

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const league = searchParams.get('league') || 'All'

    // ── 1. Check Supabase cache first ─────────────────────
    const db = getServiceClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: cached, error: cacheError } = await db
      .from('fixtures_cache')
      .select('*')
      .eq('date', today)
      .order('match_time', { ascending: true })

    if (!cacheError && cached && cached.length > 0) {
      console.log(`[Matches] Returning ${cached.length} cached fixtures`)
      const enriched = cached.map(f => ({
        ...f,
        // For cached records we keep the full fixture time in `date` to match the live API response.
        date: f.match_time || f.date,
      }))
      const filtered = league !== 'All'
        ? enriched.filter(f => f.league === league)
        : enriched
      return NextResponse.json({ fixtures: filtered, source: 'cache' })
    }

    // ── 2. No API key yet → return demo data ──────────────
    if (!process.env.FOOTBALL_API_KEY) {
      console.log('[Matches] No FOOTBALL_API_KEY — returning demo fixtures')
      return NextResponse.json({
        fixtures: getDemoFixtures(league),
        source: 'demo',
        notice: 'Add FOOTBALL_API_KEY to .env.local for live fixtures'
      })
    }

    // ── 3. Fetch from API-Football ─────────────────────────
    console.log('[Matches] Fetching live fixtures from API-Football...')
    const fixtures = await getTodayFixtures()

    // ── 4. Cache in Supabase ───────────────────────────────
    if (fixtures.length > 0) {
      const rows = fixtures.map(f => ({
        match_id: f.id,
        date: today,
        league: f.league,
        home_team: f.home_team,
        away_team: f.away_team,
        match_time: f.date,
        venue: f.venue || null,
        status: f.status || 'NS',
      }))
      const { error: upsertErr } = await db
        .from('fixtures_cache')
        .upsert(rows, { onConflict: 'match_id' })
      if (upsertErr) console.error('[Matches] Cache upsert error:', upsertErr.message)
    }

    // ── 5. Filter by league if requested ──────────────────
    const filtered = league !== 'All'
      ? fixtures.filter(f => f.league === league)
      : fixtures

    // ── 6. No fixtures from API today → fallback to demo ──
    if (filtered.length === 0) {
      console.log('[Matches] API returned 0 fixtures — falling back to demo data')
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

// Demo fixtures — shown when API key isn't set or no matches today
// These are realistic and let you test the full prediction flow
function getDemoFixtures(league = 'All') {
  const t = (h) => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    return d.toISOString()
  }

  const all = [
    { id: 9001, league: 'Premier League',        home_team: 'Arsenal',      away_team: 'Chelsea',          date: t(15), status: 'NS' },
    { id: 9002, league: 'Premier League',        home_team: 'Liverpool',    away_team: 'Man City',          date: t(17), status: 'NS' },
    { id: 9003, league: 'Uganda Premier League', home_team: 'KCCA FC',      away_team: 'Vipers SC',         date: t(14), status: 'NS' },
    { id: 9004, league: 'Uganda Premier League', home_team: 'Express FC',   away_team: 'SC Villa',          date: t(16), status: 'NS' },
    { id: 9005, league: 'Champions League',      home_team: 'Real Madrid',  away_team: 'Bayern Munich',     date: t(20), status: 'NS' },
    { id: 9006, league: 'Champions League',      home_team: 'Man City',     away_team: 'PSG',               date: t(20), status: 'NS' },
    { id: 9007, league: 'La Liga',               home_team: 'Barcelona',    away_team: 'Atletico Madrid',   date: t(21), status: 'NS' },
    { id: 9008, league: 'Serie A',               home_team: 'AC Milan',     away_team: 'Inter Milan',       date: t(19), status: 'NS' },
    { id: 9009, league: 'NPFL Nigeria',          home_team: 'Enyimba FC',   away_team: 'Rivers United',     date: t(15), status: 'NS' },
    { id: 9010, league: 'Kenya Premier League',  home_team: 'Gor Mahia',    away_team: 'AFC Leopards',      date: t(15), status: 'NS' },
  ]

  if (league === 'All') return all
  return all.filter(f => f.league === league)
}
