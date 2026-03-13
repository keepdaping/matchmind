import { NextResponse } from 'next/server'
import { createSubscriptionCheckout, createTokenPackCheckout, PLANS, TOKEN_PACKS } from '@/lib/stripe'
import { getServiceClient } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

export async function POST(req) {
  try {
    const { type, plan, packId } = await req.json()

    // Get current user from Supabase auth header
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    // Use service client to verify
    const db = getServiceClient()

    // We rely on the client sending userId via cookie session
    // For production, use Supabase middleware to extract user from cookie
    // For now, we read it from the request body as a fallback
    const body2 = await req.text().catch(() => '{}')

    // Re-parse since we already parsed above — use a workaround
    const { data: { user } } = await db.auth.getUser(token)

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
