// app/api/results/update/route.js
// Updates match results and prediction outcomes
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export async function POST(req) {
  try {
    const db = getServiceClient()
    // 1. Fetch finished matches from API-Football (pseudo-code, replace with real fetch)
    const finishedMatches = [] // TODO: fetch from API-Football

    // 2. Update fixtures_cache and predictions
    for (const match of finishedMatches) {
      // Update fixtures_cache
      await db.from('fixtures_cache')
        .update({
          actual_home_goals: match.home_goals,
          actual_away_goals: match.away_goals
        })
        .eq('match_id', match.match_id)

      // Update predictions
      const actualOutcome =
        match.home_goals > match.away_goals ? 'Home Win' :
        match.home_goals < match.away_goals ? 'Away Win' : 'Draw'

      await db.from('predictions')
        .update({
          actual_home_goals: match.home_goals,
          actual_away_goals: match.away_goals,
          actual_outcome: actualOutcome,
          prediction_correct: db.raw('outcome = ?', [actualOutcome])
        })
        .eq('match_id', match.match_id)
    }

    return NextResponse.json({ updated: finishedMatches.length })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
