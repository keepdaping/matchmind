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
  }, [router])

  async function handleUpgrade(planId) {
    setLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()

      // If the session is expired, attempt to refresh it so we have a valid access token.
      if (!session?.access_token) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession()
        session = refreshed
      }

      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Could not get access token. Please sign in again.')

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ type: 'subscription', plan: planId })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Checkout failed')
      }

      if (data.url) window.location.href = data.url
    } catch (e) {
      alert(e.message || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTokenPack(packId) {
    setLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()

      // If the session is expired, attempt to refresh it so we have a valid access token.
      if (!session?.access_token) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession()
        session = refreshed
      }

      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Could not get access token. Please sign in again.')

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ type: 'tokens', packId })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Checkout failed')
      }

      if (data.url) window.location.href = data.url
    } catch (e) {
      alert(e.message || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const [apiKeys, setApiKeys] = useState([])
  const [apiKeyLoading, setApiKeyLoading] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyResult, setNewKeyResult] = useState(null)
  const [copiedKey, setCopiedKey] = useState(false)

  const isElite = profile?.plan === 'elite'

  // Fetch API keys when profile loads
  useEffect(() => {
    async function fetchKeys() {
      if (!isElite) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch('/api/v1/keys', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.keys) setApiKeys(data.keys)
      } catch {}
    }
    if (profile) fetchKeys()
  }, [profile, isElite])

  async function handleCreateKey() {
    setApiKeyLoading(true)
    setNewKeyResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expired')
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newKeyName || 'My Key' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewKeyResult(data.key)
      setNewKeyName('')
      // Refresh key list
      const listRes = await fetch('/api/v1/keys', { headers: { Authorization: `Bearer ${token}` } })
      const listData = await listRes.json()
      if (listData.keys) setApiKeys(listData.keys)
    } catch (e) {
      alert(e.message)
    } finally {
      setApiKeyLoading(false)
    }
  }

  async function handleRevokeKey(keyId) {
    if (!confirm('Revoke this API key? Any apps using it will stop working.')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expired')
      const res = await fetch('/api/v1/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key_id: keyId }),
      })
      if (!res.ok) throw new Error('Failed to revoke')
      setApiKeys(prev => prev.filter(k => k.id !== keyId))
    } catch (e) {
      alert(e.message)
    }
  }

  function copyKey(key) {
    navigator.clipboard.writeText(key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 3000)
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

        {/* Elite API Keys */}
        {isElite && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold mb-2">API Access</h2>
            <p className="text-sm text-gray-400 mb-4">Use your API key to access MatchMind predictions programmatically. Max 3 keys, 100 requests/hour.</p>

            {/* Create new key */}
            <div className="glass rounded-2xl p-5 mb-4">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-400 mb-1.5">Key name</label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    placeholder="e.g. My Telegram Bot"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
                <button onClick={handleCreateKey} disabled={apiKeyLoading}
                  className="bg-brand-500 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap">
                  {apiKeyLoading ? 'Creating...' : 'Generate API Key'}
                </button>
              </div>

              {/* Newly created key (show once) */}
              {newKeyResult && (
                <div className="mt-4 bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
                  <div className="text-xs text-brand-500 font-bold mb-2">Save this key now — you won't see it again!</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-brand-200 bg-black/30 px-3 py-1.5 rounded-lg flex-1 overflow-x-auto">
                      {newKeyResult.key}
                    </code>
                    <button onClick={() => copyKey(newKeyResult.key)}
                      className="text-xs bg-brand-500 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                      {copiedKey ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-gray-400">
                    <span className="text-gray-300 font-medium">Quick test:</span>{' '}
                    <code className="text-gray-500">curl -H &quot;X-API-Key: {newKeyResult.key}&quot; https://matchmind.app/api/v1/matches</code>
                  </div>
                </div>
              )}
            </div>

            {/* Existing keys */}
            {apiKeys.length > 0 && (
              <div className="space-y-3">
                {apiKeys.map(k => (
                  <div key={k.id} className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{k.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <code>{k.key_preview}</code> · {k.requests_today || 0} requests today ·{' '}
                        {k.is_active
                          ? <span className="text-brand-500">Active</span>
                          : <span className="text-red-400">Revoked</span>
                        }
                      </div>
                    </div>
                    {k.is_active && (
                      <button onClick={() => handleRevokeKey(k.id)}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* API docs summary */}
            <div className="glass rounded-xl p-5 mt-4">
              <div className="text-sm font-semibold mb-3">Endpoints</div>
              <div className="space-y-2 text-xs text-gray-400">
                <div><code className="text-brand-200">GET /api/v1/matches</code> — Today's fixtures</div>
                <div><code className="text-brand-200">GET /api/v1/predictions</code> — Your predictions</div>
                <div><code className="text-brand-200">GET /api/v1/predictions?match_id=X</code> — Predict a specific match</div>
                <div><code className="text-brand-200">GET /api/v1/accumulator</code> — Daily AI accumulator</div>
                <div><code className="text-brand-200">GET /api/v1/keys</code> — Manage API keys</div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Pass your key as <code>X-API-Key</code> header or <code>Authorization: Bearer &lt;key&gt;</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
