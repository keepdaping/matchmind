// app/api/v1/accumulator/route.js
// Elite API — Get today's AI accumulator
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
    const db = getServiceClient()
    const today = new Date().toISOString().split('T')[0]

    // Fetch today's predictions for this user
    const { data: predictions } = await db
      .from('predictions')
      .select('*')
      .eq('user_id', auth.user.id)
      .gte('match_date', today)
      .order('confidence', { ascending: false })

    if (!predictions || predictions.length < 3) {
      return NextResponse.json({
        error: 'Not enough predictions available for an accumulator today. Generate predictions first via GET /api/v1/predictions?match_id=X',
        tip: 'Use GET /api/v1/matches to find available matches, then predict at least 3.',
      }, { status: 400 })
    }

    // Select top 3 by confidence (stable markets preferred)
    const stableMarkets = ['Home Win', 'Away Win', 'Over 2.5 Goals']
    let candidates = predictions
      .filter(p => p.confidence >= 60 && p.risk !== 'High' && stableMarkets.includes(p.outcome))
      .slice(0, 5)

    if (candidates.length < 3) {
      candidates = predictions
        .filter(p => p.confidence >= 55)
        .slice(0, 3)
    }

    if (candidates.length < 3) {
      return NextResponse.json({
        error: 'Not enough high-confidence predictions for a reliable accumulator today.',
      }, { status: 400 })
    }

    candidates = candidates.slice(0, 3)

    const toOdds = (p) => {
      const prob = p.probability || (p.confidence / 100)
      if (!prob || prob <= 0) return 2.00
      return Math.max(1.01, Number((1 / prob).toFixed(2)))
    }

    const combinedOdds = candidates.reduce((acc, p) => acc * toOdds(p), 1)
    const avgConf = Math.round(candidates.reduce((sum, p) => sum + p.confidence, 0) / candidates.length)

    return NextResponse.json({
      date: today,
      accumulator: {
        selections: candidates.map(p => ({
          match_id: p.match_id,
          match: `${p.home_team} vs ${p.away_team}`,
          league: p.league,
          pick: p.outcome,
          confidence: p.confidence,
          estimated_odds: toOdds(p).toFixed(2),
          risk: p.risk,
          reasoning: p.summary || `Model confidence: ${p.confidence}%`,
          value: p.value != null ? Number(p.value.toFixed(3)) : null,
        })),
        combined_odds: combinedOdds.toFixed(2),
        overall_confidence: avgConf,
        potential_return: `$10 stake → $${(10 * combinedOdds).toFixed(2)}`,
        banker: `${candidates[0].home_team} vs ${candidates[0].away_team} — ${candidates[0].outcome}`,
        risk_warning: 'Always gamble responsibly. Never bet more than you can afford to lose.',
      },
    }, { headers: rateLimitHeaders(auth.remaining) })

  } catch (err) {
    console.error('[API v1] Accumulator error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
