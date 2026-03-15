import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { generateAccumulatorExplanation, generatePredictionExplanation, generatePrediction } from '@/lib/claude'
import { buildMatchFeatures } from '@/lib/features'
import { computeMatchProbabilities } from '@/lib/model'
import { generatePredictionFromStats } from '@/lib/prediction'
import { getTeamStatsForModel, getH2HForModel, getTeamForm, getH2H } from '@/lib/football'

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

// Derive fair odds from model probability
function toOdds(p) {
  const prob = p.probability || (p.confidence / 100)
  if (!prob || prob <= 0) return 2.00
  return Math.max(1.01, Number((1 / prob).toFixed(2)))
}

async function predictFixture(fixture, plan) {
  let recentHome = [], recentAway = [], h2h = []
  let homeFormStr = 'No data', awayFormStr = 'No data', h2hStr = 'No H2H data'

  if (fixture.home_team_id && fixture.away_team_id && fixture.league_id) {
    ;[recentHome, recentAway, h2h, homeFormStr, awayFormStr, h2hStr] = await Promise.all([
      getTeamStatsForModel(fixture.home_team_id, fixture.league_id, 10),
      getTeamStatsForModel(fixture.away_team_id, fixture.league_id, 10),
      getH2HForModel(fixture.home_team_id, fixture.away_team_id),
      getTeamForm(fixture.home_team_id, fixture.league_id, 5),
      getTeamForm(fixture.away_team_id, fixture.league_id, 5),
      getH2H(fixture.home_team_id, fixture.away_team_id),
    ])
  }

  const hasRealStats = recentHome.length >= 3
    && recentAway.length >= 3
    && recentHome.some(m => m.goalsFor > 0 || m.goalsAgainst > 0)
    && recentAway.some(m => m.goalsFor > 0 || m.goalsAgainst > 0)

  if (hasRealStats) {
    const features      = buildMatchFeatures({ recentMatchesHome: recentHome, recentMatchesAway: recentAway, headToHead: h2h, leagueAvgGoals: 2.6 })
    const probabilities = computeMatchProbabilities(features)
    const prediction    = generatePredictionFromStats(probabilities, null)
    const explanation   = await generatePredictionExplanation({
      prediction,
      features: { ...features, home_team: fixture.home_team, away_team: fixture.away_team, league: fixture.league, home_form: homeFormStr, away_form: awayFormStr, h2h: h2hStr },
      probabilities,
    })
    return {
      outcome:           prediction.outcome,
      confidence:        prediction.confidence,
      probability:       prediction.probability,
      risk:              prediction.risk,
      summary:           explanation.summary || '',
      reasons:           explanation.reasons || [],
      key_stat:          explanation.key_stat || '',
      watch_out:         explanation.watch_out || '',
      btts_confidence:   Math.round((probabilities.btts || 0) * 100),
      over25_confidence: Math.round((probabilities.over25 || 0) * 100),
    }
  } else {
    const result = await generatePrediction({
      home_team:  fixture.home_team,
      away_team:  fixture.away_team,
      league:     fixture.league,
      date:       fixture.match_time || fixture.date,
      home_form:  homeFormStr,
      away_form:  awayFormStr,
      h2h:        h2hStr,
    }, plan)
    return {
      outcome:           result.outcome,
      confidence:        result.confidence,
      probability:       result.confidence ? result.confidence / 100 : 0.5,
      risk:              result.risk,
      summary:           result.summary || '',
      reasons:           result.reasons || [],
      key_stat:          result.key_stat || '',
      watch_out:         result.watch_out || '',
      btts_confidence:   result.btts_confidence ?? null,
      over25_confidence: result.over25_confidence ?? null,
    }
  }
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

    if (!profile || !['pro', 'elite'].includes(profile.plan)) {
      return NextResponse.json({ error: 'Pro or Elite plan required', code: 'UPGRADE_REQUIRED' }, { status: 403 })
    }

    const today = new Date().toISOString().split('T')[0]

    // ── Step 1: Get today's fixtures ──────────────────────
    const { data: fixtures, error: fixturesError } = await db
      .from('fixtures_cache')
      .select('*')
      .gte('date', today)
      .order('match_time', { ascending: true })
      .limit(20)

    if (fixturesError || !fixtures || fixtures.length === 0) {
      return NextResponse.json({ error: 'No matches available today' }, { status: 400 })
    }

    // ── Step 2: Check for already saved predictions ───────
    const matchIds = fixtures.map(f => String(f.match_id))
    const { data: savedPredictions } = await db
      .from('predictions')
      .select('*')
      .in('match_id', matchIds)
      .eq('user_id', user.id)

    const predictedMap = {}
    for (const p of savedPredictions || []) {
      predictedMap[p.match_id] = p
    }

    // ── Step 3: Generate predictions for remaining fixtures ─
    const unpredicted = fixtures
      .filter(f => !predictedMap[String(f.match_id)])
      .slice(0, 10)

    for (const fixture of unpredicted) {
      try {
        const result = await predictFixture(fixture, profile.plan)

        const { data: saved } = await db
          .from('predictions')
          .upsert({
            user_id:           user.id,
            match_id:          String(fixture.match_id),
            home_team:         fixture.home_team,
            away_team:         fixture.away_team,
            league:            fixture.league,
            match_date:        fixture.match_time || new Date().toISOString(),
            outcome:           result.outcome,
            confidence:        result.confidence,
            probability:       result.probability,
            risk:              result.risk,
            summary:           result.summary,
            reasons:           result.reasons,
            key_stat:          result.key_stat,
            watch_out:         result.watch_out,
            btts_confidence:   result.btts_confidence,
            over25_confidence: result.over25_confidence,
            tier:              profile.plan,
          }, { onConflict: 'user_id,match_id' })
          .select()
          .single()

        if (saved) predictedMap[String(fixture.match_id)] = saved

      } catch (e) {
        console.error(`[Accumulator] Failed to predict ${fixture.home_team} vs ${fixture.away_team}:`, e.message)
      }
    }

    // ── Step 4: Pick top 3 by confidence, risk not High ──
    const allPredictions = Object.values(predictedMap)

    let candidates = allPredictions
      .filter(p => p.confidence >= 65 && p.risk !== 'High')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)

    // Relax filter if not enough
    if (candidates.length < 3) {
      candidates = allPredictions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
    }

    if (candidates.length < 3) {
      return NextResponse.json({ error: 'Not enough predictions available for an accumulator today' }, { status: 400 })
    }

    // ── Step 5: Claude explains the slip ─────────────────
    const selections = candidates.map(p => ({
      match:      `${p.home_team} vs ${p.away_team}`,
      league:     p.league,
      outcome:    p.outcome,
      confidence: p.confidence,
      risk:       p.risk,
    }))

    const explanation = await generateAccumulatorExplanation({ selections })

    // ── Step 6: Build response with probability-derived odds ─
    const combinedOdds = candidates.reduce((acc, p) => acc * toOdds(p), 1)
    const avgConf      = Math.round(candidates.reduce((sum, p) => sum + p.confidence, 0) / candidates.length)

    return NextResponse.json({
      accumulator: {
        title: `Today's AI Accumulator — ${new Date().toDateString()}`,
        selections: candidates.map(p => ({
          match:          `${p.home_team} vs ${p.away_team}`,
          league:         p.league,
          pick:           p.outcome,
          estimated_odds: toOdds(p).toFixed(2),
          confidence:     p.confidence,
          reasoning:      p.summary || `${p.risk} risk — model confidence ${p.confidence}%.`,
          risk:           p.risk,
        })),
        estimated_combined_odds: combinedOdds.toFixed(2),
        overall_confidence:      avgConf,
        potential_return_example: `$10 stake → $${(10 * combinedOdds).toFixed(2)} return`,
        banker:       `${candidates[0].home_team} vs ${candidates[0].away_team} — ${candidates[0].outcome}`,
        risk_warning: explanation.risk_level === 'High'
          ? '⚠️ High risk accumulator — stake responsibly'
          : 'Always gamble responsibly. Never bet more than you can afford.',
        elite_note:   explanation.reasoning || 'Statistical + AI selected picks.',
        avoid_market: null,
        summary:      explanation.summary,
        risk_level:   explanation.risk_level,
      }
    })

  } catch (err) {
    console.error('[Accumulator] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
