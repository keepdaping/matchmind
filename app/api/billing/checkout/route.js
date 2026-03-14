import { NextResponse } from 'next/server'
import { createSubscriptionCheckout, createTokenPackCheckout, PLANS, TOKEN_PACKS } from '@/lib/stripe'
import { getServiceClient } from '@/lib/supabase'

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
    const { type, plan, packId } = await req.json()

    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (type === 'subscription') {
      const planConfig = PLANS[plan]
      if (!planConfig) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

      const url = await createSubscriptionCheckout(user.id, user.email, planConfig.price_id, plan)
      return NextResponse.json({ url })
    }

    if (type === 'tokens') {
      const pack = TOKEN_PACKS.find(p => p.id === packId)
      if (!pack) return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })

      const url = await createTokenPackCheckout(user.id, user.email, pack)
      return NextResponse.json({ url })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  } catch (err) {
    console.error('Checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
