import { NextResponse } from 'next/server'
import { generatePrediction } from '@/lib/claude'
import { getServiceClient } from '@/lib/supabase'

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
      .eq('match_id', matchId)
      .single()

    if (existing) {
      // Return cached prediction — no token deduction
      return NextResponse.json({ prediction: existing, cached: true })
    }

    // Generate prediction via Claude
    const prediction = await generatePrediction(matchData)

    // Save prediction to database
    const { data: saved, error: saveError } = await db
      .from('predictions')
      .insert({
        match_id: matchId,
        home_team: matchData.home_team,
        away_team: matchData.away_team,
        league: matchData.league,
        match_date: matchData.date,
        outcome: prediction.outcome,
        confidence: prediction.confidence,
        risk: prediction.risk,
        summary: prediction.summary,
        reasons: prediction.reasons,
        key_stat: prediction.key_stat,
        watch_out: prediction.watch_out,
        btts_confidence: prediction.btts_confidence,
        over25_confidence: prediction.over25_confidence,
      })
      .select()
      .single()

    if (saveError) {
      console.error('Save error:', saveError)
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
