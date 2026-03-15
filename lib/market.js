// lib/market.js
// Market utility functions for value detection

/**
 * Convert bookmaker odds to implied probability
 * @param {number} odds - Decimal odds (e.g. 2.20)
 * @returns {number} Probability (0-1, 4 decimals)
 */
function oddsToProbability(odds) {
  if (!odds || odds <= 1) return 0;
  return Number((1 / odds).toFixed(4));
}

/**
 * Calculate value (model vs market probability)
 * @param {number} modelProbability - Model probability (0-1)
 * @param {number} bookmakerOdds - Decimal odds
 * @returns {object} { modelProbability, marketProbability, value }
 */
function calculateValue(modelProbability, bookmakerOdds) {
  const marketProbability = oddsToProbability(bookmakerOdds);
  const value = Number((modelProbability - marketProbability).toFixed(4));
  return {
    modelProbability: Number(modelProbability.toFixed(4)),
    marketProbability,
    value
  };
}

module.exports = { oddsToProbability, calculateValue };
