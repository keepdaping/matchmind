// app/api/alerts/link/route.js
// Generate a one-time Telegram link code for connecting accounts
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

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
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()
  const code = crypto.randomBytes(4).toString('hex') // 8-char hex code

  // Expire any previous unused codes for this user
  await db
    .from('telegram_links')
    .update({ used: true })
    .eq('user_id', user.id)
    .eq('used', false)

  // Create new code
  const { error } = await db
    .from('telegram_links')
    .insert({ user_id: user.id, code })

  if (error) {
    return NextResponse.json({ error: 'Failed to generate link code' }, { status: 500 })
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'MatchMindBot'

  return NextResponse.json({
    code,
    command: `/link ${code}`,
    bot_url: `https://t.me/${botUsername}`,
    instructions: `1. Open @${botUsername} on Telegram\n2. Send: /link ${code}\n3. Done — you'll get personalized alerts!`,
    expires: '15 minutes',
  })
}
