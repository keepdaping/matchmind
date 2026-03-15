import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { generateAccumulatorExplanation } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.split(' ')[1] || ''
  if (!token) return null

  const db = getServiceClient()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function POST(req) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = getServiceClient()

    // Check plan
    const { data: profile } = await db
      .from('users')
      .select('plan, token_balance')
      .eq('id', user.id)
      .single()

    if (!profile || !['pro', 'elite'].includes(profile.plan)) {
      return NextResponse.json({ error: 'Pro or Elite plan required', code: 'UPGRADE_REQUIRED' }, { status: 403 })
    }

    // Fetch today's fixtures
    const today = new Date().toISOString().split('T')[0]
    const { data: fixtures, error: fixturesError } = await db
      .from('fixtures_cache')
      .select('*')
      .gte('date', today)
      .eq('status', 'NS')  // Not started only
      .order('match_time', { ascending: true })
      .limit(30)

    if (fixturesError) {
      console.error('[Accumulator] Fixtures fetch error:', fixturesError)
      return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 500 })
    }

    if (!fixtures || fixtures.length < 3) {
      return NextResponse.json({
        error: 'Not enough matches available today for an accumulator'
      }, { status: 400 })
    }

    // Check if any of these matches already have cached predictions
    const matchIds = fixtures.map(f => f.match_id)
    const { data: cachedPredictions } = await db
      .from('match_predictions_cache')
      .select('match_id, outcome, confidence, risk, home_team, away_team, league')
      .in('match_id', matchIds)

    // Build candidate list from cached predictions (these have confidence scores)
    let candidates = []

    if (cachedPredictions && cachedPredictions.length >= 3) {
      // Use cached predictions — filter for strong ones
      candidates = cachedPredictions
        .filter(p => p.confidence >= 65 && p.risk !== 'High')
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
        .map(p => ({
          match: `${p.home_team} vs ${p.away_team}`,
          league: p.league,
          outcome: p.outcome,
          confidence: p.confidence,
          risk: p.risk
        }))
    }

    // If not enough cached predictions, fall back to using raw fixtures
    if (candidates.length < 3) {
      candidates = fixtures.slice(0, 5).map(f => ({
        match: `${f.home_team} vs ${f.away_team}`,
        league: f.league,
        outcome: 'To be determined',
        confidence: null,
        risk: 'Medium'
      }))
    }

    if (candidates.length < 3) {
      return NextResponse.json({
        error: 'Not enough strong matches available for an accumulator today'
      }, { status: 400 })
    }

    // Ask Claude to explain and validate the accumulator
    const explanation = await generateAccumulatorExplanation({ selections: candidates })

    return NextResponse.json({
      matches: candidates,
      combinedProbability: candidates
        .filter(c => c.confidence)
        .reduce((acc, m) => acc * (m.confidence / 100), 1)
        .toFixed(4),
      summary: explanation.summary,
      reasoning: explanation.reasoning,
      risk_level: explanation.risk_level
    })

  } catch (err) {
    console.error('[Accumulator] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
