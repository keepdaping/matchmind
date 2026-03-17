// lib/telegram.js
// Telegram Bot helper for MatchMind alerts
// Requires TELEGRAM_BOT_TOKEN env var (get from @BotFather)

const TELEGRAM_API = 'https://api.telegram.org/bot'

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set')
  return token
}

/**
 * Send a message to a Telegram chat.
 */
export async function sendMessage(chatId, text, options = {}) {
  const token = getToken()
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options,
    }),
  })
  const data = await res.json()
  if (!data.ok) {
    console.error('[Telegram] Send failed:', data.description)
  }
  return data
}

/**
 * Set the webhook URL for the bot.
 * Call once after deploy: GET /api/alerts/telegram?setup=true
 */
export async function setWebhook(url) {
  const token = getToken()
  const res = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return res.json()
}

/**
 * Format a prediction for Telegram message.
 */
export function formatPrediction(p) {
  const confEmoji = p.confidence >= 80 ? '🟢' : p.confidence >= 65 ? '🟡' : '🔴'
  const riskEmoji = p.risk === 'Low' ? '🛡️' : p.risk === 'Medium' ? '⚡' : '🔥'

  let msg = `${confEmoji} <b>${p.home_team} vs ${p.away_team}</b>\n`
  msg += `🏆 ${p.league}\n`
  msg += `━━━━━━━━━━━━━━━\n`
  msg += `📊 <b>Prediction:</b> ${p.outcome}\n`
  msg += `🎯 <b>Confidence:</b> ${p.confidence}%\n`
  msg += `${riskEmoji} <b>Risk:</b> ${p.risk}\n`

  if (p.top_scoreline) {
    msg += `⚽ <b>Scoreline:</b> ${p.top_scoreline}\n`
  }

  if (p.expected_home_goals != null && p.expected_away_goals != null) {
    msg += `📈 <b>xG:</b> ${p.expected_home_goals} – ${p.expected_away_goals}\n`
  }

  if (p.btts_confidence) {
    msg += `🔄 <b>BTTS:</b> ${p.btts_confidence}% | <b>O2.5:</b> ${p.over25_confidence}%\n`
  }

  if (p.summary) {
    msg += `\n💬 <i>${p.summary}</i>\n`
  }

  return msg
}

/**
 * Format daily digest of multiple predictions.
 */
export function formatDailyDigest(predictions, date) {
  let msg = `🧠 <b>MatchMind Daily Predictions</b>\n`
  msg += `📅 ${date}\n`
  msg += `━━━━━━━━━━━━━━━━━━━\n\n`

  for (const p of predictions.slice(0, 8)) {
    msg += formatPrediction(p)
    msg += `\n`
  }

  msg += `━━━━━━━━━━━━━━━━━━━\n`
  msg += `🔗 Full analysis: matchmind.app/dashboard\n`
  msg += `\n<i>MatchMind — Your edge before kickoff.</i>`

  return msg
}

/**
 * Format accumulator for Telegram.
 */
export function formatAccumulator(accumulator) {
  let msg = `🎯 <b>MatchMind AI Accumulator</b>\n`
  msg += `━━━━━━━━━━━━━━━━━━━\n\n`

  for (const [i, sel] of (accumulator.selections || []).entries()) {
    msg += `<b>${i + 1}.</b> ${sel.match}\n`
    msg += `   📌 ${sel.pick} @ ${sel.estimated_odds}\n`
    msg += `   🎯 ${sel.confidence}% confidence\n\n`
  }

  msg += `━━━━━━━━━━━━━━━━━━━\n`
  msg += `💰 <b>Combined odds:</b> ${accumulator.estimated_combined_odds}x\n`
  msg += `📊 <b>Overall confidence:</b> ${accumulator.overall_confidence}%\n`
  msg += `💵 ${accumulator.potential_return_example}\n`
  msg += `🔒 <b>Banker:</b> ${accumulator.banker}\n`
  msg += `\n⚠️ ${accumulator.risk_warning}`

  return msg
}
