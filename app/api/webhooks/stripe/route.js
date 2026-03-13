import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getServiceClient } from '@/lib/supabase'

export async function POST(req) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = getServiceClient()

  switch (event.type) {

    // Subscription started or renewed
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const userId = sub.metadata?.userId
      const plan = sub.metadata?.plan || 'pro'

      if (!userId) break

      await db.from('users').update({
        plan,
        token_balance: 999999, // effectively unlimited
      }).eq('id', userId)

      await db.from('subscriptions').upsert({
        user_id: userId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        plan,
        status: sub.status,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      }, { onConflict: 'stripe_subscription_id' })

      await db.from('token_transactions').insert({
        user_id: userId,
        amount: 999999,
        type: 'subscription_grant',
        reference: sub.id
      })

      break
    }

    // Subscription cancelled
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const userId = sub.metadata?.userId
      if (!userId) break

      await db.from('users').update({
        plan: 'free',
        token_balance: 1, // give 1 token to free tier
      }).eq('id', userId)

      await db.from('subscriptions').update({
        status: 'canceled'
      }).eq('stripe_subscription_id', sub.id)

      break
    }

    // One-time token pack purchase
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'payment') break

      const userId = session.metadata?.userId
      const tokens = parseInt(session.metadata?.tokens || '0', 10)

      if (!userId || !tokens) break

      // Add tokens to user
      const { data: user } = await db
        .from('users')
        .select('token_balance')
        .eq('id', userId)
        .single()

      await db.from('users').update({
        token_balance: (user?.token_balance || 0) + tokens
      }).eq('id', userId)

      await db.from('token_transactions').insert({
        user_id: userId,
        amount: tokens,
        type: 'purchase',
        reference: session.payment_intent
      })

      break
    }

    // Payment failed — notify user
    case 'invoice.payment_failed': {
      console.log('Payment failed for invoice:', event.data.object.id)
      // TODO: Send email via Resend
      break
    }

    default:
      console.log('Unhandled webhook event:', event.type)
  }

  return NextResponse.json({ received: true })
}
