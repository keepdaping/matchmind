'use client'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const PLANS = [
  {
    id: 'free', name: 'Free', price: '$0', period: 'forever',
    features: ['1 prediction/day', 'Top match only', '3-day streak', 'Public leaderboard'],
    cta: 'Current Plan', featured: false
  },
  {
    id: 'pro', name: 'Pro', price: '$7', period: '/month',
    features: ['All daily predictions', '10+ leagues', 'Accumulator builder', 'Full streak + badges', 'WhatsApp alerts'],
    cta: 'Upgrade to Pro', featured: true
  },
  {
    id: 'elite', name: 'Elite', price: '$18', period: '/month',
    features: ['Everything in Pro', 'Deep match analysis', 'Early predictions (6am)', 'API access', 'Priority support'],
    cta: 'Upgrade to Elite', featured: false
  },
]

const TOKEN_PACKS = [
  { id: 'tokens_10',  label: '10 predictions',  tokens: 10,  price: '$1' },
  { id: 'tokens_50',  label: '50 predictions',  tokens: 50,  price: '$4' },
  { id: 'tokens_200', label: '200 predictions', tokens: 200, price: '$12' },
]

export default function BillingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BillingContent />
    </Suspense>
  )
}

function BillingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  const upgraded = searchParams.get('upgraded')
  const tokensAdded = searchParams.get('tokens_added')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
      setProfile({ ...data, email: user.email })
    }
    load()
  }, [])

  async function handleUpgrade(planId) {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Not signed in')

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ type: 'subscription', plan: planId })
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch (e) {
      alert('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTokenPack(packId) {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Not signed in')

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ type: 'tokens', packId })
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch (e) {
      alert('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const tokenDisplay = profile?.token_balance >= 999990 ? '∞' : profile?.token_balance ?? 0

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="font-bold text-lg">Match<span className="text-brand-500">Mind</span></Link>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">← Back to predictions</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Billing & Predictions</h1>
        <p className="text-gray-400 text-sm mb-8">Manage your plan and top up predictions.</p>

        {/* Success banners */}
        {upgraded && (
          <div className="bg-brand-500/20 border border-brand-500/30 rounded-xl p-4 mb-6 text-sm text-brand-200">
            🎉 Welcome to Pro! Your predictions are now unlocked.
          </div>
        )}
        {tokensAdded && (
          <div className="bg-brand-500/20 border border-brand-500/30 rounded-xl p-4 mb-6 text-sm text-brand-200">
            ⚡ Tokens added to your account! Go make some picks.
          </div>
        )}

        {/* Current status */}
        {profile && (
          <div className="glass rounded-2xl p-6 mb-8 flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-gray-400 mb-1">Current plan</div>
              <div className="text-lg font-bold capitalize">{profile.plan}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Predictions remaining</div>
              <div className="text-lg font-bold text-brand-500">{tokenDisplay}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Current streak</div>
              <div className="text-lg font-bold">🔥 {profile.streak || 0} days</div>
            </div>
          </div>
        )}

        {/* Subscription plans */}
        <h2 className="text-lg font-semibold mb-4">Subscription Plans</h2>
        <div className="grid md:grid-cols-3 gap-5 mb-10">
          {PLANS.map(plan => (
            <div key={plan.id} className={`rounded-2xl p-5 relative ${plan.featured ? 'bg-brand-500/10 border-2 border-brand-500' : 'glass'}`}>
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                  POPULAR
                </div>
              )}
              <div className="text-sm text-gray-400 mb-1">{plan.name}</div>
              <div className="text-3xl font-bold mb-0.5">{plan.price}</div>
              <div className="text-xs text-gray-500 mb-5">{plan.period}</div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-brand-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              {plan.id === profile?.plan ? (
                <div className="text-center text-xs text-gray-500 py-2.5">Current plan</div>
              ) : plan.id === 'free' ? (
                <div className="text-center text-xs text-gray-500 py-2.5">Downgrade available anytime</div>
              ) : (
                <button onClick={() => handleUpgrade(plan.id)} disabled={loading}
                  className={`w-full font-semibold py-2.5 rounded-xl transition-colors text-sm ${
                    plan.featured ? 'bg-brand-500 hover:bg-brand-700 text-white' : 'glass hover:bg-white/10 text-white border border-white/10'
                  } disabled:opacity-50`}>
                  {loading ? '...' : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Token packs */}
        <h2 className="text-lg font-semibold mb-2">Token Top-ups</h2>
        <p className="text-sm text-gray-400 mb-4">No subscription needed. Tokens never expire.</p>
        <div className="grid grid-cols-3 gap-4">
          {TOKEN_PACKS.map(pack => (
            <div key={pack.id} className="glass rounded-2xl p-5 text-center">
              <div className="text-2xl font-bold text-brand-500 mb-1">{pack.price}</div>
              <div className="text-sm font-medium mb-0.5">{pack.label}</div>
              <div className="text-xs text-gray-500 mb-4">{(pack.tokens)} prediction unlocks</div>
              <button onClick={() => handleTokenPack(pack.id)} disabled={loading}
                className="w-full bg-white/5 hover:bg-brand-500/20 border border-white/10 hover:border-brand-500/30 text-white text-xs font-semibold py-2 rounded-xl transition-all disabled:opacity-50">
                {loading ? '...' : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
