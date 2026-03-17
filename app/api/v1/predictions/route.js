// app/api/v1/predictions/route.js
// Elite API — Get predictions
// GET /api/v1/predictions              → all today's predictions for this user
// GET /api/v1/predictions?match_id=X   → single match prediction (generates if needed)
// GET /api/v1/predictions?league=X     → filter by league
import { NextResponse } from 'next/server'
import { authenticateApiKey, rateLimitHeaders } from '@/lib/api-auth'
import { getServiceClient } from '@/lib/supabase'
import { buildMatchFeatures } from '@/lib/features'
import { computeMatchProbabilities } from '@/lib/model'
import { generatePredictionFromStats } from '@/lib/prediction'
import { generatePredictionExplanation } from '@/lib/claude'
import { getFullMatchData } from '@/lib/football'

export const dynamic = 'force-dynamic'

function formatPrediction(p) {
  return {
    match_id: p.match_id,
    home_team: p.home_team,
    away_team: p.away_team,
    league: p.league,
    match_date: p.match_date,
    prediction: {
      outcome: p.outcome,
      confidence: p.confidence,
      probability: p.probability,
      risk: p.risk,
      top_scoreline: p.top_scoreline || null,
      expected_goals: {
        home: p.expected_home_goals,
        away: p.expected_away_goals,
      },
    },
    markets: {
      btts_confidence: p.btts_confidence,
      over25_confidence: p.over25_confidence,
    },
    analysis: {
      summary: p.summary,
      reasons: p.reasons || [],
      key_stat: p.key_stat,
      watch_out: p.watch_out,
    },
    value: p.value != null ? {
      model_probability: p.probability,
      market_probability: p.market_probability,
      edge: p.value,
    } : null,
    result: p.actual_outcome ? {
      actual_outcome: p.actual_outcome,
      score: `${p.actual_home_goals}-${p.actual_away_goals}`,
      correct: p.prediction_correct,
    } : null,
    tier: p.tier,
    created_at: p.created_at,
  }
}

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
    const matchId = searchParams.get('match_id')
    const league = searchParams.get('league')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

    const db = getServiceClient()

    // Single match prediction
    if (matchId) {
      // Check if already predicted
      const { data: existing } = await db
        .from('predictions')
        .select('*')
        .eq('user_id', auth.user.id)
        .eq('match_id', String(matchId))
        .single()

      if (existing) {
        return NextResponse.json({
          prediction: formatPrediction(existing),
          cached: true,
        }, { headers: rateLimitHeaders(auth.remaining) })
      }

      // Generate new prediction
      const { data: fixture } = await db
        .from('fixtures_cache')
        .select('*')
        .eq('match_id', String(matchId))
        .single()

      if (!fixture) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 })
      }

      const matchData = await getFullMatchData(fixture)

      const features = buildMatchFeatures({
        recentMatchesHome: matchData.homeStats,
        recentMatchesAway: matchData.awayStats,
        headToHead: matchData.h2h,
        leagueAvgGoals: matchData.leagueAvgGoals,
      })
      const probabilities = computeMatchProbabilities(features)
      const prediction = generatePredictionFromStats(probabilities, matchData.odds || null)
      const explanation = await generatePredictionExplanation({
        prediction,
        features: {
          ...features,
          home_team: fixture.home_team,
          away_team: fixture.away_team,
          league: fixture.league,
          home_form: matchData.homeForm,
          away_form: matchData.awayForm,
          h2h: matchData.h2hStr,
        },
        probabilities,
      })

      const record = {
        user_id: auth.user.id,
        match_id: String(matchId),
        home_team: fixture.home_team,
        away_team: fixture.away_team,
        league: fixture.league,
        match_date: fixture.match_time || new Date().toISOString(),
        outcome: prediction.outcome,
        confidence: prediction.confidence,
        probability: prediction.probability,
        risk: prediction.risk,
        summary: explanation.summary || '',
        reasons: explanation.reasons || [],
        key_stat: explanation.key_stat || '',
        watch_out: explanation.watch_out || '',
        btts_confidence: Math.round((probabilities.btts || 0) * 100),
        over25_confidence: Math.round((probabilities.over25 || 0) * 100),
        top_scoreline: probabilities.topScoreline || null,
        expected_home_goals: probabilities.expectedHomeGoals,
        expected_away_goals: probabilities.expectedAwayGoals,
        market_probability: prediction.marketProbability,
        value: prediction.value,
        tier: 'elite',
      }

      const { data: saved } = await db
        .from('predictions')
        .upsert(record, { onConflict: 'user_id,match_id' })
        .select()
        .single()

      return NextResponse.json({
        prediction: formatPrediction(saved || record),
        cached: false,
      }, { headers: rateLimitHeaders(auth.remaining) })
    }

    // List predictions
    let query = db
      .from('predictions')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('match_date', { ascending: false })
      .limit(limit)

    if (league) {
      query = query.ilike('league', `%${league}%`)
    }

    const { data: predictions, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 })
    }

    return NextResponse.json({
      count: (predictions || []).length,
      predictions: (predictions || []).map(formatPrediction),
    }, { headers: rateLimitHeaders(auth.remaining) })

  } catch (err) {
    console.error('[API v1] Predictions error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
