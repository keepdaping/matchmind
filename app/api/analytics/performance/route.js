// app/api/analytics/performance/route.js
// Exposes model performance analytics for dashboard
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'


export async function GET() {
  try {
    const db = getServiceClient()
    // Optimized: fetch only required columns
    const { data: preds } = await db
      .from('predictions')
      .select(`
        prediction_correct,
        match_date,
        league,
        outcome,
        btts_confidence,
        over25_confidence,
        actual_home_goals,
        actual_away_goals,
        odds
      `)
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
        longest_prediction_streak: 0,
        roi: null,
        total_units_won: null
      })
    }

    // Sort predictions by match_date for streaks
    preds.sort((a, b) => new Date(a.match_date) - new Date(b.match_date))

    // Main stats
    const total_predictions = preds.length
    const correct_predictions = preds.filter(p => p.prediction_correct).length
    const overall_accuracy = Number((correct_predictions / total_predictions).toFixed(2))

    // Home win accuracy
    const homeWin = preds.filter(p => p.outcome === 'Home Win')
    const home_win_accuracy = homeWin.length ? Number((homeWin.filter(p => p.prediction_correct).length / homeWin.length).toFixed(2)) : null

    // BTTS accuracy
    const btts = preds.filter(p => typeof p.btts_confidence === 'number' && p.btts_confidence > 0)
    const btts_accuracy = btts.length ? Number((btts.filter(p => (p.actual_home_goals > 0 && p.actual_away_goals > 0)).length / btts.length).toFixed(2)) : null

    // Over 2.5 accuracy
    const over25 = preds.filter(p => typeof p.over25_confidence === 'number' && p.over25_confidence > 0)
    const over25_accuracy = over25.length ? Number((over25.filter(p => ((p.actual_home_goals + p.actual_away_goals) > 2)).length / over25.length).toFixed(2)) : null

    // Accumulator hit rate (if accumulator_id/accumulator_correct fields exist, else null)
    let accumulator_hit_rate = null
    // (Add logic if accumulator tracking is implemented)

    // Last 30 day accuracy
    const now = new Date()
    const last30 = preds.filter(p => {
      const d = new Date(p.match_date)
      return (now - d) / (1000 * 60 * 60 * 24) <= 30
    })
    const correct_last30 = last30.filter(p => p.prediction_correct).length
    const total_last30 = last30.length
    const last_30_day_accuracy = total_last30 ? Number((correct_last30 / total_last30).toFixed(2)) : null

    // Best league accuracy (ignore leagues with <10 preds)
    const leagueMap = {}
    for (const p of preds) {
      if (!leagueMap[p.league]) leagueMap[p.league] = { total: 0, correct: 0 }
      leagueMap[p.league].total++
      if (p.prediction_correct) leagueMap[p.league].correct++
    }
    let best_league = null, best_league_acc = 0
    for (const [league, v] of Object.entries(leagueMap)) {
      if (v.total < 10) continue
      const acc = v.correct / v.total
      if (acc > best_league_acc) {
        best_league = league
        best_league_acc = acc
      }
    }
    const best_league_accuracy = best_league ? { league: best_league, accuracy: Number(best_league_acc.toFixed(2)) } : null

    // Best market accuracy (ignore <10 samples)
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
      if (v.total < 10) continue
      const acc = v.correct / v.total
      if (acc > best_market_acc) {
        best_market = market
        best_market_acc = acc
      }
    }
    const best_market_accuracy = best_market ? { market: best_market, accuracy: Number(best_market_acc.toFixed(2)) } : null

    // Streak tracking (after sorting)
    let currentStreak = 0, longestStreak = 0, tempStreak = 0
    for (let i = 0; i < preds.length; i++) {
      if (preds[i].prediction_correct) {
        tempStreak++
        if (tempStreak > longestStreak) longestStreak = tempStreak
      } else {
        tempStreak = 0
      }
    }
    // Current streak is streak at end of array
    currentStreak = tempStreak

    // ROI calculation (assume 1 unit stake per prediction, odds field present)
    let total_units_won = 0
    for (const p of preds) {
      const odds = typeof p.odds === 'number' ? p.odds : (typeof p.odds === 'string' ? parseFloat(p.odds) : null)
      if (p.prediction_correct && odds && odds > 1) {
        total_units_won += (odds - 1)
      } else {
        total_units_won -= 1
      }
    }
    const roi = total_predictions ? Number((total_units_won / total_predictions).toFixed(2)) : null

    return NextResponse.json({
      overall_accuracy,
      home_win_accuracy,
      btts_accuracy,
      over25_accuracy,
      accumulator_hit_rate,
      total_predictions,
      correct_predictions,
      last_30_day_accuracy,
      best_league_accuracy,
      best_market_accuracy,
      current_prediction_streak: currentStreak,
      longest_prediction_streak: longestStreak,
      roi,
      total_units_won
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
