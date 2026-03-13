// Football data via API-Football (RapidAPI)
// Free plan: 100 requests/day
// Docs: https://www.api-football.com/documentation-v3

const BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3'

function getHeaders() {
  return {
    'X-RapidAPI-Key': process.env.FOOTBALL_API_KEY,
    'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
  }
}

// ─── SEASON HELPER ────────────────────────────────────────
// Football seasons straddle two years (2024/25 season = "2024").
// For leagues that run Jan-Dec (Uganda, Nigeria) use current year.
// For Aug-May leagues (Premier League etc) use year season started.
function getCurrentSeason() {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const year = now.getFullYear()
  // Aug-May leagues: if we're Jan-Jul, season started previous year
  return month >= 8 ? year : year - 1
}

// League IDs + which season logic to use
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
      next: { revalidate: 0 }, // no caching — always fresh
    })

    const text = await res.text()

    if (!res.ok) {
      console.error(`[Football API] HTTP ${res.status}:`, text.slice(0, 200))
      return []
    }

    let json
    try {
      json = JSON.parse(text)
    } catch {
      console.error('[Football API] Invalid JSON:', text.slice(0, 200))
      return []
    }

    // Log quota usage on free tier
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
// IMPORTANT: Free tier = 100 req/day. We fetch ONE bulk request
// for all fixtures today instead of one per league, to save quota.
export async function getTodayFixtures() {
  // Format: YYYY-MM-DD in UTC
  const today = new Date().toISOString().split('T')[0]
  console.log('[Football API] Fetching fixtures for date:', today)

  // Single request — all leagues for today's date
  // API returns all leagues if no league filter is passed
  const data = await footballFetch(`/fixtures?date=${today}`)

  if (!data.length) {
    console.warn('[Football API] No fixtures returned for', today)
    return []
  }

  // Build a lookup of our supported league IDs
  const supportedIds = new Set(
    Object.values(LEAGUES).map(l => l.id)
  )

  const fixtures = data
    .filter(f => supportedIds.has(f.league?.id))
    .map(f => {
      // Find league name from our map
      const leagueName = Object.keys(LEAGUES).find(
        name => LEAGUES[name].id === f.league.id
      ) || f.league.name

      return {
        id: f.fixture.id,
        league: leagueName,
        home_team: f.teams.home.name,
        away_team: f.teams.away.name,
        home_team_id: f.teams.home.id,
        away_team_id: f.teams.away.id,
        home_logo: f.teams.home.logo,
        away_logo: f.teams.away.logo,
        date: f.fixture.date,
        venue: f.fixture.venue?.name,
        status: f.fixture.status.short,
        league_id: f.league.id,
      }
    })

  console.log(`[Football API] ${fixtures.length} fixtures found in supported leagues`)
  return fixtures
}

// ─── TEAM FORM ────────────────────────────────────────────
export async function getTeamForm(teamId, leagueId, last = 5) {
  const season = getCurrentSeason()
  const data = await footballFetch(
    `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${last}&status=FT`
  )
  if (!data.length) return 'No recent data'

  const form = data.map(f => {
    const isHome = f.teams.home.id === teamId
    const scored    = isHome ? f.goals.home : f.goals.away
    const conceded  = isHome ? f.goals.away : f.goals.home
    if (scored === null || conceded === null) return '?'
    if (scored > conceded) return 'W'
    if (scored === conceded) return 'D'
    return 'L'
  })

  return form.reverse().join(' ') // oldest → newest
}

// ─── HEAD TO HEAD ─────────────────────────────────────────
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

// ─── BUILD FULL MATCH CONTEXT FOR CLAUDE ──────────────────
export async function buildMatchContext(fixture) {
  // Only fetch form/H2H if we have team IDs (saves API quota)
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
    h2h: h2h,
    home_injuries: 'Check latest team news',
    away_injuries: 'Check latest team news',
    home_advantage: `Playing at ${fixture.venue || 'home ground'}`,
  }
}
