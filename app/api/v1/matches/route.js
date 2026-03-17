// app/api/v1/matches/route.js
// Elite API — List today's available matches
import { NextResponse } from 'next/server'
import { authenticateApiKey, rateLimitHeaders } from '@/lib/api-auth'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  const auth = await authenticateApiKey(req)
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error, docs: 'https://matchmind.app/api-docs' },
      { status: auth.status, headers: auth.headers || {} }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const league = searchParams.get('league') || null

    const db = getServiceClient()
    const today = new Date().toISOString().split('T')[0]

    let query = db
      .from('fixtures_cache')
      .select('match_id, date, league, league_id, home_team, away_team, home_team_id, away_team_id, match_time, venue, status')
      .gte('date', today)
      .order('match_time', { ascending: true })

    if (league) {
      query = query.ilike('league', `%${league}%`)
    }

    const { data: fixtures, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 })
    }

    const matches = (fixtures || []).map(f => ({
      match_id: f.match_id,
      league: f.league,
      league_id: f.league_id,
      home_team: f.home_team,
      away_team: f.away_team,
      kickoff: f.match_time || f.date,
      venue: f.venue,
      status: f.status,
    }))

    return NextResponse.json({
      date: today,
      count: matches.length,
      matches,
    }, {
      headers: rateLimitHeaders(auth.remaining),
    })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
