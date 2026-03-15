import { NextResponse } from 'next/server'
import { generatePredictionExplanation } from '@/lib/claude'
import { buildMatchFeatures } from '@/lib/features'
import { computeMatchProbabilities } from '@/lib/model'
import { generatePredictionFromStats } from '@/lib/prediction'
import { getServiceClient } from '@/lib/supabase'

function normalizeRisk(value) {
  if (typeof value !== 'string') return 'Medium'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'low') return 'Low'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'high') return 'High'
  return 'Medium'
}

function parseInteger(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string') {
    const num = parseInt(value.replace(/[^0-9-]/g, ''), 10)
    if (!Number.isNaN(num)) return num
  }
  return fallback
}

function normalizeDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { matchId, matchData, odds } = await req.json()

    if (!matchId || !matchData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = getServiceClient()

    // Check user token balance
    const { data: profile, error: profileError } = await db
      .from('users')
      .select('token_balance, plan')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isElite = profile.plan === 'elite'

    // Elite users have unlimited predictions and should never consume tokens.
    if (!isElite && profile.token_balance <= 0) {
      return NextResponse.json({
        error: 'No predictions remaining',
        code: 'NO_TOKENS',
        message: 'You have used all your predictions. Upgrade to Pro or buy a token pack.'
      }, { status: 402 })
    }

    // Check if prediction already exists for this match for this user
    const { data: existing } = await db
      .from('predictions')
      .select('*')
      .eq('user_id', user.id)
      .eq('match_id', String(matchId))
      .single()

    if (existing) {
      // Return cached prediction — no token deduction
      return NextResponse.json({ prediction: existing, cached: true })
    }

    // --- New Statistical Prediction Pipeline ---
    // 1. Build features from match stats
    const features = buildMatchFeatures(matchData)
    // 2. Compute probabilities
    const probabilities = computeMatchProbabilities(features)
    // 3. Generate prediction (with value detection)
    const prediction = generatePredictionFromStats(probabilities, odds)
    // 4. Ask Claude for explanation only
    const explanation = await generatePredictionExplanation({ prediction, features, probabilities })

    // Sanitize and validate values before inserting
    const cleaned = {
      user_id: user.id,
      match_id: String(matchId),
      home_team: String(matchData.home_team || ''),
      away_team: String(matchData.away_team || ''),
      league: String(matchData.league || ''),
      match_date: normalizeDate(matchData.date) || new Date().toISOString(),
      outcome: String(prediction.outcome || ''),
      confidence: parseInteger(prediction.confidence, 0),
      probability: prediction.probability,
      risk: normalizeRisk(prediction.risk),
      market_probability: prediction.marketProbability,
      value: prediction.value,
      summary: String(explanation.summary || ''),
      reasons: Array.isArray(explanation.reasons)
        ? explanation.reasons.map(r => String(r))
        : [],
      key_stat: String(explanation.key_stat || ''),
      watch_out: String(explanation.watch_out || ''),
    }

    // Deduct 1 token (atomic) — this prevents token race conditions.
    // If deduction fails, we do not want to create a prediction for free.
    if (!isElite) {
      const { error: deductError } = await db.rpc('decrement_user_tokens', {
        _user: user.id,
        _amount: 1,
      })

      if (deductError) {
        const isInsufficient = String(deductError?.message || '').toLowerCase().includes('insufficient')
        console.error('[Predict] Token deduction failed', {
          userId: user.id,
          matchId,
          error: deductError,
          isInsufficient,
        })

        return NextResponse.json(
          {
            error: isInsufficient ? 'No predictions remaining' : 'Unable to deduct token. Please try again.',
            code: isInsufficient ? 'NO_TOKENS' : 'TOKEN_DEDUCTION_FAILED',
            details: deductError?.message,
            deductError: {
              message: deductError?.message,
              code: deductError?.code,
              details: deductError?.details,
              hint: deductError?.hint,
            },
          },
          { status: isInsufficient ? 402 : 500 }
        )
      }
    }

    // Save prediction to database
    const { data: saved, error: saveError } = await db
      .from('predictions')
      .insert(cleaned)
      .select()
      .single()

    if (saveError) {
      // Anything that fails here should refund the token.
      console.error('[Predict] Prediction insert failed (after token deduction)', {
        userId: user.id,
        matchId,
        cleaned,
        dbError: saveError,
      })

      if (!isElite) {
        // Attempt to refund the token.
        try {
          await db.rpc('decrement_user_tokens', {
            _user: user.id,
            _amount: -1,
          })
        } catch (refundError) {
          console.error('[Predict] Failed to refund token after insert failure', {
            userId: user.id,
            matchId,
            refundError,
          })
        }
      }

      // Handle race condition where another request inserted the same prediction.
      // If we hit a unique constraint, the prediction may already exist.
      const isUniqueViolation =
        saveError?.code === '23505' ||
        String(saveError?.message || '').toLowerCase().includes('duplicate key')

      if (isUniqueViolation) {
        const { data: existingAfterRace, error: existingError } = await db
          .from('predictions')
          .select('*')
          .eq('user_id', user.id)
          .eq('match_id', String(matchId))
          .single()

        if (existingError) {
          console.error('[Predict] Failed to fetch prediction after unique violation', {
            error: existingError,
            userId: user.id,
            matchId,
          })
        }

        if (existingAfterRace) {
          return NextResponse.json({ prediction: existingAfterRace, cached: true })
        }

        // If we get here, the unique constraint violation happened but the row isn't for this user.
        // That indicates the database has a unique constraint on match_id (global) rather than (user_id, match_id).
        if (String(saveError?.message || '').includes('predictions_match_id_key')) {
          console.error('[Predict] Unexpected global unique constraint on predictions.match_id', {
            userId: user.id,
            matchId,
            dbError: saveError,
            note: 'The DB should instead enforce uniqueness on (user_id, match_id).',
          })

          return NextResponse.json(
            {
              error: 'Database schema mismatch: predictions must be unique per user.',
              code: 'INVALID_PREDICTIONS_CONSTRAINT',
              details:
                'There is a global unique constraint on predictions.match_id; it should be on (user_id, match_id).',
            },
            { status: 500 }
          )
        }
      }

      const safeMessage = saveError?.message || 'Failed to save prediction'
      return NextResponse.json(
        {
          error: safeMessage,
          code: saveError?.code || 'PREDICT_SAVE_FAILED',
          details: saveError?.details,
          hint: saveError?.hint,
        },
        { status: 500 }
      )
    }

    if (!isElite) {
      // Log token transaction
      await db.from('token_transactions').insert({
        user_id: user.id,
        amount: -1,
        type: 'prediction_unlock',
        reference: `match_${matchId}`
      })
    }

    // Return new response format
    return NextResponse.json({
      outcome: cleaned.outcome,
      confidence: cleaned.confidence,
      probability: cleaned.probability,
      risk: cleaned.risk,
      marketProbability: cleaned.market_probability,
      value: cleaned.value,
      summary: cleaned.summary,
      reasons: cleaned.reasons,
      key_stat: cleaned.key_stat,
      watch_out: cleaned.watch_out,
      cached: false
    })

  } catch (err) {
    console.error('Prediction API error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
