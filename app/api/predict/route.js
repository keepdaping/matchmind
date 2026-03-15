import { NextResponse } from 'next/server'
import { generatePredictionExplanation, generatePrediction } from '@/lib/claude'
import { buildMatchFeatures } from '@/lib/features'
import { computeMatchProbabilities } from '@/lib/model'
import { generatePredictionFromStats } from '@/lib/prediction'
import { getTeamStatsForModel, getH2HForModel, getTeamForm, getH2H } from '@/lib/football'
import { getServiceClient } from '@/lib/supabase'

function normalizeRisk(value) {
  if (typeof value !== 'string') return 'Medium'
  const v = value.trim().toLowerCase()
  if (v === 'low') return 'Low'
  if (v === 'high') return 'High'
  return 'Medium'
}

function normalizeDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
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

export async function POST(req) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { matchId, matchData, odds } = await req.json()
    if (!matchId || !matchData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = getServiceClient()

    const { data: profile, error: profileError } = await db
      .from('users')
      .select('token_balance, plan')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isElite = profile.plan === 'elite'
    const isPro   = profile.plan === 'pro'

    if (!isElite && !isPro && profile.token_balance <= 0) {
      return NextResponse.json({
        error: 'No predictions remaining',
        code: 'NO_TOKENS',
        message: 'You have used all your predictions. Upgrade to Pro or buy a token pack.'
      }, { status: 402 })
    }

    // ── Check cache first ─────────────────────────────────
    const { data: existing } = await db
      .from('predictions')
      .select('*')
      .eq('user_id', user.id)
      .eq('match_id', String(matchId))
      .single()

    if (existing) {
      return NextResponse.json({ prediction: existing, cached: true })
    }

    // ── Look up fixture for team IDs ──────────────────────
    const { data: fixture } = await db
      .from('fixtures_cache')
      .select('home_team_id, away_team_id, league_id, venue')
      .eq('match_id', String(matchId))
      .single()

    const homeTeamId = fixture?.home_team_id
    const awayTeamId = fixture?.away_team_id
    const leagueId   = fixture?.league_id

    // ── Fetch real stats if team IDs available ────────────
    let recentMatchesHome = []
    let recentMatchesAway = []
    let headToHead        = []
    let homeFormStr       = 'No data'
    let awayFormStr       = 'No data'
    let h2hStr            = 'No H2H data'

    if (homeTeamId && awayTeamId && leagueId) {
      console.log(`[Predict] Fetching stats for ${matchData.home_team} vs ${matchData.away_team}`)
      ;[recentMatchesHome, recentMatchesAway, headToHead, homeFormStr, awayFormStr, h2hStr] =
        await Promise.all([
          getTeamStatsForModel(homeTeamId, leagueId, 10),
          getTeamStatsForModel(awayTeamId, leagueId, 10),
          getH2HForModel(homeTeamId, awayTeamId),
          getTeamForm(homeTeamId, leagueId, 5),
          getTeamForm(awayTeamId, leagueId, 5),
          getH2H(homeTeamId, awayTeamId),
        ])
    } else {
      console.warn(`[Predict] No team IDs for match ${matchId} — will use Claude`)
    }

    // ── Hybrid decision: Poisson model OR Claude ──────────
    // Use Poisson only when we have enough real goal data.
    // If teams scored/conceded 0 in all matches, the model breaks.
    const hasRealStats = recentMatchesHome.length >= 3
      && recentMatchesAway.length >= 3
      && recentMatchesHome.some(m => m.goalsFor > 0 || m.goalsAgainst > 0)
      && recentMatchesAway.some(m => m.goalsFor > 0 || m.goalsAgainst > 0)

    let outcome, confidence, probability, risk, marketProbability, value,
        summary, reasons, key_stat, watch_out, btts_confidence, over25_confidence

    if (hasRealStats) {
      // ── DATA-DRIVEN: Poisson model → Claude explains ────
      console.log(`[Predict] Using Poisson model for ${matchData.home_team} vs ${matchData.away_team}`)

      const features      = buildMatchFeatures({ recentMatchesHome, recentMatchesAway, headToHead, leagueAvgGoals: 2.6 })
      const probabilities = computeMatchProbabilities(features)
      const prediction    = generatePredictionFromStats(probabilities, odds || null)
      const explanation   = await generatePredictionExplanation({
        prediction,
        features: {
          ...features,
          home_team:  matchData.home_team,
          away_team:  matchData.away_team,
          league:     matchData.league,
          home_form:  homeFormStr,
          away_form:  awayFormStr,
          h2h:        h2hStr,
          venue:      fixture?.venue || 'Home ground',
        },
        probabilities,
      })

      outcome           = prediction.outcome
      confidence        = prediction.confidence
      probability       = prediction.probability
      risk              = prediction.risk
      marketProbability = prediction.marketProbability ?? null
      value             = prediction.value ?? null
      summary           = explanation.summary || ''
      reasons           = explanation.reasons || []
      key_stat          = explanation.key_stat || ''
      watch_out         = explanation.watch_out || ''
      btts_confidence   = Math.round((probabilities.btts || 0) * 100)
      over25_confidence = Math.round((probabilities.over25 || 0) * 100)

    } else {
      // ── FALLBACK: Claude generates full prediction ──────
      console.log(`[Predict] No real stats — using Claude for ${matchData.home_team} vs ${matchData.away_team}`)

      const plan   = isElite ? 'elite' : isPro ? 'pro' : 'free'
      const result = await generatePrediction({
        ...matchData,
        home_form: homeFormStr,
        away_form: awayFormStr,
        h2h:       h2hStr,
        venue:     fixture?.venue || 'Home ground',
      }, plan)

      outcome           = result.outcome
      confidence        = result.confidence
      probability       = result.confidence ? result.confidence / 100 : null
      risk              = result.risk
      marketProbability = null
      value             = null
      summary           = result.summary || ''
      reasons           = result.reasons || []
      key_stat          = result.key_stat || ''
      watch_out         = result.watch_out || ''
      btts_confidence   = result.btts_confidence ?? null
      over25_confidence = result.over25_confidence ?? null
    }

    // ── Sanitize for DB ───────────────────────────────────
    const cleaned = {
      user_id:            user.id,
      match_id:           String(matchId),
      home_team:          String(matchData.home_team || ''),
      away_team:          String(matchData.away_team || ''),
      league:             String(matchData.league || ''),
      match_date:         normalizeDate(matchData.date) || new Date().toISOString(),
      outcome:            String(outcome || ''),
      confidence:         Number.isFinite(confidence) ? Math.round(confidence) : 0,
      probability:        probability ?? null,
      risk:               normalizeRisk(risk),
      market_probability: marketProbability ?? null,
      value:              value ?? null,
      summary:            String(summary || ''),
      reasons:            Array.isArray(reasons) ? reasons.map(r => String(r)) : [],
      key_stat:           String(key_stat || ''),
      watch_out:          String(watch_out || ''),
      btts_confidence:    btts_confidence ?? null,
      over25_confidence:  over25_confidence ?? null,
      tier:               isElite ? 'elite' : isPro ? 'pro' : 'free',
    }

    // ── Deduct token (atomic) ─────────────────────────────
    if (!isElite && !isPro) {
      const { error: deductError } = await db.rpc('decrement_user_tokens', {
        _user: user.id, _amount: 1,
      })
      if (deductError) {
        const isInsufficient = String(deductError?.message || '').toLowerCase().includes('insufficient')
        return NextResponse.json({
          error: isInsufficient ? 'No predictions remaining' : 'Unable to deduct token.',
          code: isInsufficient ? 'NO_TOKENS' : 'TOKEN_DEDUCTION_FAILED',
        }, { status: isInsufficient ? 402 : 500 })
      }
    }

    // ── Save prediction ───────────────────────────────────
    const { data: saved, error: saveError } = await db
      .from('predictions')
      .insert(cleaned)
      .select()
      .single()

    if (saveError) {
      console.error('[Predict] Insert failed', saveError)

      if (!isElite && !isPro) {
        await db.rpc('decrement_user_tokens', { _user: user.id, _amount: -1 }).catch(() => {})
      }

      const isUniqueViolation = saveError?.code === '23505' ||
        String(saveError?.message || '').toLowerCase().includes('duplicate key')

      if (isUniqueViolation) {
        const { data: existingAfterRace } = await db
          .from('predictions')
          .select('*')
          .eq('user_id', user.id)
          .eq('match_id', String(matchId))
          .single()
        if (existingAfterRace) {
          return NextResponse.json({ prediction: existingAfterRace, cached: true })
        }
      }

      return NextResponse.json({ error: saveError?.message || 'Failed to save prediction' }, { status: 500 })
    }

    if (!isElite && !isPro) {
      await db.from('token_transactions').insert({
        user_id:   user.id,
        amount:    -1,
        type:      'prediction_unlock',
        reference: `match_${matchId}`,
      })
    }

    return NextResponse.json({ prediction: saved, cached: false })

  } catch (err) {
    console.error('[Predict] Unhandled error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
