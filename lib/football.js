// lib/football.js
// Football data via API-Football (RapidAPI)
// Optimized: combined calls, odds, fixture stats, API budget tracking

const BASE_URL = 'https://v3.football.api-sports.io'

function getHeaders() {
  return {
    'X-RapidAPI-Key': process.env.FOOTBALL_API_KEY,
    'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
  }
}

// ─── SEASON HELPERS ──────────────────────────────────────────
function getCurrentSeason() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month >= 8 ? year : year - 1
}

function calendarYear() {
  return new Date().getFullYear()
}

// ─── LEAGUES — 20+ supported ─────────────────────────────────
// seasonFn: European leagues follow Aug-May, African/MLS follow calendar year
export const LEAGUES = {
  // Top 5 European
  'Premier League':        { id: 39,  seasonFn: getCurrentSeason, avgGoals: 2.75 },
  'La Liga':               { id: 140, seasonFn: getCurrentSeason, avgGoals: 2.55 },
  'Serie A':               { id: 135, seasonFn: getCurrentSeason, avgGoals: 2.65 },
  'Bundesliga':            { id: 78,  seasonFn: getCurrentSeason, avgGoals: 3.10 },
  'Ligue 1':               { id: 61,  seasonFn: getCurrentSeason, avgGoals: 2.65 },

  // European cups
  'Champions League':      { id: 2,   seasonFn: getCurrentSeason, avgGoals: 2.90 },
  'Europa League':         { id: 3,   seasonFn: getCurrentSeason, avgGoals: 2.70 },
  'Conference League':     { id: 848, seasonFn: getCurrentSeason, avgGoals: 2.80 },

  // Other European
  'Eredivisie':            { id: 88,  seasonFn: getCurrentSeason, avgGoals: 3.20 },
  'Primeira Liga':         { id: 94,  seasonFn: getCurrentSeason, avgGoals: 2.50 },
  'Scottish Premiership':  { id: 179, seasonFn: getCurrentSeason, avgGoals: 2.70 },
  'Super Lig':             { id: 203, seasonFn: getCurrentSeason, avgGoals: 2.80 },

  // Africa
  'Uganda Premier League': { id: 671, seasonFn: calendarYear, avgGoals: 2.20 },
  'Kenya Premier League':  { id: 700, seasonFn: calendarYear, avgGoals: 2.30 },
  'NPFL Nigeria':          { id: 334, seasonFn: calendarYear, avgGoals: 2.10 },
  'Tanzania Premier':      { id: 672, seasonFn: calendarYear, avgGoals: 2.20 },
  'Ghana Premier':         { id: 550, seasonFn: calendarYear, avgGoals: 2.30 },
  'South Africa PSL':      { id: 288, seasonFn: calendarYear, avgGoals: 2.30 },
  'Egypt Premier':         { id: 233, seasonFn: getCurrentSeason, avgGoals: 2.40 },
  'CAF Champions League':  { id: 12,  seasonFn: getCurrentSeason, avgGoals: 2.20 },
  'AFCON':                 { id: 6,   seasonFn: calendarYear, avgGoals: 2.20 },
  'AFCON Qualifiers':      { id: 36,  seasonFn: calendarYear, avgGoals: 2.10 },

  // Americas
  'MLS':                   { id: 253, seasonFn: calendarYear, avgGoals: 2.90 },
  'Brazilian Serie A':     { id: 71,  seasonFn: calendarYear, avgGoals: 2.45 },
  'Argentine Liga':        { id: 128, seasonFn: calendarYear, avgGoals: 2.40 },

  // Asia / World
  'J-League':              { id: 98,  seasonFn: calendarYear, avgGoals: 2.70 },
  'World Cup':             { id: 1,   seasonFn: calendarYear, avgGoals: 2.50 },
  'World Cup Qualifiers':  { id: 32,  seasonFn: calendarYear, avgGoals: 2.30 },
}

// Quick lookup: league ID → league name and avgGoals
const LEAGUE_BY_ID = {}
for (const [name, cfg] of Object.entries(LEAGUES)) {
  LEAGUE_BY_ID[cfg.id] = { name, avgGoals: cfg.avgGoals }
}

/**
 * Get league-specific average goals. Falls back to 2.6 global average.
 */
export function getLeagueAvgGoals(leagueIdOrName) {
  if (typeof leagueIdOrName === 'number') {
    return LEAGUE_BY_ID[leagueIdOrName]?.avgGoals || 2.6
  }
  return LEAGUES[leagueIdOrName]?.avgGoals || 2.6
}

// ─── API BUDGET TRACKER ──────────────────────────────────────
// Tracks daily API usage to stay within 100 req/day (free plan)
let dailyRequestCount = 0
let lastResetDate = new Date().toISOString().split('T')[0]

function checkBudget() {
  const today = new Date().toISOString().split('T')[0]
  if (today !== lastResetDate) {
    dailyRequestCount = 0
    lastResetDate = today
  }
  return dailyRequestCount < 95 // leave 5 buffer for results update
}

function trackRequest() {
  dailyRequestCount++
  console.log(`[API Budget] ${dailyRequestCount}/100 requests used today`)
}

export function getApiUsage() {
  return { used: dailyRequestCount, limit: 100, remaining: 100 - dailyRequestCount }
}

// ─── CORE FETCH (with budget tracking) ───────────────────────
async function footballFetch(endpoint) {
  if (!process.env.FOOTBALL_API_KEY) {
    console.warn('FOOTBALL_API_KEY not set — returning empty')
    return []
  }

  if (!checkBudget()) {
    console.warn('[Football API] Daily budget exhausted — skipping request')
    return []
  }

  const url = `${BASE_URL}${endpoint}`
  console.log('[Football API] GET', url)

  try {
    trackRequest()
    const res = await fetch(url, {
      headers: getHeaders(),
      next: { revalidate: 0 },
    })

    const text = await res.text()

    if (!res.ok) {
      console.error(`[Football API] HTTP ${res.status}:`, text.slice(0, 200))
      return []
    }

    let json
    try { json = JSON.parse(text) }
    catch {
      console.error('[Football API] Invalid JSON:', text.slice(0, 200))
      return []
    }

    if (json.errors && Object.keys(json.errors).length > 0) {
      console.error('[Football API] API errors:', json.errors)
      return []
    }

    console.log(`[Football API] Got ${json.results ?? 0} results`)
    return json.response || []

  } catch (err) {
    console.error(`[Football API] Fetch failed [${endpoint}]:`, err.message)
    return []
  }
}

// ─── GET TODAY'S FIXTURES ────────────────────────────────────
export async function getTodayFixtures() {
  const today = new Date().toISOString().split('T')[0]
  console.log('[Football API] Fetching fixtures for date:', today)

  const data = await footballFetch(`/fixtures?date=${today}`)

  if (!data.length) {
    console.warn('[Football API] No fixtures returned for', today)
    return []
  }

  const supportedIds = new Set(Object.values(LEAGUES).map(l => l.id))

  const fixtures = data
    .filter(f => supportedIds.has(f.league?.id))
    .map(f => {
      const leagueName = LEAGUE_BY_ID[f.league.id]?.name || f.league.name

      return {
        id: f.fixture.id,
        league: leagueName,
        league_id: f.league.id,
        home_team: f.teams.home.name,
        away_team: f.teams.away.name,
        home_team_id: f.teams.home.id,
        away_team_id: f.teams.away.id,
        home_logo: f.teams.home.logo,
        away_logo: f.teams.away.logo,
        date: f.fixture.date,
        venue: f.fixture.venue?.name,
        status: f.fixture.status.short,
      }
    })

  console.log(`[Football API] ${fixtures.length} fixtures in supported leagues`)
  return fixtures
}

// ─── COMBINED TEAM STATS + FORM (saves API calls) ────────────
// Returns BOTH the structured stats array AND the form string
// from a single API call instead of two separate calls.
export async function getTeamData(teamId, leagueId, last = 10) {
  const leagueCfg = LEAGUES[Object.keys(LEAGUES).find(k => LEAGUES[k].id === leagueId)]
  const season = leagueCfg ? leagueCfg.seasonFn() : getCurrentSeason()
  const data = await footballFetch(
    `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${last}&status=FT`
  )

  if (!data.length) {
    return {
      stats: [],
      form: 'No recent data',
    }
  }

  const stats = data.map(f => {
    const isHome   = f.teams.home.id === teamId
    const goalsFor = isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0)
    const goalsAgainst = isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0)

    let result = 'D'
    if (goalsFor > goalsAgainst) result = 'W'
    else if (goalsFor < goalsAgainst) result = 'L'

    return {
      result,
      goalsFor,
      goalsAgainst,
      cleanSheet: goalsAgainst === 0,
      shotsOnTarget: 0, // enriched by getFixtureStats if available
      date: f.fixture.date,
    }
  }).reverse() // oldest → newest

  const form = data.map(f => {
    const isHome = f.teams.home.id === teamId
    const scored   = isHome ? f.goals.home : f.goals.away
    const conceded = isHome ? f.goals.away : f.goals.home
    if (scored === null || conceded === null) return '?'
    if (scored > conceded) return 'W'
    if (scored === conceded) return 'D'
    return 'L'
  }).reverse().slice(-5).join(' ')

  return { stats, form }
}

// Legacy wrappers (so existing code doesn't break)
export async function getTeamStatsForModel(teamId, leagueId, last = 10) {
  const { stats } = await getTeamData(teamId, leagueId, last)
  return stats
}

export async function getTeamForm(teamId, leagueId, last = 5) {
  const { form } = await getTeamData(teamId, leagueId, last)
  return form
}

// ─── HEAD TO HEAD ────────────────────────────────────────────
export async function getH2HForModel(homeId, awayId) {
  const data = await footballFetch(
    `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5&status=FT`
  )
  if (!data.length) return []

  return data.map(f => {
    const hg = f.goals.home ?? 0
    const ag = f.goals.away ?? 0
    let winner = 'draw'
    if (hg > ag) winner = 'home'
    else if (ag > hg) winner = 'away'
    return { winner, homeGoals: hg, awayGoals: ag }
  })
}

export async function getH2H(homeId, awayId) {
  const data = await footballFetch(
    `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5&status=FT`
  )
  if (!data.length) return 'No recent H2H data'

  return data.map(f => {
    const hg = f.goals.home ?? '?'
    const ag = f.goals.away ?? '?'
    return `${f.teams.home.name} ${hg}–${ag} ${f.teams.away.name}`
  }).join(' | ')
}

// ─── FIXTURE STATISTICS (shots, possession, corners) ─────────
// Costs 1 API call per fixture. Use selectively for high-value matches.
export async function getFixtureStats(fixtureId) {
  const data = await footballFetch(`/fixtures/statistics?fixture=${fixtureId}`)
  if (!data.length) return null

  const result = { home: {}, away: {} }

  for (const teamBlock of data) {
    const side = teamBlock.team?.id ? 'home' : 'away' // first block = home
    const stats = {}

    for (const s of teamBlock.statistics || []) {
      const key = s.type?.toLowerCase().replace(/\s+/g, '_')
      const val = s.value
      if (key) {
        stats[key] = typeof val === 'string' && val.endsWith('%')
          ? parseFloat(val) / 100
          : (typeof val === 'number' ? val : 0)
      }
    }

    if (data.indexOf(teamBlock) === 0) {
      result.home = stats
    } else {
      result.away = stats
    }
  }

  return result
}

// ─── PRE-MATCH ODDS ──────────────────────────────────────────
// Fetches odds from bookmakers for a specific fixture.
// Returns { homeWin, draw, awayWin } decimal odds (best available).
export async function getFixtureOdds(fixtureId) {
  const data = await footballFetch(`/odds?fixture=${fixtureId}`)
  if (!data.length) return null

  // Find "Match Winner" market (bet365 preferred, fallback to any)
  for (const bookmakerGroup of data) {
    const bookmakers = bookmakerGroup.bookmakers || []

    // Try bet365 first, then any bookmaker
    const preferred = bookmakers.find(b =>
      b.name?.toLowerCase().includes('bet365')
    ) || bookmakers[0]

    if (!preferred) continue

    const matchWinner = (preferred.bets || []).find(b =>
      b.name === 'Match Winner' || b.id === 1
    )

    if (!matchWinner) continue

    const odds = {}
    for (const v of matchWinner.values || []) {
      if (v.value === 'Home') odds.homeWin = parseFloat(v.odd)
      if (v.value === 'Draw') odds.draw = parseFloat(v.odd)
      if (v.value === 'Away') odds.awayWin = parseFloat(v.odd)
    }

    if (odds.homeWin && odds.draw && odds.awayWin) {
      return odds
    }
  }

  return null
}

// ─── OPTIMIZED: GET ALL MATCH DATA IN MINIMUM API CALLS ──────
// Combines team data + H2H into 3 calls instead of 6.
// Used by predict and accumulator routes.
export async function getFullMatchData(fixture) {
  if (!fixture.home_team_id || !fixture.away_team_id || !fixture.league_id) {
    return {
      homeStats: [],
      awayStats: [],
      homeForm: 'No data',
      awayForm: 'No data',
      h2h: [],
      h2hStr: 'No H2H data',
      odds: null,
      leagueAvgGoals: getLeagueAvgGoals(fixture.league_id),
    }
  }

  // 3 parallel calls instead of 6
  const [homeData, awayData, h2hData] = await Promise.all([
    getTeamData(fixture.home_team_id, fixture.league_id, 10),
    getTeamData(fixture.away_team_id, fixture.league_id, 10),
    getH2HForModel(fixture.home_team_id, fixture.away_team_id),
  ])

  // H2H string for Claude
  const h2hStr = h2hData.length > 0
    ? h2hData.map(m => `${m.homeGoals}-${m.awayGoals}`).join(' | ')
    : 'No H2H data'

  // Only fetch odds if we have API budget (costs 1 extra call)
  let odds = null
  if (fixture.id && checkBudget()) {
    try {
      odds = await getFixtureOdds(fixture.id)
    } catch (e) {
      console.warn('[Football API] Odds fetch failed:', e.message)
    }
  }

  return {
    homeStats: homeData.stats,
    awayStats: awayData.stats,
    homeForm: homeData.form,
    awayForm: awayData.form,
    h2h: h2hData,
    h2hStr,
    odds,
    leagueAvgGoals: getLeagueAvgGoals(fixture.league_id),
  }
}

// ─── BUILD FULL MATCH CONTEXT FOR CLAUDE ─────────────────────
export async function buildMatchContext(fixture) {
  const data = await getFullMatchData(fixture)

  return {
    home_team: fixture.home_team,
    away_team: fixture.away_team,
    league: fixture.league,
    date: fixture.date,
    home_form: data.homeForm,
    away_form: data.awayForm,
    h2h: data.h2hStr,
    home_injuries: 'Check latest team news',
    away_injuries: 'Check latest team news',
    home_advantage: `Playing at ${fixture.venue || 'home ground'}`,
  }
}
