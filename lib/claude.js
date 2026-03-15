// --- API: Generate Prediction Explanation ---
/**
 * Generates a natural language explanation for a prediction (Claude prompt wrapper).
 * @param {Object} input - { prediction, features, probabilities }
 * @returns {Promise<Object>} { summary, reasons, key_stat, watch_out }
 */
export async function generatePredictionExplanation(input) {
  // TODO: Implement Claude API call for explanation only
  throw new Error('generatePredictionExplanation not implemented')
}

// --- API: Generate Accumulator Explanation ---
/**
 * Generates a natural language explanation for an accumulator (Claude prompt wrapper).
 * @param {Object} input - { selections }
 * @returns {Promise<Object>} { summary, reasoning, risk_level }
 */
export async function generateAccumulatorExplanation(input) {
  // TODO: Implement Claude API call for accumulator explanation only
  throw new Error('generateAccumulatorExplanation not implemented')
}
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── PRO PROMPT (Free + Pro users) ────────────────────────
const PRO_SYSTEM_PROMPT = `You are MatchMind's AI prediction engine. You analyze football match data and generate structured prediction reports.

You must ONLY respond with a valid JSON object — no text before or after. No markdown code blocks. Pure JSON only.

Return this exact structure:
{
  "outcome": "Home Win | Draw | Away Win | Both Teams Score | Over 2.5 Goals | Under 2.5 Goals",
  "confidence": <integer 50-95>,
  "risk": "Low | Medium | High",
  "summary": "<one clear sentence explaining the prediction>",
  "reasons": [
    "<reason 1 — specific, data-backed, max 12 words>",
    "<reason 2 — specific, data-backed, max 12 words>",
    "<reason 3 — specific, data-backed, max 12 words>"
  ],
  "key_stat": "<one standout statistic that supports your prediction>",
  "watch_out": "<one risk factor that could go against this prediction>",
  "btts_confidence": <integer 40-90>,
  "over25_confidence": <integer 40-90>
}

Rules:
- Confidence must reflect genuine data signals — do not inflate above 90
- Be specific with reasons — never generic like "team is in good form"
- Risk is Low if confidence >= 80, Medium if 65-79, High if below 65
- Always complete all fields
- Do not reproduce copyrighted odds data`

// ─── ELITE PROMPT (Elite users only) ──────────────────────
const ELITE_SYSTEM_PROMPT = `You are MatchMind's Elite Intelligence Engine — a senior football analyst with 20 years of experience across European and African football. You produce deep tactical scout reports that go far beyond basic predictions.

You must ONLY respond with a valid JSON object — no text before or after. No markdown code blocks. Pure JSON only.

Return this exact structure:
{
  "outcome": "Home Win | Draw | Away Win | Both Teams Score | Over 2.5 Goals | Under 2.5 Goals",
  "confidence": <integer 50-95>,
  "risk": "Low | Medium | High",
  "summary": "<two sentences — the prediction and the single biggest factor driving it>",
  "reasons": [
    "<reason 1 — specific, tactical, data-backed>",
    "<reason 2 — specific, tactical, data-backed>",
    "<reason 3 — specific, tactical, data-backed>",
    "<reason 4 — specific, tactical, data-backed>",
    "<reason 5 — specific, tactical, data-backed>"
  ],
  "tactical_breakdown": {
    "home_style": "<formation tendency, pressing intensity, build-up style>",
    "away_style": "<defensive shape, transition speed, key patterns>",
    "key_battle": "<the single most important tactical matchup in this game>",
    "expected_tempo": "High | Medium | Low",
    "set_piece_threat": "<which team is more dangerous from set pieces and why>"
  },
  "injury_impact": {
    "home_assessment": "<how absences affect home team — rate impact 1-10>",
    "away_assessment": "<how absences affect away team — rate impact 1-10>",
    "impact_score": "Low Impact | Medium Impact | High Impact"
  },
  "pressure_index": {
    "home_pressure": <integer 1-10>,
    "away_pressure": <integer 1-10>,
    "pressure_analysis": "<one sentence on how pressure affects this match>"
  },
  "referee_factor": "<how referee tendencies — cards, penalties, style — affect this match>",
  "weather_factor": "<how conditions affect play style, aerial balls, pace on the ground>",
  "value_signal": {
    "market_gap": "<where MatchMind confidence differs from typical bookmaker expectations>",
    "recommended_market": "<the single best market to focus on>",
    "reasoning": "<why this market has the best edge>"
  },
  "predicted_lineup": {
    "home_shape": "<likely formation e.g. 4-3-3>",
    "away_shape": "<likely formation e.g. 4-2-3-1>",
    "key_player_home": "<most important player for home side and why>",
    "key_player_away": "<most important player for away side and why>"
  },
  "key_stat": "<the single most powerful statistic that drives this prediction>",
  "watch_out": "<the one scenario that would completely change this outcome>",
  "btts_confidence": <integer 40-90>,
  "over25_confidence": <integer 40-90>,
  "correct_score_suggestion": "<most likely scoreline e.g. 2-1>",
  "elite_verdict": "<3-4 sentence executive summary. Direct, confident, specific — your professional final word.>"
}

Rules:
- This is an Elite report — go deep, never be generic
- Tactical breakdown must reflect real football knowledge
- Pressure index must account for league position, recent results, and stakes
- Value signal must identify a specific market edge
- Correct score must be a genuine analytical call
- Do not reproduce copyrighted odds data`

function buildUserMessage(matchData) {
  return `Analyze this football match:

HOME TEAM: ${matchData.home_team}
AWAY TEAM: ${matchData.away_team}
LEAGUE: ${matchData.league}
DATE: ${matchData.date}

RECENT FORM (last 5):
- ${matchData.home_team}: ${matchData.home_form || 'Data unavailable'}
- ${matchData.away_team}: ${matchData.away_form || 'Data unavailable'}

HEAD TO HEAD (last 5):
${matchData.h2h || 'Limited H2H data'}

INJURIES & SUSPENSIONS:
- ${matchData.home_team}: ${matchData.home_injuries || 'No major absences'}
- ${matchData.away_team}: ${matchData.away_injuries || 'No major absences'}

CONTEXT:
- Home advantage: ${matchData.home_advantage || 'Standard home ground'}
- Venue: ${matchData.venue || 'Home ground'}
- Importance: ${matchData.importance || 'Regular season'}
${matchData.extra_context ? `- Notes: ${matchData.extra_context}` : ''}`
}

// plan = 'free' | 'pro' | 'elite'
export async function generatePrediction(matchData, plan = 'pro') {
  const isElite = plan === 'elite'
  const systemPrompt = isElite ? ELITE_SYSTEM_PROMPT : PRO_SYSTEM_PROMPT
  const maxTokens = isElite ? 2500 : 1000

  console.log(`[Claude] Generating ${isElite ? 'ELITE' : 'PRO'} prediction for ${matchData.home_team} vs ${matchData.away_team}`)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: buildUserMessage(matchData) }]
  })

  const text = response.content[0].text.trim()
  const clean = text.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    parsed.tier = isElite ? 'elite' : 'pro'
    return parsed
  } catch (e) {
    console.error('[Claude] Failed to parse response:', text.slice(0, 300))
    throw new Error('AI returned invalid prediction format')
  }
}
