import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.split(' ')[1] || ''
  if (!token) return null

  const db = getServiceClient()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function POST(req) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = getServiceClient()

    const { data: profile } = await db
      .from('users')
      .select('plan, token_balance')
      .eq('id', user.id)
      .single()

    if (!profile || profile.plan !== 'elite') {
      return NextResponse.json({ error: 'Elite plan required', code: 'NOT_ELITE' }, { status: 403 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Get today's cached predictions
    const { data: predictions } = await db
      .from('predictions')
      .select('*')
      .gte('created_at', today)
      .order('confidence', { ascending: false })

    const matchList = predictions && predictions.length > 0
      ? predictions.map(p =>
          `- ${p.home_team} vs ${p.away_team} (${p.league}): Predicted ${p.outcome}, Confidence ${p.confidence}%, Risk ${p.risk}`
        ).join('\n')
      : `Build accumulator from today's top football matches across Premier League, CAF Champions League, Bundesliga, Serie A, La Liga`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are MatchMind's Elite Accumulator Engine. You build high-value 3-fold accumulator bet slips for serious football bettors in Uganda and East Africa.

You must ONLY respond with a valid JSON object. No markdown. Pure JSON only.

Return this exact structure:
{
  "title": "<catchy name e.g. 'Saturday Banker Triple', 'Weekend Certainty', 'African Derby Special'>",
  "overall_confidence": <integer 60-82>,
  "estimated_combined_odds": "<realistic combined odds e.g. 6.50>",
  "potential_return_example": "<e.g. 'UGX 10,000 stake returns UGX 65,000'>",
  "selections": [
    {
      "match": "<Home Team vs Away Team>",
      "league": "<league>",
      "pick": "<market: Home Win | Away Win | Draw | BTTS Yes | Over 2.5 Goals | Under 2.5 Goals | Draw No Bet>",
      "confidence": <integer 65-88>,
      "reasoning": "<2 specific sentences — why this pick is strong>",
      "estimated_odds": "<e.g. 1.85>"
    },
    {
      "match": "<Home Team vs Away Team>",
      "league": "<league>",
      "pick": "<market>",
      "confidence": <integer 65-88>,
      "reasoning": "<2 specific sentences>",
      "estimated_odds": "<e.g. 2.20>"
    },
    {
      "match": "<Home Team vs Away Team>",
      "league": "<league>",
      "pick": "<market>",
      "confidence": <integer 65-88>,
      "reasoning": "<2 specific sentences>",
      "estimated_odds": "<e.g. 1.75>"
    }
  ],
  "banker": "<which selection is the safest banker and why>",
  "avoid_market": "<one market to avoid today and why>",
  "risk_warning": "Accumulators carry higher risk. Only stake what you can afford to lose.",
  "elite_note": "<one insider observation that gives this slip extra conviction>"
}

Rules:
- Only selections with confidence above 65%
- Prefer: Home Win for strong home sides, BTTS for attacking teams, Over 2.5 for high-scoring leagues
- Combined odds must be realistic: 5.00 to 12.00 range
- Use UGX for return examples (Uganda primary market)
- Be specific — reference real match context in reasoning
- Never pick 3 high-risk selections — always include at least one banker`,

      messages: [{
        role: 'user',
        content: `Build today's Elite 3-fold accumulator.\n\nAvailable predictions:\n${matchList}\n\nDate: ${today}`
      }]
    })

    const text = response.content[0].text.trim()
    const clean = text.replace(/```json|```/g, '').trim()
    const accumulator = JSON.parse(clean)

    return NextResponse.json({ accumulator })

  } catch (err) {
    console.error('[Accumulator] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
