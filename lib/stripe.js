import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
})

// Plan definitions — keep in sync with your Stripe dashboard
export const PLANS = {
  pro: {
    name: 'Pro',
    price_id: process.env.STRIPE_PRO_PRICE_ID,
    monthly_tokens: 999999, // unlimited effectively
    price: 7,
  },
  elite: {
    name: 'Elite',
    price_id: process.env.STRIPE_ELITE_PRICE_ID,
    monthly_tokens: 999999,
    price: 18,
  },
}

// Token packs
export const TOKEN_PACKS = [
  { id: 'tokens_10',  label: '10 predictions',  tokens: 10,  price: 1,  price_id: process.env.STRIPE_TOKENS_10_PRICE_ID },
  { id: 'tokens_50',  label: '50 predictions',  tokens: 50,  price: 4,  price_id: process.env.STRIPE_TOKENS_50_PRICE_ID },
  { id: 'tokens_200', label: '200 predictions', tokens: 200, price: 12, price_id: process.env.STRIPE_TOKENS_200_PRICE_ID },
]

// Create a Stripe Checkout session for subscription
export async function createSubscriptionCheckout(userId, userEmail, priceId, plan) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: userEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    metadata: { userId, plan },
    subscription_data: { metadata: { userId, plan } },
  })
  return session.url
}

// Create a Stripe Checkout session for token pack
export async function createTokenPackCheckout(userId, userEmail, pack) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: userEmail,
    line_items: [{ price: pack.price_id, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?tokens_added=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    metadata: { userId, tokens: pack.tokens, pack_id: pack.id },
  })
  return session.url
}
