import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

import { buildMatchFeatures } from '@/lib/features'
import { computeMatchProbabilities } from '@/lib/model'
import { generatePredictionFromStats } from '@/lib/prediction'
import { generateAccumulatorExplanation } from '@/lib/claude'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
      .from('users')
      .select('plan, token_balance')
      .eq('id', user.id)
      .single()

    if (!profile || profile.plan !== 'elite') {
      return NextResponse.json({ error: 'Elite plan required', code: 'NOT_ELITE' }, { status: 403 })
    }

    // Fetch today's matches (example: from fixtures_cache or external API)
    // For this refactor, assume we have a function to get today's matches with stats and odds
    const todayMatches = await db
      .from('fixtures_cache')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0])
      .limit(30)

    // Build predictions for each match
    const accumulatorCandidates = []
    for (const match of todayMatches.data || []) {
      // Assume match.stats and match.odds are available (otherwise, fetch them)
      const features = buildMatchFeatures(match.stats)
      const probabilities = computeMatchProbabilities(features)
      const prediction = generatePredictionFromStats(probabilities, match.odds)
      // Only include strong predictions
      if (prediction.probability >= 0.65 && prediction.risk !== 'High') {
        accumulatorCandidates.push({
          match: `${match.home_team} vs ${match.away_team}`,
          league: match.league,
          outcome: prediction.outcome,
          probability: prediction.probability,
          confidence: prediction.confidence,
          risk: prediction.risk
        })
      }
    }

    // Sort by probability descending, select top 3–5
    accumulatorCandidates.sort((a, b) => b.probability - a.probability)
    const selected = accumulatorCandidates.slice(0, 5)
    if (selected.length < 3) {
      return NextResponse.json({ error: 'Not enough strong matches for accumulator' }, { status: 400 })
    }
    const accumulatorMatches = selected.slice(0, Math.min(5, selected.length))

    // Calculate combined probability (product of individual probabilities)
    const combinedProbability = accumulatorMatches.reduce((acc, m) => acc * m.probability, 1)

    // Ask Claude for accumulator explanation
    const explanation = await generateAccumulatorExplanation({ selections: accumulatorMatches })

    return NextResponse.json({
      matches: accumulatorMatches,
      combinedProbability: Number(combinedProbability.toFixed(4)),
      summary: explanation.summary,
      reasoning: explanation.reasoning,
      risk_level: explanation.risk_level
    })

  } catch (err) {
    console.error('[Accumulator] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
