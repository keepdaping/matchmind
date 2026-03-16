// lib/prediction.js
// Prediction Engine for MatchMind
// Converts model probabilities into a standardized prediction object

/**
 * Converts bookmaker decimal odds to implied probability.
 * @param {number} odds - Decimal odds (e.g. 2.20)
 * @returns {number} Implied probability (0-1)
 */
export function calculateMarketProbability(odds) {
  if (!odds || odds <= 1) return 0
  return Number((1 / odds).toFixed(4))
}

/**
 * Determines the most probable outcome and generates prediction object.
 * @param {Object} probabilities - Output from computeMatchProbabilities()
 * @param {Object|null} odds - { homeWin, draw, awayWin } decimal odds
 * @returns {Object} { outcome, probability, confidence, risk, marketProbability, value }
 */
export function generatePredictionFromStats(probabilities, odds) {
  const outcomeMap = [
    { key: 'homeWin', label: 'Home Win' },
    { key: 'draw',    label: 'Draw'     },
    { key: 'awayWin', label: 'Away Win' },
  ]

  // Find highest probability outcome
  let best = outcomeMap[0]
  for (const o of outcomeMap) {
    if (probabilities[o.key] > probabilities[best.key]) {
      best = o
    }
  }

  const probability = probabilities[best.key]
  const confidence  = Math.round(probability * 100)

  // Market comparison
  let marketProbability = null
  let value = null
  if (odds && odds[best.key]) {
    marketProbability = calculateMarketProbability(odds[best.key])
    value = Number((probability - marketProbability).toFixed(4))
  }

  // Risk classification
  let risk = 'High'
  if (confidence >= 70) risk = 'Low'
  else if (confidence >= 55) risk = 'Medium'

  return {
    outcome:           best.label,
    probability:       Number(probability.toFixed(4)),
    confidence,
    risk,
    marketProbability,
    value,
  }
}
