// lib/model.js
// Advanced football prediction model for MatchMind
// Poisson + Dixon-Coles correction + home advantage + multi-factor adjustments

// ─── POISSON PROBABILITY ────────────────────────────────────
function poissonProbability(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k)
}

function factorial(n) {
  if (n <= 1) return 1
  let res = 1
  for (let i = 2; i <= n; i++) res *= i
  return res
}

// ─── DIXON-COLES CORRECTION ────────────────────────────────
// Adjusts probabilities for low-scoring outcomes (0-0, 1-0, 0-1, 1-1)
// which basic Poisson systematically underestimates.
// rho parameter controls the correction strength (-0.13 is typical for football).
function dixonColesCorrection(homeGoals, awayGoals, lambdaHome, lambdaAway, rho = -0.13) {
  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - lambdaHome * lambdaAway * rho
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return 1 + lambdaAway * rho
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return 1 + lambdaHome * rho
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho
  }
  return 1.0
}

// ─── EXPECTED GOALS CALCULATOR ──────────────────────────────
// Blends attack/defense model with xG data (if available)
// instead of xG fully overriding the statistical model.
function calculateExpectedGoals(features) {
  const lg = features.leagueAvgGoals
  const ha = features.homeAdvantage || 1.25

  // Base model: home attack × away defense × league avg × home advantage
  // NOTE: defense here = goals conceded ratio (higher = weaker defense)
  let baseHome = features.homeAttack * features.awayDefense * lg * ha
  let baseAway = features.awayAttack * features.homeDefense * lg

  // Blend with xG if available (60% xG, 40% base model when xG exists)
  const hasXg = features.home_xg_for_avg > 0 && features.away_xg_for_avg > 0
  if (hasXg) {
    const xgHome = (features.home_xg_for_avg + features.away_xg_against_avg) / 2
    const xgAway = (features.away_xg_for_avg + features.home_xg_against_avg) / 2
    baseHome = baseHome * 0.4 + xgHome * 0.6
    baseAway = baseAway * 0.4 + xgAway * 0.6
  }

  // Elo adjustment: scale based on magnitude of difference
  // Every 100 Elo points = ~5% boost to the stronger side
  if (typeof features.elo_difference === 'number' && features.elo_difference !== 0) {
    const eloFactor = 1 + (features.elo_difference / 100) * 0.05
    baseHome *= Math.max(0.85, Math.min(1.15, eloFactor))
    baseAway *= Math.max(0.85, Math.min(1.15, 1 / eloFactor))
  }

  // Form adjustment: weighted form points difference
  // Max +/-8% swing based on form
  if (features.homeFormPoints && features.awayFormPoints) {
    const formDiff = features.homeFormPoints - features.awayFormPoints
    const formFactor = 1 + (formDiff / 3) * 0.04  // 3 = max form points
    baseHome *= Math.max(0.92, Math.min(1.08, formFactor))
    baseAway *= Math.max(0.92, Math.min(1.08, 1 / formFactor))
  }

  // Rest days adjustment: +/-3% per 2+ day advantage
  if (typeof features.rest_difference === 'number') {
    if (features.rest_difference >= 2) {
      baseHome *= 1.03
      baseAway *= 0.97
    } else if (features.rest_difference <= -2) {
      baseAway *= 1.03
      baseHome *= 0.97
    }
  }

  // H2H adjustment: if one side dominates H2H (3+ wins out of 5), slight boost
  if (features.h2hHomeWins >= 3) {
    baseHome *= 1.04
  } else if (features.h2hAwayWins >= 3) {
    baseAway *= 1.04
  }

  // Clamp to realistic range (0.3 – 4.0 goals expected)
  baseHome = Math.max(0.3, Math.min(4.0, baseHome))
  baseAway = Math.max(0.3, Math.min(4.0, baseAway))

  return {
    expectedHomeGoals: Number(baseHome.toFixed(3)),
    expectedAwayGoals: Number(baseAway.toFixed(3)),
  }
}

// ─── FULL SIMULATION WITH DIXON-COLES ───────────────────────
// Simulates scorelines 0-0 through 6-6 with Dixon-Coles correction
function runPoissonSimulation(expectedHomeGoals, expectedAwayGoals) {
  const maxGoals = 6
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0, over25 = 0, under25 = 0
  let scorelines = []

  for (let h = 0; h <= maxGoals; h++) {
    const pHome = poissonProbability(h, expectedHomeGoals)
    for (let a = 0; a <= maxGoals; a++) {
      const pAway = poissonProbability(a, expectedAwayGoals)
      const dcCorrection = dixonColesCorrection(h, a, expectedHomeGoals, expectedAwayGoals)
      const p = pHome * pAway * Math.max(0, dcCorrection) // ensure non-negative

      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p

      if (h > 0 && a > 0) btts += p
      if (h + a > 2) over25 += p
      if (h + a < 3) under25 += p

      scorelines.push({ home: h, away: a, probability: p })
    }
  }

  // Normalize 1X2 probabilities
  const total1X2 = homeWin + draw + awayWin
  if (total1X2 > 0) {
    homeWin /= total1X2
    draw /= total1X2
    awayWin /= total1X2
  }

  // Find most likely scoreline
  scorelines.sort((a, b) => b.probability - a.probability)
  const topScoreline = scorelines[0]
    ? `${scorelines[0].home}-${scorelines[0].away}`
    : '1-0'

  // Top 3 scorelines for additional insight
  const top3Scorelines = scorelines.slice(0, 3).map(s => ({
    score: `${s.home}-${s.away}`,
    probability: Number(s.probability.toFixed(4)),
  }))

  return {
    homeWin:   Number(homeWin.toFixed(4)),
    draw:      Number(draw.toFixed(4)),
    awayWin:   Number(awayWin.toFixed(4)),
    btts:      Number(Math.min(btts, 1).toFixed(4)),
    over25:    Number(Math.min(over25, 1).toFixed(4)),
    under25:   Number(Math.min(under25, 1).toFixed(4)),
    topScoreline,
    top3Scorelines,
  }
}

// ─── COMPUTE ALL MATCH PROBABILITIES ────────────────────────
function computeMatchProbabilities(features) {
  const { expectedHomeGoals, expectedAwayGoals } = calculateExpectedGoals(features)
  const probs = runPoissonSimulation(expectedHomeGoals, expectedAwayGoals)
  return {
    ...probs,
    expectedHomeGoals,
    expectedAwayGoals,
  }
}

export {
  calculateExpectedGoals,
  poissonProbability,
  dixonColesCorrection,
  runPoissonSimulation,
  computeMatchProbabilities,
}
