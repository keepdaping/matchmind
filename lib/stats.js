// lib/stats.js
// Calculates prediction performance metrics

import { getServiceClient } from '@/lib/supabase'

/**
 * Calculates prediction accuracy stats from the database.
 * @returns {Promise<Object>} Metrics object
 */
export async function calculatePredictionStats() {
  const db = getServiceClient()
  // Fetch all predictions with results
  const { data: preds } = await db
    .from('predictions')
    .select('*')
    .not('actual_outcome', 'is', null)

  if (!preds || preds.length === 0) return null

  let correct = 0, total = 0
  let homeWinCorrect = 0, homeWinTotal = 0
  let bttsCorrect = 0, bttsTotal = 0
  let over25Correct = 0, over25Total = 0
  let accTotal = 0, accHit = 0

  for (const p of preds) {
    total++
    if (p.outcome === p.actual_outcome) correct++
    if (p.outcome === 'Home Win') {
      homeWinTotal++
      if (p.actual_outcome === 'Home Win') homeWinCorrect++
    }
    if (typeof p.btts_confidence === 'number' && p.btts_confidence > 0) {
      bttsTotal++
      // Assume BTTS correct if both teams scored at least 1
      if (p.actual_home_goals > 0 && p.actual_away_goals > 0) bttsCorrect++
    }
    if (typeof p.over25_confidence === 'number' && p.over25_confidence > 0) {
      over25Total++
      if ((p.actual_home_goals + p.actual_away_goals) > 2) over25Correct++
    }
    // Accumulator hit rate: assume predictions with a group_id or similar
    if (p.accumulator_id) {
      accTotal++
      if (p.accumulator_correct) accHit++
    }
  }

  return {
    overall_accuracy: Number((correct / total).toFixed(2)),
    home_win_accuracy: homeWinTotal ? Number((homeWinCorrect / homeWinTotal).toFixed(2)) : null,
    btts_accuracy: bttsTotal ? Number((bttsCorrect / bttsTotal).toFixed(2)) : null,
    over25_accuracy: over25Total ? Number((over25Correct / over25Total).toFixed(2)) : null,
    accumulator_hit_rate: accTotal ? Number((accHit / accTotal).toFixed(2)) : null
  }
}
