// lib/features.js
// Feature Builder for MatchMind
// Converts raw API-Football data into structured statistical features for the prediction model.

/**
 * Extracts and computes statistical features from raw API-Football data.
 * @param {Object} matchData - Raw match data from API-Football (teams, stats, recent matches, league info, etc.)
 * @returns {Object} Structured features for the statistical model.
 */
function buildMatchFeatures(matchData) {
  // Example structure of matchData (should be adapted to actual API response):
  // {
  //   homeTeam: {...},
  //   awayTeam: {...},
  //   league: {...},
  //   recentMatchesHome: [...],
  //   recentMatchesAway: [...],
  //   headToHead: [...],
  // }

  // Helper to calculate average from array
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Last 5 form (W/D/L)
  const formHome = (matchData.recentMatchesHome || []).slice(0, 5).map(m => m.result).join(' ');
  const formAway = (matchData.recentMatchesAway || []).slice(0, 5).map(m => m.result).join(' ');

  // Goals scored/conceded averages (home/away)
  const homeGoals = avg((matchData.recentMatchesHome || []).map(m => m.goalsFor));
  const homeConceded = avg((matchData.recentMatchesHome || []).map(m => m.goalsAgainst));
  const awayGoals = avg((matchData.recentMatchesAway || []).map(m => m.goalsFor));
  const awayConceded = avg((matchData.recentMatchesAway || []).map(m => m.goalsAgainst));

  // Home/away attack/defense strength (relative to league average)
  const leagueAvgGoals = matchData.leagueAvgGoals || 2.6;
  const homeAttack = homeGoals / (leagueAvgGoals / 2);
  const homeDefense = 1 - (homeConceded / (leagueAvgGoals / 2));
  const awayAttack = awayGoals / (leagueAvgGoals / 2);
  const awayDefense = 1 - (awayConceded / (leagueAvgGoals / 2));

  // Clean sheet rates
  const cleanSheetHome = avg((matchData.recentMatchesHome || []).map(m => m.cleanSheet ? 1 : 0));
  const cleanSheetAway = avg((matchData.recentMatchesAway || []).map(m => m.cleanSheet ? 1 : 0));

  // Shots on target averages
  const shotsOnTargetHome = avg((matchData.recentMatchesHome || []).map(m => m.shotsOnTarget || 0));
  const shotsOnTargetAway = avg((matchData.recentMatchesAway || []).map(m => m.shotsOnTarget || 0));

  // Head-to-head (last 5)
  const h2h = (matchData.headToHead || []).slice(0, 5);
  const h2hHomeWins = h2h.filter(m => m.winner === 'home').length;
  const h2hAwayWins = h2h.filter(m => m.winner === 'away').length;
  const h2hDraws = h2h.filter(m => m.winner === 'draw').length;

  return {
    homeAttack: Number(homeAttack.toFixed(2)),
    homeDefense: Number(homeDefense.toFixed(2)),
    awayAttack: Number(awayAttack.toFixed(2)),
    awayDefense: Number(awayDefense.toFixed(2)),
    leagueAvgGoals: Number(leagueAvgGoals.toFixed(2)),
    formHome,
    formAway,
    cleanSheetHome: Number(cleanSheetHome.toFixed(2)),
    cleanSheetAway: Number(cleanSheetAway.toFixed(2)),
    shotsOnTargetHome: Number(shotsOnTargetHome.toFixed(2)),
    shotsOnTargetAway: Number(shotsOnTargetAway.toFixed(2)),
    h2hHomeWins,
    h2hAwayWins,
    h2hDraws
  };
}

module.exports = { buildMatchFeatures };