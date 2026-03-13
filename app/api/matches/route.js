import { NextResponse } from 'next/server'
import { getTodayFixtures } from '@/lib/football'
import { getServiceClient } from '@/lib/supabase'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const league = searchParams.get('league')

    // Try to get from cache first (avoid burning API requests)
    const db = getServiceClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: cached } = await db
      .from('fixtures_cache')
      .select('*')
      .eq('date', today)
      .order('match_time', { ascending: true })

    if (cached && cached.length > 0) {
      const filtered = league && league !== 'All'
        ? cached.filter(f => f.league === league)
        : cached
      return NextResponse.json({ fixtures: filtered, source: 'cache' })
    }

    // Fetch fresh from API-Football
    const fixtures = await getTodayFixtures()

    // Cache in database for 6 hours
    if (fixtures.length > 0) {
      const rows = fixtures.map(f => ({
        match_id: f.id,
        date: today,
        league: f.league,
        home_team: f.home_team,
        away_team: f.away_team,
        match_time: f.date,
        venue: f.venue,
        status: f.status,
      }))

      await db.from('fixtures_cache').upsert(rows, { onConflict: 'match_id' })
    }

    const filtered = league && league !== 'All'
      ? fixtures.filter(f => f.league === league)
      : fixtures

    return NextResponse.json({ fixtures: filtered, source: 'api' })

  } catch (err) {
    console.error('Matches API error:', err)

    // Return demo data if API fails (so app still works during dev)
    return NextResponse.json({
      fixtures: getDemoFixtures(),
      source: 'demo'
    })
  }
}

function getDemoFixtures() {
  const today = new Date().toISOString()
  return [
    { id: 1001, league: 'Premier League', home_team: 'Arsenal', away_team: 'Chelsea', date: today, status: 'NS' },
    { id: 1002, league: 'Uganda Premier League', home_team: 'KCCA FC', away_team: 'Vipers SC', date: today, status: 'NS' },
    { id: 1003, league: 'Champions League', home_team: 'Real Madrid', away_team: 'Bayern Munich', date: today, status: 'NS' },
    { id: 1004, league: 'Premier League', home_team: 'Liverpool', away_team: 'Man City', date: today, status: 'NS' },
    { id: 1005, league: 'La Liga', home_team: 'Barcelona', away_team: 'Atletico Madrid', date: today, status: 'NS' },
  ]
}
