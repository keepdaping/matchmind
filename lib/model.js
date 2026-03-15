// lib/model.js
// Poisson-based football prediction model for MatchMind

/**
 * Calculate expected goals for both teams using statistical features.
 * @param {Object} features - Output from buildMatchFeatures()
 * @returns {Object} { expectedHomeGoals, expectedAwayGoals }
 */
function calculateExpectedGoals(features) {
  const expectedHomeGoals = features.homeAttack * features.awayDefense * features.leagueAvgGoals;
  const expectedAwayGoals = features.awayAttack * features.homeDefense * features.leagueAvgGoals;
  return {
    expectedHomeGoals: Number(expectedHomeGoals.toFixed(2)),
    expectedAwayGoals: Number(expectedAwayGoals.toFixed(2))
  };
}

/**
 * Poisson probability mass function
 * @param {number} k - Number of goals
 * @param {number} lambda - Expected goals
 * @returns {number} Probability of scoring k goals
 */
function poissonProbability(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function factorial(n) {
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

/**
 * Simulate all scorelines (0-5 goals per team) and aggregate probabilities.
 * @param {number} expectedHomeGoals
 * @param {number} expectedAwayGoals
 * @returns {Object} { homeWin, draw, awayWin, btts, over25 }
 */
function runPoissonSimulation(expectedHomeGoals, expectedAwayGoals) {
  const maxGoals = 5;
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0, over25 = 0;
  let total = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const pHome = poissonProbability(h, expectedHomeGoals);
    for (let a = 0; a <= maxGoals; a++) {
      const pAway = poissonProbability(a, expectedAwayGoals);
      const p = pHome * pAway;
      total += p;
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (h > 0 && a > 0) btts += p;
      if (h + a > 2) over25 += p;
    }
  }

  // Normalize to ensure probabilities sum to 1 (for win/draw/win)
  const sum = homeWin + draw + awayWin;
  if (sum > 0) {
    homeWin /= sum;
    draw /= sum;
    awayWin /= sum;
  }

  // Clamp to [0,1] and round
  return {
    homeWin: Number(homeWin.toFixed(4)),
    draw: Number(draw.toFixed(4)),
    awayWin: Number(awayWin.toFixed(4)),
    btts: Number(btts.toFixed(4)),
    over25: Number(over25.toFixed(4))
  };
}

/**
 * Compute all match probabilities from features.
 * @param {Object} features - Output from buildMatchFeatures()
 * @returns {Object} { homeWin, draw, awayWin, btts, over25, expectedHomeGoals, expectedAwayGoals }
 */
function computeMatchProbabilities(features) {
  const { expectedHomeGoals, expectedAwayGoals } = calculateExpectedGoals(features);
  const probs = runPoissonSimulation(expectedHomeGoals, expectedAwayGoals);
  return {
    ...probs,
    expectedHomeGoals: Number(expectedHomeGoals.toFixed(2)),
    expectedAwayGoals: Number(expectedAwayGoals.toFixed(2))
  };
}

module.exports = {
  calculateExpectedGoals,
  poissonProbability,
  runPoissonSimulation,
  computeMatchProbabilities
};
