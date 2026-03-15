// app/api/analytics/performance/route.js
// Exposes model performance analytics for dashboard
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { calculatePredictionStats } from '@/lib/stats'

export async function GET() {
  try {
    const db = getServiceClient()
    // Fetch all predictions with results
    const { data: preds } = await db
      .from('predictions')
      .select('*')
      .not('actual_outcome', 'is', null)

    if (!preds || preds.length === 0) {
      return NextResponse.json({
        overall_accuracy: null,
        home_win_accuracy: null,
        btts_accuracy: null,
        over25_accuracy: null,
        accumulator_hit_rate: null,
        total_predictions: 0,
        correct_predictions: 0,
        last_30_day_accuracy: null,
        best_league_accuracy: null,
        best_market_accuracy: null,
        current_prediction_streak: 0,
        longest_prediction_streak: 0
      })
    }

    // Calculate main stats
    const stats = await calculatePredictionStats()
    const total_predictions = preds.length
    const correct_predictions = preds.filter(p => p.prediction_correct).length

    // Last 30 day accuracy
    const now = new Date()
    const last30 = preds.filter(p => {
      const d = new Date(p.match_date)
      return (now - d) / (1000 * 60 * 60 * 24) <= 30
    })
    const last_30_day_accuracy = last30.length ? Number((last30.filter(p => p.prediction_correct).length / last30.length).toFixed(2)) : null

    // Best league accuracy
    const leagueMap = {}
    for (const p of preds) {
      if (!leagueMap[p.league]) leagueMap[p.league] = { total: 0, correct: 0 }
      leagueMap[p.league].total++
      if (p.prediction_correct) leagueMap[p.league].correct++
    }
    let best_league = null, best_league_acc = 0
    for (const [league, v] of Object.entries(leagueMap)) {
      const acc = v.total ? v.correct / v.total : 0
      if (acc > best_league_acc && v.total > 10) { // Only consider leagues with >10 preds
        best_league = league
        best_league_acc = acc
      }
    }

    // Best market accuracy
    const marketMap = { 'Home Win': { total: 0, correct: 0 }, 'Draw': { total: 0, correct: 0 }, 'Away Win': { total: 0, correct: 0 }, 'BTTS': { total: 0, correct: 0 }, 'Over 2.5': { total: 0, correct: 0 } }
    for (const p of preds) {
      if (marketMap[p.outcome]) {
        marketMap[p.outcome].total++
        if (p.prediction_correct) marketMap[p.outcome].correct++
      }
      if (typeof p.btts_confidence === 'number' && p.btts_confidence > 0) {
        marketMap['BTTS'].total++
        if (p.actual_home_goals > 0 && p.actual_away_goals > 0) marketMap['BTTS'].correct++
      }
      if (typeof p.over25_confidence === 'number' && p.over25_confidence > 0) {
        marketMap['Over 2.5'].total++
        if ((p.actual_home_goals + p.actual_away_goals) > 2) marketMap['Over 2.5'].correct++
      }
    }
    let best_market = null, best_market_acc = 0
    for (const [market, v] of Object.entries(marketMap)) {
      const acc = v.total ? v.correct / v.total : 0
      if (acc > best_market_acc && v.total > 10) {
        best_market = market
        best_market_acc = acc
      }
    }

    // Current and longest prediction streaks
    let currentStreak = 0, longestStreak = 0
    for (let i = 0; i < preds.length; i++) {
      if (preds[i].prediction_correct) {
        currentStreak++
        if (currentStreak > longestStreak) longestStreak = currentStreak
      } else {
        currentStreak = 0
      }
    }

    return NextResponse.json({
      ...stats,
      total_predictions,
      correct_predictions,
      last_30_day_accuracy,
      best_league_accuracy: best_league ? { league: best_league, accuracy: Number(best_league_acc.toFixed(2)) } : null,
      best_market_accuracy: best_market ? { market: best_market, accuracy: Number(best_market_acc.toFixed(2)) } : null,
      current_prediction_streak: currentStreak,
      longest_prediction_streak: longestStreak
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
