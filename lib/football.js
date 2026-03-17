// lib/football.js
// Football data via API-Football (RapidAPI)
// Free plan: 100 requests/day

const BASE_URL = 'https://v3.football.api-sports.io'

function getHeaders() {
  return {
    'X-RapidAPI-Key': process.env.FOOTBALL_API_KEY,
    'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
  }
}

// ─── SEASON HELPER ────────────────────────────────────────
function getCurrentSeason() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month >= 8 ? year : year - 1
}

export const LEAGUES = {
  'Premier League':        { id: 39,  seasonFn: getCurrentSeason },
  'La Liga':               { id: 140, seasonFn: getCurrentSeason },
  'Serie A':               { id: 135, seasonFn: getCurrentSeason },
  'Bundesliga':            { id: 78,  seasonFn: getCurrentSeason },
  'Champions League':      { id: 2,   seasonFn: getCurrentSeason },
  'Uganda Premier League': { id: 671, seasonFn: () => new Date().getFullYear() },
  'Kenya Premier League':  { id: 700, seasonFn: () => new Date().getFullYear() },
  'NPFL Nigeria':          { id: 334, seasonFn: () => new Date().getFullYear() },
  'CAF Champions League':  { id: 12,  seasonFn: getCurrentSeason },
}

// ─── CORE FETCH ───────────────────────────────────────────
async function footballFetch(endpoint) {
  if (!process.env.FOOTBALL_API_KEY) {
    console.warn('FOOTBALL_API_KEY not set — returning empty')
    return []
  }

  const url = `${BASE_URL}${endpoint}`
  console.log('[Football API] GET', url)

  try {
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

// ─── GET TODAY'S FIXTURES ─────────────────────────────────
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
      const leagueName = Object.keys(LEAGUES).find(
        name => LEAGUES[name].id === f.league.id
      ) || f.league.name

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

// ─── TEAM FORM STRING (for Claude context) ────────────────
export async function getTeamForm(teamId, leagueId, last = 5) {
  const season = getCurrentSeason()
  const data = await footballFetch(
    `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${last}&status=FT`
  )
  if (!data.length) return 'No recent data'

  const form = data.map(f => {
    const isHome = f.teams.home.id === teamId
    const scored   = isHome ? f.goals.home : f.goals.away
    const conceded = isHome ? f.goals.away : f.goals.home
    if (scored === null || conceded === null) return '?'
    if (scored > conceded) return 'W'
    if (scored === conceded) return 'D'
    return 'L'
  })

  return form.reverse().join(' ')
}

// ─── TEAM STATS FOR STATISTICAL MODEL ────────────────────
// Returns structured arrays that features.js can consume.
// Each match: { result, goalsFor, goalsAgainst, cleanSheet, shotsOnTarget }
export async function getTeamStatsForModel(teamId, leagueId, last = 10) {
  const season = getCurrentSeason()
  const data = await footballFetch(
    `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${last}&status=FT`
  )

  if (!data.length) return []

  return data.map(f => {
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
      shotsOnTarget: 0, // requires separate /fixtures/statistics call — costs extra quota
    }
  }).reverse() // oldest → newest
}

// ─── HEAD TO HEAD (structured for model) ─────────────────
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

// ─── HEAD TO HEAD STRING (for Claude context) ─────────────
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

// ─── GET FULL MATCH DATA (form + H2H + stats for model) ───
export async function getFullMatchData(fixture) {
  const hasIds = fixture.home_team_id && fixture.away_team_id

  const [homeForm, awayForm, h2h, homeStats, awayStats, h2hModel] = hasIds
    ? await Promise.all([
        getTeamForm(fixture.home_team_id, fixture.league_id),
        getTeamForm(fixture.away_team_id, fixture.league_id),
        getH2H(fixture.home_team_id, fixture.away_team_id),
        getTeamStatsForModel(fixture.home_team_id, fixture.league_id),
        getTeamStatsForModel(fixture.away_team_id, fixture.league_id),
        getH2HForModel(fixture.home_team_id, fixture.away_team_id),
      ])
    : ['No data', 'No data', 'No H2H data', [], [], []]

  return {
    // Claude context fields
    home_team: fixture.home_team,
    away_team: fixture.away_team,
    league: fixture.league,
    date: fixture.date,
    home_form: homeForm,
    away_form: awayForm,
    h2h,
    home_injuries: 'Check latest team news',
    away_injuries: 'Check latest team news',
    home_advantage: `Playing at ${fixture.venue || 'home ground'}`,
    venue: fixture.venue,
    // Statistical model fields
    homeStats,
    awayStats,
    h2hModel,
  }
}
export async function buildMatchContext(fixture) {
  const [homeForm, awayForm, h2h] = fixture.home_team_id && fixture.away_team_id
    ? await Promise.all([
        getTeamForm(fixture.home_team_id, fixture.league_id),
        getTeamForm(fixture.away_team_id, fixture.league_id),
        getH2H(fixture.home_team_id, fixture.away_team_id),
      ])
    : ['No data', 'No data', 'No H2H data']

  return {
    home_team: fixture.home_team,
    away_team: fixture.away_team,
    league: fixture.league,
    date: fixture.date,
    home_form: homeForm,
    away_form: awayForm,
    h2h,
    home_injuries: 'Check latest team news',
    away_injuries: 'Check latest team news',
    home_advantage: `Playing at ${fixture.venue || 'home ground'}`,
  }
}
