// lib/prediction.js
// Prediction Engine for MatchMind
// Converts model probabilities into a standardized prediction object

/**
 * Determines the most probable outcome and generates prediction object.
 * @param {Object} probabilities - Output from computeMatchProbabilities()
 * @returns {Object} { outcome, probability, confidence, risk }
 */
function generatePredictionFromStats(probabilities) {
  // Map model keys to human-readable outcomes
  const outcomeMap = [
    { key: 'homeWin', label: 'Home Win' },
    { key: 'draw', label: 'Draw' },
    { key: 'awayWin', label: 'Away Win' }
  ];

  // Find the highest probability outcome
  let best = outcomeMap[0];
  for (const o of outcomeMap) {
    if (probabilities[o.key] > probabilities[best.key]) {
      best = o;
    }
  }
  const probability = probabilities[best.key];
  const confidence = Math.round(probability * 100);

  // Risk classification
  let risk = 'High';
  if (confidence >= 70) risk = 'Low';
  else if (confidence >= 55) risk = 'Medium';

  return {
    outcome: best.label,
    probability: Number(probability.toFixed(2)),
    confidence,
    risk
  };
}

module.exports = { generatePredictionFromStats };