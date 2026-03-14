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

export async function POST(req) {
  try {
    const { matchId, matchData, userId } = await req.json()

    if (!userId || !matchData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = getServiceClient()

    // Check user token balance
    const { data: user, error: userError } = await db
      .from('users')
      .select('token_balance, plan')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.token_balance <= 0) {
      return NextResponse.json({
        error: 'No predictions remaining',
        code: 'NO_TOKENS',
        message: 'You have used all your predictions. Upgrade to Pro or buy a token pack.'
      }, { status: 402 })
    }

    // Check if prediction already exists for this match
    const { data: existing } = await db
      .from('predictions')
      .select('*')
      .eq('match_id', String(matchId))
      .single()

    if (existing) {
      // Return cached prediction — no token deduction
      return NextResponse.json({ prediction: existing, cached: true })
    }

    // Generate prediction via Claude
    const prediction = await generatePrediction(matchData, user.plan)

    // Sanitize and validate values before inserting
    const cleaned = {
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
      console.error('Prediction insert error:', {
        error: saveError,
        payload: cleaned,
      })
      return NextResponse.json({ error: 'Failed to save prediction' }, { status: 500 })
    }

    // Deduct 1 token
    await db.from('users').update({
      token_balance: user.token_balance - 1
    }).eq('id', userId)

    // Log token transaction
    await db.from('token_transactions').insert({
      user_id: userId,
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
