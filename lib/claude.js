import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are MatchMind's AI prediction engine. You analyze football match data and generate structured prediction reports.

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

export async function generatePrediction(matchData) {
  const userMessage = `
Analyze this football match and generate a prediction:

HOME TEAM: ${matchData.home_team}
AWAY TEAM: ${matchData.away_team}
LEAGUE: ${matchData.league}
DATE: ${matchData.date}

RECENT FORM (last 5 matches):
- ${matchData.home_team}: ${matchData.home_form || 'W W D L W'}
- ${matchData.away_team}: ${matchData.away_form || 'L W W D L'}

HEAD TO HEAD (last 5 meetings):
${matchData.h2h || 'Limited data available'}

INJURIES & SUSPENSIONS:
- ${matchData.home_team}: ${matchData.home_injuries || 'No major absences reported'}
- ${matchData.away_team}: ${matchData.away_injuries || 'No major absences reported'}

ADDITIONAL CONTEXT:
- Home advantage factor: ${matchData.home_advantage || 'Standard home ground'}
- Match importance: ${matchData.importance || 'Regular season match'}
- ${matchData.extra_context || ''}

Generate a detailed prediction based on all available data.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const text = response.content[0].text.trim()
  
  // Strip any accidental markdown fences
  const clean = text.replace(/```json|```/g, '').trim()
  
  try {
    return JSON.parse(clean)
  } catch (e) {
    console.error('Failed to parse Claude response:', text)
    throw new Error('AI returned invalid prediction format')
  }
}
