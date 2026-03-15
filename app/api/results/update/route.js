// app/api/results/update/route.js
// Updates match results and prediction outcomes
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export async function POST(req) {
  try {
    const db = getServiceClient()

    // TODO: Replace with real API-Football fetch
    // Example: fetch finished matches for today
    // const finishedMatches = await getFinishedMatches()
    const finishedMatches = []

    if (finishedMatches.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No finished matches to update' })
    }

    let updated = 0

    for (const match of finishedMatches) {
      const actualOutcome =
        match.home_goals > match.away_goals ? 'Home Win' :
        match.home_goals < match.away_goals ? 'Away Win' : 'Draw'

      // Fetch all predictions for this match
      const { data: predictions } = await db
        .from('predictions')
        .select('id, outcome')
        .eq('match_id', String(match.match_id))

      for (const pred of predictions || []) {
        await db.from('predictions')
          .update({
            actual_home_goals:  match.home_goals,
            actual_away_goals:  match.away_goals,
            actual_outcome:     actualOutcome,
            prediction_correct: pred.outcome === actualOutcome,
          })
          .eq('id', pred.id)
      }

      updated++
    }

    return NextResponse.json({ updated })

  } catch (err) {
    console.error('[Results] Update error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
