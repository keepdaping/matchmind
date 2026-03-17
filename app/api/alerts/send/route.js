// app/api/alerts/send/route.js
// Daily prediction broadcaster — sends alerts to Telegram subscribers
// Triggered by Vercel cron at 07:00 UTC or manually
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { sendMessage, formatDailyDigest, formatPrediction } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const DELAY_BETWEEN_MESSAGES = 50 // ms — respect Telegram rate limits (30 msgs/sec)

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET() {
  return POST()
}

export async function POST() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 })
    }

    const db = getServiceClient()
    const today = new Date().toISOString().split('T')[0]
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    // Fetch today's top predictions (global — not user-specific)
    // Use the highest-confidence ones that have been generated
    const { data: predictions } = await db
      .from('predictions')
      .select('home_team, away_team, league, outcome, confidence, risk, top_scoreline, expected_home_goals, expected_away_goals, btts_confidence, over25_confidence, summary, tier')
      .gte('match_date', today)
      .order('confidence', { ascending: false })
      .limit(20)

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        sent: 0,
        message: 'No predictions available today — skipping broadcast',
      })
    }

    // Deduplicate by match (keep highest confidence per match)
    const seen = new Set()
    const uniquePredictions = []
    for (const p of predictions) {
      const key = `${p.home_team}-${p.away_team}`
      if (!seen.has(key)) {
        seen.add(key)
        uniquePredictions.push(p)
      }
    }

    // Fetch active subscribers
    const { data: subscribers } = await db
      .from('telegram_subscribers')
      .select('chat_id, plan, user_id')
      .eq('is_active', true)

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No active subscribers' })
    }

    let sent = 0
    let failed = 0

    for (const sub of subscribers) {
      try {
        // Determine how many predictions to send based on plan
        let userPlan = sub.plan || 'free'

        // If linked to a MatchMind account, check their actual plan
        if (sub.user_id) {
          const { data: profile } = await db
            .from('users')
            .select('plan')
            .eq('id', sub.user_id)
            .single()
          if (profile) userPlan = profile.plan
        }

        let predsToSend
        if (userPlan === 'elite') {
          predsToSend = uniquePredictions.slice(0, 8) // Elite: top 8
        } else if (userPlan === 'pro') {
          predsToSend = uniquePredictions.slice(0, 5) // Pro: top 5
        } else {
          predsToSend = uniquePredictions.slice(0, 3) // Free: top 3 (teaser)
        }

        const message = formatDailyDigest(predsToSend, dateStr)

        // Add upgrade CTA for free users
        let finalMessage = message
        if (userPlan === 'free') {
          finalMessage += `\n\n🔓 <b>Want all predictions?</b> Upgrade to Pro at matchmind.app/billing`
        }

        await sendMessage(sub.chat_id, finalMessage)
        sent++

        await sleep(DELAY_BETWEEN_MESSAGES)

      } catch (err) {
        console.error(`[Alerts] Failed to send to ${sub.chat_id}:`, err.message)
        failed++

        // If blocked by user, deactivate
        if (err.message?.includes('bot was blocked') || err.message?.includes('chat not found')) {
          await db
            .from('telegram_subscribers')
            .update({ is_active: false })
            .eq('chat_id', sub.chat_id)
        }
      }
    }

    // Log broadcast
    await db.from('alert_logs').insert({
      type: 'telegram_daily',
      date: today,
      sent,
      failed,
      predictions_count: uniquePredictions.length,
    }).catch(() => {}) // Non-critical

    console.log(`[Alerts] Broadcast complete: ${sent} sent, ${failed} failed`)

    return NextResponse.json({
      sent,
      failed,
      total_subscribers: subscribers.length,
      predictions_sent: uniquePredictions.length,
      date: today,
    })

  } catch (err) {
    console.error('[Alerts] Broadcast error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
