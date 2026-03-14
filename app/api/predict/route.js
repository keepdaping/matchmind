import { NextResponse } from 'next/server'
import { generatePrediction } from '@/lib/claude'
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

    const { matchId, matchData } = await req.json()

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

    if (profile.token_balance <= 0) {
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

    // Generate prediction via Claude
    const prediction = await generatePrediction(matchData, profile.plan)

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
      risk: normalizeRisk(prediction.risk),
      summary: String(prediction.summary || ''),
      reasons: Array.isArray(prediction.reasons)
        ? prediction.reasons.map(r => String(r))
        : [],
      key_stat: String(prediction.key_stat || ''),
      watch_out: String(prediction.watch_out || ''),
      btts_confidence: parseInteger(prediction.btts_confidence, 0),
      over25_confidence: parseInteger(prediction.over25_confidence, 0),
    }

    // Save prediction to database
    const { data: saved, error: saveError } = await db
      .from('predictions')
      .insert(cleaned)
      .select()
      .single()

    if (saveError) {
      // Handle race condition where another request inserted the same prediction
      const isUniqueViolation = saveError?.code === '23505' || String(saveError?.message || '').includes('duplicate key value')
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

      console.error('Prediction insert error:', {
        error: saveError,
        payload: cleaned,
      })
      return NextResponse.json({ error: 'Failed to save prediction' }, { status: 500 })
    }

    // Deduct 1 token (atomic)
    const { data: newBalance, error: deductError } = await db.rpc('decrement_user_tokens', {
      _user: user.id,
      _amount: 1,
    })

    if (deductError) {
      console.warn('Token deduction failed', { error: deductError })
      return NextResponse.json({
        error: 'Unable to deduct token. Please try again.',
        code: 'TOKEN_DEDUCTION_FAILED'
      }, { status: 500 })
    }

    // Log token transaction
    await db.from('token_transactions').insert({
      user_id: user.id,
      amount: -1,
      type: 'prediction_unlock',
      reference: `match_${matchId}`
    })

    return NextResponse.json({ prediction: saved, cached: false })

  } catch (err) {
    console.error('Prediction API error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
