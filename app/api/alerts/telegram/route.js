// app/api/alerts/telegram/route.js
// Telegram bot webhook — handles user commands
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { sendMessage, setWebhook } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const WELCOME_MSG = `🧠 <b>Welcome to MatchMind!</b>

I'll send you AI-powered football predictions every day before kickoff.

<b>Commands:</b>
/start — Subscribe to daily alerts
/stop — Unsubscribe
/today — Get today's top predictions
/acca — Get today's accumulator

🔗 Full dashboard: matchmind.app

<i>Predictions cover 28+ leagues including Premier League, La Liga, Uganda PL, Kenya PL, NPFL, and more.</i>`

const STOP_MSG = `✅ You've been unsubscribed from MatchMind alerts.

Send /start anytime to re-subscribe.`

// GET — Setup webhook (call once after deploy)
// Visit: /api/alerts/telegram?setup=true
export async function GET(req) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('setup') === 'true') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://matchmind.app'
    const webhookUrl = `${appUrl}/api/alerts/telegram`

    try {
      const result = await setWebhook(webhookUrl)
      return NextResponse.json({ message: 'Webhook set', result, url: webhookUrl })
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  return NextResponse.json({ status: 'Telegram webhook active' })
}

// POST — Handle incoming Telegram updates
export async function POST(req) {
  try {
    const update = await req.json()
    const message = update.message

    if (!message || !message.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat.id
    const text = message.text.trim().toLowerCase()
    const username = message.from?.username || null
    const firstName = message.from?.first_name || 'there'

    const db = getServiceClient()

    // /start — Subscribe
    if (text === '/start') {
      const { error } = await db
        .from('telegram_subscribers')
        .upsert({
          chat_id: String(chatId),
          username,
          first_name: firstName,
          is_active: true,
          plan: 'free',
          subscribed_at: new Date().toISOString(),
        }, { onConflict: 'chat_id' })

      if (error) console.error('[Telegram] Subscribe error:', error.message)

      await sendMessage(chatId, `Hey ${firstName}! 👋\n\n${WELCOME_MSG}`)
      return NextResponse.json({ ok: true })
    }

    // /stop — Unsubscribe
    if (text === '/stop') {
      await db
        .from('telegram_subscribers')
        .update({ is_active: false })
        .eq('chat_id', String(chatId))

      await sendMessage(chatId, STOP_MSG)
      return NextResponse.json({ ok: true })
    }

    // /today — Get today's predictions
    if (text === '/today') {
      const today = new Date().toISOString().split('T')[0]

      const { data: predictions } = await db
        .from('predictions')
        .select('home_team, away_team, league, outcome, confidence, risk, top_scoreline, expected_home_goals, expected_away_goals, btts_confidence, over25_confidence, summary')
        .gte('match_date', today)
        .order('confidence', { ascending: false })
        .limit(5)

      if (!predictions || predictions.length === 0) {
        await sendMessage(chatId, `📭 No predictions available yet today.\n\nPredictions are generated when matches are available. Check back later or visit matchmind.app/dashboard`)
        return NextResponse.json({ ok: true })
      }

      const { formatDailyDigest } = await import('@/lib/telegram')
      const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      await sendMessage(chatId, formatDailyDigest(predictions, dateStr))
      return NextResponse.json({ ok: true })
    }

    // /acca — Get accumulator
    if (text === '/acca') {
      await sendMessage(chatId, `🎯 To get today's accumulator, visit:\n🔗 matchmind.app/accumulator\n\n<i>Accumulator requires Pro or Elite plan.</i>`)
      return NextResponse.json({ ok: true })
    }

    // /link — Link Telegram to MatchMind account
    if (text.startsWith('/link')) {
      const parts = text.split(' ')
      const linkCode = parts[1]

      if (!linkCode) {
        await sendMessage(chatId, `To link your account, go to matchmind.app/dashboard, click "Connect Telegram", and paste the command shown there.\n\nFormat: /link YOUR_CODE`)
        return NextResponse.json({ ok: true })
      }

      // Look up pending link
      const { data: pending } = await db
        .from('telegram_links')
        .select('user_id')
        .eq('code', linkCode)
        .eq('used', false)
        .single()

      if (!pending) {
        await sendMessage(chatId, `❌ Invalid or expired link code. Generate a new one at matchmind.app/dashboard`)
        return NextResponse.json({ ok: true })
      }

      // Link the account
      await db
        .from('telegram_subscribers')
        .upsert({
          chat_id: String(chatId),
          username,
          first_name: firstName,
          is_active: true,
          user_id: pending.user_id,
          plan: 'linked',
        }, { onConflict: 'chat_id' })

      await db
        .from('telegram_links')
        .update({ used: true })
        .eq('code', linkCode)

      // Get user's plan
      const { data: profile } = await db
        .from('users')
        .select('plan')
        .eq('id', pending.user_id)
        .single()

      await sendMessage(chatId, `✅ <b>Account linked!</b>\n\nYou're connected as a <b>${profile?.plan || 'free'}</b> user. You'll now receive personalized predictions based on your plan.\n\n${profile?.plan === 'elite' ? '🌟 Elite alerts: full tactical breakdowns sent daily at 7am UTC.' : profile?.plan === 'pro' ? '⚡ Pro alerts: all match predictions sent daily at 7am UTC.' : '📊 Free alerts: top 3 predictions sent daily.'}`)
      return NextResponse.json({ ok: true })
    }

    // Unknown command
    await sendMessage(chatId, `Commands:\n/start — Subscribe\n/stop — Unsubscribe\n/today — Today's predictions\n/acca — Accumulator\n/link CODE — Link your MatchMind account`)

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[Telegram] Webhook error:', err)
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}
