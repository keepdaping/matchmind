// app/api/live/route.js
// Fetches live/in-play scores from API-Football
// Matches them with user predictions for live "prediction vs reality" tracking
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { LEAGUES } from '@/lib/football'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://v3.football.api-sports.io'

function getHeaders() {
  return {
    'X-RapidAPI-Key': process.env.FOOTBALL_API_KEY,
    'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
  }
}

// Status code → readable label
const STATUS_LABELS = {
  '1H':  '1st Half',
  '2H':  '2nd Half',
  'HT':  'Half Time',
  'ET':  'Extra Time',
  'BT':  'Break',
  'P':   'Penalties',
  'FT':  'Full Time',
  'AET': 'After ET',
  'PEN': 'After Pens',
  'SUSP':'Suspended',
  'INT': 'Interrupted',
  'LIVE':'Live',
}

async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.split(' ')[1] || ''
  if (!token) return null
  const db = getServiceClient()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function GET(req) {
  try {
    const user = await getUserFromRequest(req)

    // Supported league IDs
    const supportedIds = new Set(Object.values(LEAGUES).map(l => l.id))
    const leagueById = {}
    for (const [name, cfg] of Object.entries(LEAGUES)) {
      leagueById[cfg.id] = name
    }

    let liveMatches = []

    // Fetch live matches from API-Football
    if (process.env.FOOTBALL_API_KEY && process.env.FOOTBALL_API_KEY !== 'your_rapidapi_key') {
      try {
        const res = await fetch(`${BASE_URL}/fixtures?live=all`, {
          headers: getHeaders(),
          cache: 'no-store',
        })
        const json = await res.json()

        if (json.response && json.response.length > 0) {
          liveMatches = json.response
            .filter(f => supportedIds.has(f.league?.id))
            .map(f => ({
              match_id: String(f.fixture.id),
              league: leagueById[f.league.id] || f.league.name,
              league_logo: f.league.logo,
              home_team: f.teams.home.name,
              away_team: f.teams.away.name,
              home_logo: f.teams.home.logo,
              away_logo: f.teams.away.logo,
              home_goals: f.goals.home ?? 0,
              away_goals: f.goals.away ?? 0,
              status: f.fixture.status.short,
              status_label: STATUS_LABELS[f.fixture.status.short] || f.fixture.status.long || 'Live',
              minute: f.fixture.status.elapsed || 0,
              venue: f.fixture.venue?.name,
              events: (f.events || []).slice(-5).map(e => ({
                minute: e.time?.elapsed,
                type: e.type,
                detail: e.detail,
                player: e.player?.name,
                team: e.team?.name,
              })),
            }))
        }
      } catch (err) {
        console.error('[Live] API fetch error:', err.message)
      }
    }

    // If no live matches from API, check today's fixtures for recently finished
    const db = getServiceClient()
    const today = new Date().toISOString().split('T')[0]

    if (liveMatches.length === 0) {
      const { data: todayFixtures } = await db
        .from('fixtures_cache')
        .select('*')
        .eq('date', today)
        .in('status', ['1H', '2H', 'HT', 'ET', 'FT', 'LIVE'])
        .order('match_time', { ascending: true })

      if (todayFixtures && todayFixtures.length > 0) {
        liveMatches = todayFixtures.map(f => ({
          match_id: f.match_id,
          league: f.league,
          home_team: f.home_team,
          away_team: f.away_team,
          home_goals: f.home_goals ?? 0,
          away_goals: f.away_goals ?? 0,
          status: f.status,
          status_label: STATUS_LABELS[f.status] || f.status,
          minute: null,
          venue: f.venue,
          events: [],
        }))
      }
    }

    // Match with user predictions (if logged in)
    let predictions = {}
    if (user && liveMatches.length > 0) {
      const matchIds = liveMatches.map(m => m.match_id)
      const { data: preds } = await db
        .from('predictions')
        .select('match_id, outcome, confidence, risk, top_scoreline, btts_confidence, over25_confidence, summary')
        .eq('user_id', user.id)
        .in('match_id', matchIds)

      if (preds) {
        for (const p of preds) {
          predictions[p.match_id] = p
        }
      }
    }

    // Enrich live matches with prediction data + live status
    const enriched = liveMatches.map(m => {
      const pred = predictions[m.match_id] || null
      const hg = m.home_goals
      const ag = m.away_goals

      // Current actual outcome
      let currentOutcome = 'Draw'
      if (hg > ag) currentOutcome = 'Home Win'
      else if (ag > hg) currentOutcome = 'Away Win'

      // Is prediction currently winning?
      let predictionStatus = null
      if (pred) {
        if (pred.outcome === currentOutcome) {
          predictionStatus = 'winning'
        } else if (['FT', 'AET', 'PEN'].includes(m.status)) {
          predictionStatus = pred.outcome === currentOutcome ? 'won' : 'lost'
        } else {
          predictionStatus = 'losing'
        }
      }

      return {
        ...m,
        prediction: pred ? {
          outcome: pred.outcome,
          confidence: pred.confidence,
          risk: pred.risk,
          top_scoreline: pred.top_scoreline,
          btts_confidence: pred.btts_confidence,
          over25_confidence: pred.over25_confidence,
          summary: pred.summary,
          status: predictionStatus,
        } : null,
        current_outcome: currentOutcome,
        btts_live: hg > 0 && ag > 0,
        over25_live: (hg + ag) > 2,
      }
    })

    return NextResponse.json({
      count: enriched.length,
      live: enriched,
      updated_at: new Date().toISOString(),
      next_refresh: 30, // suggest client refreshes every 30s
    })

  } catch (err) {
    console.error('[Live] Error:', err)
    return NextResponse.json({ error: err.message, live: [] }, { status: 500 })
  }
}
