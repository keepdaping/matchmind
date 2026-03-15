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
    const { data: profile } = await db
      .from('users').select('plan, token_balance').eq('id', user.id).single()

    if (!profile || !['pro', 'elite'].includes(profile.plan)) {
      return NextResponse.json({ error: 'Pro or Elite plan required', code: 'UPGRADE_REQUIRED' }, { status: 403 })
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: fixtures, error: fixturesError } = await db
      .from('fixtures_cache').select('*')
      .gte('date', today).eq('status', 'NS')
      .order('match_time', { ascending: true }).limit(30)

    if (fixturesError) return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 500 })
    if (!fixtures || fixtures.length < 3) return NextResponse.json({ error: 'Not enough matches today' }, { status: 400 })

    const matchIds = fixtures.map(f => f.match_id)
    const { data: cachedPredictions } = await db
      .from('match_predictions_cache')
      .select('match_id, outcome, confidence, risk, home_team, away_team, league')
      .in('match_id', matchIds)

    let candidates = []

    if (cachedPredictions && cachedPredictions.length >= 3) {
      candidates = cachedPredictions
        .filter(p => p.confidence >= 65 && p.risk !== 'High')
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(p => ({
          match: p.home_team + ' vs ' + p.away_team,
          league: p.league,
          outcome: p.outcome,
          confidence: p.confidence,
          risk: p.risk
        }))
    }

    if (candidates.length < 3) {
      candidates = fixtures.slice(0, 3).map(f => ({
        match: f.home_team + ' vs ' + f.away_team,
        league: f.league,
        outcome: 'To be determined',
        confidence: null,
        risk: 'Medium'
      }))
    }

    if (candidates.length < 3) {
      return NextResponse.json({ error: 'Not enough strong matches today' }, { status: 400 })
    }

    const explanation = await generateAccumulatorExplanation({ selections: candidates })

    const oddsMap = c => c.confidence >= 80 ? 1.85 : c.confidence >= 65 ? 2.10 : 2.50
    const combinedOdds = candidates.reduce((acc, c) => acc * oddsMap(c), 1).toFixed(2)
    const withConf = candidates.filter(c => c.confidence)
    const avgConfidence = withConf.length
      ? Math.round(withConf.reduce((sum, c) => sum + c.confidence, 0) / withConf.length)
      : 70

    return NextResponse.json({
      accumulator: {
        title: `Today's AI Accumulator — ${new Date().toDateString()}`,
        selections: candidates.map(c => ({
          match: c.match,
          league: c.league,
          pick: c.outcome || 'To be determined',
          estimated_odds: oddsMap(c).toFixed(2),
          confidence: c.confidence || 70,
          reasoning: explanation.reasoning
            ? `${c.risk} risk selection. ${explanation.reasoning.slice(0, 80)}...`
            : `${c.risk} risk selection based on current form and match data.`,
          risk: c.risk
        })),
        estimated_combined_odds: combinedOdds,
        overall_confidence: avgConfidence,
        potential_return_example: `$10 stake → $${(10 * parseFloat(combinedOdds)).toFixed(2)} return`,
        banker: candidates[0]?.match || '',
        risk_warning: explanation.risk_level === 'High'
          ? '⚠️ High risk accumulator — stake responsibly'
          : 'Always gamble responsibly. Never bet more than you can afford.',
        elite_note: explanation.reasoning || 'AI-selected picks based on today\'s match data.',
        avoid_market: null,
        summary: explanation.summary,
        risk_level: explanation.risk_level
      }
    })

  } catch (err) {
    console.error('[Accumulator] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
