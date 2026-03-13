import { NextResponse } from 'next/server'
import { createSubscriptionCheckout, createTokenPackCheckout, PLANS, TOKEN_PACKS } from '@/lib/stripe'
import { getServiceClient } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

export async function POST(req) {
  try {
    const { type, plan, packId } = await req.json()

    // Extract access token from auth header (Bearer token)
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.split(' ')[1] || ''

    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const db = getServiceClient()
    const { data: { user }, error } = await db.auth.getUser(token)

    if (error || !user) {
      console.warn('Billing checkout auth failed', { errorMessage: error?.message, token: token ? '[REDACTED]' : null })
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
