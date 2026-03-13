// Football data via API-Football (RapidAPI)
// Free plan: 100 requests/day — sufficient for launch
// Docs: https://www.api-football.com/documentation-v3

const BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3'
const HEADERS = {
  'X-RapidAPI-Key': process.env.FOOTBALL_API_KEY,
  'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
}

// League IDs we support at launch
export const LEAGUES = {
  'Premier League':          39,
  'La Liga':                 140,
  'Serie A':                 135,
  'Bundesliga':              78,
  'Champions League':        2,
  'Uganda Premier League':   671,
  'Kenya Premier League':    700,
  'NPFL Nigeria':            334,
  'AFCON Qualifiers':        6,
  'CAF Champions League':    12,
}

async function footballFetch(endpoint) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, { headers: HEADERS })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()

    if (process.env.DEBUG_FOOTBALL_API) {
      console.debug(`Football API response [${endpoint}]:`, data)
    }

    return data.response || []
  } catch (err) {
    console.error(`Football API error [${endpoint}]:`, err.message)
    return []
  }
}

// Get today's fixtures across supported leagues
export async function getTodayFixtures() {
  const today = new Date().toISOString().split('T')[0]
  const fixtures = []

  // API-Football expects a "season" (start year) for most league queries.
  // Use current year, but if it is early in the year, use previous year (season spanning YYYY-YYYY).
  const now = new Date()
  const season = now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear()

  for (const [leagueName, leagueId] of Object.entries(LEAGUES)) {
    // Try a couple of season values in case the league is in a different calendar structure.
    const seasonCandidates = [season, season - 1]
    let data = []

    for (const s of seasonCandidates) {
      data = await footballFetch(`/fixtures?date=${today}&league=${leagueId}&season=${s}`)
      if (data && data.length > 0) {
        break
      }
    }

    // Fallback: try without season (some leagues may not require it)
    if (!data || data.length === 0) {
      data = await footballFetch(`/fixtures?date=${today}&league=${leagueId}`)
    }

    if (!data || data.length === 0) {
      // Debug log for missing fixtures (can be enabled by setting DEBUG_FOOTBALL_API=1)
      if (process.env.DEBUG_FOOTBALL_API) {
        console.warn(`No fixtures returned for league ${leagueName} (${leagueId}) on ${today}.`)
      }
      continue
    }

    const mapped = data.map(f => ({
      id: f.fixture.id,
      league: leagueName,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      date: f.fixture.date,
      venue: f.fixture.venue?.name,
      status: f.fixture.status.short,
    }))

    fixtures.push(...mapped)
  }

  return fixtures
}

// Get team's last N match results
export async function getTeamForm(teamId, leagueId, season = 2024, last = 5) {
  const data = await footballFetch(`/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${last}`)
  if (!data.length) return 'N/A'

  const form = data.map(f => {
    const homeGoals = f.goals.home
    const awayGoals = f.goals.away
    const isHome = f.teams.home.id === teamId
    const scored = isHome ? homeGoals : awayGoals
    const conceded = isHome ? awayGoals : homeGoals
    if (scored > conceded) return 'W'
    if (scored === conceded) return 'D'
    return 'L'
  })

  return form.join(' ')
}

// Get head-to-head record
export async function getH2H(homeId, awayId) {
  const data = await footballFetch(`/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`)
  if (!data.length) return 'No recent H2H data'

  const summary = data.map(f => {
    const ht = f.teams.home.name
    const at = f.teams.away.name
    const hg = f.goals.home
    const ag = f.goals.away
    return `${ht} ${hg}-${ag} ${at}`
  }).join(', ')

  return summary
}

// Get injuries for a team
export async function getInjuries(teamId, leagueId, season = 2024) {
  const data = await footballFetch(`/injuries?team=${teamId}&league=${leagueId}&season=${season}`)
  if (!data.length) return 'No injury reports'

  const injured = data
    .filter(p => p.player.reason !== 'fit')
    .slice(0, 3)
    .map(p => `${p.player.name} (${p.player.reason})`)
    .join(', ')

  return injured || 'Squad fully fit'
}

// Build complete match data for Claude
export async function buildMatchContext(fixture) {
  const [homeForm, awayForm, h2h] = await Promise.all([
    getTeamForm(fixture.teams?.home?.id, fixture.league?.id),
    getTeamForm(fixture.teams?.away?.id, fixture.league?.id),
    getH2H(fixture.teams?.home?.id, fixture.teams?.away?.id),
  ])

  return {
    home_team: fixture.home_team,
    away_team: fixture.away_team,
    league: fixture.league,
    date: fixture.date,
    home_form: homeForm,
    away_form: awayForm,
    h2h: h2h,
    home_injuries: 'Checking team news...',
    away_injuries: 'Checking team news...',
  }
}
