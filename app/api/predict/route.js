import { NextResponse } from 'next/server'
import { generatePredictionExplanation } from '@/lib/claude'
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

    // Get user profile
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

    const homeTeamId  = fixture?.home_team_id
    const awayTeamId  = fixture?.away_team_id
    const leagueId    = fixture?.league_id

    // ── Fetch real stats if team IDs available ────────────
    let recentMatchesHome = []
    let recentMatchesAway = []
    let headToHead = []
    let homeFormStr = 'No data'
    let awayFormStr = 'No data'
    let h2hStr = 'No H2H data'

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
      console.warn(`[Predict] No team IDs for match ${matchId} — using defaults`)
    }

    // ── Build features → probabilities → prediction ───────
    const features = buildMatchFeatures({
      recentMatchesHome,
      recentMatchesAway,
      headToHead,
      leagueAvgGoals: 2.6,
    })

    const probabilities = computeMatchProbabilities(features)
    const prediction    = generatePredictionFromStats(probabilities, odds || null)

    // ── Claude explains the statistical result ────────────
    const explanation = await generatePredictionExplanation({
      prediction,
      features: {
        ...features,
        home_team: matchData.home_team,
        away_team: matchData.away_team,
        league: matchData.league,
        home_form: homeFormStr,
        away_form: awayFormStr,
        h2h: h2hStr,
        venue: fixture?.venue || 'Home ground',
      },
      probabilities,
    })

    // ── Sanitize for DB ───────────────────────────────────
    const cleaned = {
      user_id:            user.id,
      match_id:           String(matchId),
      home_team:          String(matchData.home_team || ''),
      away_team:          String(matchData.away_team || ''),
      league:             String(matchData.league || ''),
      match_date:         normalizeDate(matchData.date) || new Date().toISOString(),
      outcome:            String(prediction.outcome || ''),
      confidence:         Number.isFinite(prediction.confidence) ? Math.round(prediction.confidence) : 0,
      probability:        prediction.probability ?? null,
      risk:               normalizeRisk(prediction.risk),
      market_probability: prediction.marketProbability ?? null,
      value:              prediction.value ?? null,
      summary:            String(explanation.summary || ''),
      reasons:            Array.isArray(explanation.reasons) ? explanation.reasons.map(r => String(r)) : [],
      key_stat:           String(explanation.key_stat || ''),
      watch_out:          String(explanation.watch_out || ''),
      btts_confidence:    Math.round((probabilities.btts || 0) * 100),
      over25_confidence:  Math.round((probabilities.over25 || 0) * 100),
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

      // Refund token on failure
      if (!isElite && !isPro) {
        await db.rpc('decrement_user_tokens', { _user: user.id, _amount: -1 }).catch(() => {})
      }

      // Race condition — another request saved same prediction
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

    // ── Log token transaction ─────────────────────────────
    if (!isElite && !isPro) {
      await db.from('token_transactions').insert({
        user_id: user.id,
        amount: -1,
        type: 'prediction_unlock',
        reference: `match_${matchId}`,
      })
    }

    return NextResponse.json({ prediction: saved, cached: false })

  } catch (err) {
    console.error('[Predict] Unhandled error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
