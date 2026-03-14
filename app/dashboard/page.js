'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const LEAGUES = ['All', 'Premier League', 'Uganda Premier League', 'Kenya Premier League', 'Champions League', 'La Liga', 'Serie A', 'NPFL Nigeria']

function PredictionCard({ fixture, userId, userPlan, tokenBalance, onUnlock }) {
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [unlocked, setUnlocked] = useState(false)

  const isFreeUser = userPlan === 'free'
  const isLocked = isFreeUser && (tokenBalance ?? 0) <= 0
  const confColor = prediction?.confidence >= 80 ? '#1D9E75' :
    prediction?.confidence >= 65 ? '#EF9F27' : '#E24B4A'

  const riskStyle = {
    Low:    'text-green-400 bg-green-900/30',
    Medium: 'text-amber-400 bg-amber-900/30',
    High:   'text-red-400 bg-red-900/30',
  }

  async function unlock() {
    setLoading(true)
    setError(null)

    if (!userId) {
      setError('You must be signed in to unlock predictions.')
      setLoading(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expired, please sign in again.')

      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          matchId: fixture.id,
          matchData: {
            home_team: fixture.home_team,
            away_team: fixture.away_team,
            league: fixture.league,
            date: fixture.date,
          },
        })
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (data?.code === 'NO_TOKENS') {
          setError('no_tokens')
        } else {
          setError(data?.error || 'Failed to generate prediction')
        }
        return
      }

      if (!data || !data.prediction) {
        throw new Error('Unexpected API response')
      }

      setPrediction(data.prediction)
      setUnlocked(true)
      onUnlock?.()
    } catch (e) {
      console.error('Prediction unlock error:', e)
      setError(e.message || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const time = fixture.date ? new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBC'

  return (
    <div className="glass rounded-2xl overflow-hidden relative">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="text-xs text-brand-500 font-medium mb-1">{fixture.league}</div>
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">{fixture.home_team} vs {fixture.away_team}</div>
          <div className="text-xs text-gray-500">{time}</div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 relative">
        {!prediction && !loading && (
          <div className={isLocked ? 'paywall-blur' : ''}>
            <div className="h-24 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl mb-1">⚽</div>
                <div className="text-xs text-gray-500">Click to generate prediction</div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="h-24 flex items-center justify-center">
            <div className="text-center">
              <div className="text-xs text-brand-500 mb-2 animate-pulse">AI analysing match data...</div>
              <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden mx-auto">
                <div className="h-full bg-brand-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        )}

        {prediction && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 flex-1 mr-3">
                <div className="text-xs text-gray-400 mb-0.5">MatchMind picks</div>
                <div className="font-bold text-brand-200 text-sm">{prediction.outcome}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: confColor }}>{prediction.confidence}%</div>
                <div className="text-xs text-gray-400">confidence</div>
              </div>
            </div>

            <p className="text-xs text-gray-300 mb-3 leading-relaxed">{prediction.summary}</p>

            <div className="space-y-1 mb-3">
              {prediction.reasons?.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                  <span className="text-brand-500 flex-shrink-0 mt-0.5">›</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskStyle[prediction.risk] || riskStyle.Medium}`}>
                {prediction.risk} Risk
              </span>
              <span className="text-xs text-gray-500">BTTS {prediction.btts_confidence}%</span>
              <span className="text-xs text-gray-500">O2.5 {prediction.over25_confidence}%</span>
            </div>

            {prediction.watch_out && (
              <div className="mt-3 bg-amber-900/20 border border-amber-500/20 rounded-lg px-3 py-2">
                <div className="text-xs text-amber-400"><span className="font-medium">Watch out:</span> {prediction.watch_out}</div>
              </div>
            )}
          </div>
        )}

        {/* Lock overlay */}
        {isLocked && !loading && !prediction && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0f0d]/80 rounded-2xl">
            <div className="text-2xl mb-2">🔒</div>
            <div className="text-xs text-gray-300 font-medium mb-3">Pro Prediction</div>
            <Link href="/billing?upgrade=pro" className="bg-brand-500 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
              Unlock with Pro — $7/mo
            </Link>
          </div>
        )}

        {/* No tokens overlay */}
        {error === 'no_tokens' && (
          <div className="mt-3 bg-red-900/20 border border-red-500/20 rounded-lg px-3 py-2.5 text-center">
            <div className="text-xs text-red-400 mb-2">No predictions remaining</div>
            <Link href="/billing" className="text-xs bg-brand-500 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg transition-colors">
              Get more predictions
            </Link>
          </div>
        )}

        {error && error !== 'no_tokens' && (
          <div className="mt-2 text-xs text-red-400">{error}</div>
        )}

        {!prediction && !loading && !isLocked && (
          <button onClick={unlock}
            className="mt-3 w-full bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-200 text-xs font-semibold py-2.5 rounded-xl transition-colors">
            Generate Prediction → (1 token)
          </button>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [fixtures, setFixtures] = useState([])
  const [league, setLeague] = useState('All')
  const [loadingFixtures, setLoadingFixtures] = useState(true)
  const [streak, setStreak] = useState(0)
  const [pageError, setPageError] = useState(null)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    async function init() {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!authUser) { router.push('/login'); return }
        setUser(authUser)

        // Fetch user profile
        const { data: prof, error: profError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single()
        if (profError) throw profError
        setProfile(prof)

        // Update streak
        if (prof) {
          const lastVisit = prof.last_visit_date
          const today = new Date().toISOString().split('T')[0]
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

          if (lastVisit !== today) {
            const newStreak = lastVisit === yesterday ? (prof.streak || 0) + 1 : 1
            setStreak(newStreak)
            await supabase.from('users').update({
              last_visit_date: today,
              streak: newStreak,
            }).eq('id', authUser.id)
          } else {
            setStreak(prof.streak || 1)
          }
        }

        // Fetch fixtures
        setLoadingFixtures(true)
        const res = await fetch(`/api/matches?league=${league}`)
        const data = await res.json().catch(() => ({}))
        setFixtures(data.fixtures || [])
      } catch (err) {
        console.error('Dashboard init error:', err)
        setPageError('Unable to load predictions. Please refresh or try again later.')
      } finally {
        setLoadingFixtures(false)
      }
    }

    init()
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    async function fetchFixtures() {
      setLoadingFixtures(true)
      const res = await fetch(`/api/matches?league=${encodeURIComponent(league)}`)
      const data = await res.json()
      setFixtures(data.fixtures || [])
      setLoadingFixtures(false)
    }
    if (user) fetchFixtures()
  }, [league, user])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const tokenDisplay = profile?.token_balance >= 999990
    ? '∞'
    : profile?.token_balance ?? 0

  return (
    <div className="min-h-screen">
      {/* Top nav */}
      <nav className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-bold text-lg">Match<span className="text-brand-500">Mind</span></div>

          <div className="flex items-center gap-4">
            {/* Streak */}
            {streak > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <span>🔥</span>
                <span className="font-semibold text-amber-400">{streak}</span>
                <span className="text-xs text-gray-400 hidden sm:block">day streak</span>
              </div>
            )}

            {/* Tokens */}
            <div className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-sm">
              <span className="text-brand-500">⚡</span>
              <span className="font-semibold">{tokenDisplay}</span>
              <span className="text-xs text-gray-400 hidden sm:block">predictions</span>
            </div>

            <Link href="/billing" className="text-xs text-gray-400 hover:text-white transition-colors hidden sm:block">
              {profile?.plan === 'free' ? '⬆ Upgrade' : `${profile?.plan} plan`}
            </Link>

            <button onClick={handleSignOut} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">
            Today’s Predictions
          </h1>
          <p className="text-gray-400 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {fixtures.length} matches found
          </p>
        </div>

        {/* Page-level error */}
        {pageError && (
          <div className="bg-red-900/40 border border-red-500/30 rounded-2xl p-4 mb-6 text-sm text-red-200">
            {pageError}
          </div>
        )}

        {/* Upgrade banner for free users */}
        {profile?.plan === 'free' && (
          <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sm mb-0.5">You’re on the free plan</div>
              <div className="text-xs text-gray-400">Unlock all predictions, 10+ leagues, and the accumulator builder.</div>
            </div>
            <Link href="/billing?upgrade=pro" className="bg-brand-500 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap">
              Upgrade to Pro — $7/mo
            </Link>
          </div>
        )}

        {/* League filter */}
        <div className="flex gap-2 flex-wrap mb-6 overflow-x-auto pb-2">
          {LEAGUES.map(l => (
            <button key={l} onClick={() => setLeague(l)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                league === l ? 'bg-brand-500 text-white' : 'glass text-gray-400 hover:text-white'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* Fixture grid */}
        {loadingFixtures ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="glass rounded-2xl h-48 shimmer" />
            ))}
          </div>
        ) : fixtures.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <div className="text-4xl mb-3">⚽</div>
            <div className="font-medium">No matches found for today</div>
            <div className="text-sm mt-1">Check back tomorrow or switch league</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {fixtures.map((fixture, i) => (
              <PredictionCard
                key={fixture.id || i}
                fixture={fixture}
                userId={user?.id}
                userPlan={profile?.plan || 'free'}
                tokenBalance={profile?.token_balance}
                onUnlock={() => setProfile(p => ({
                  ...p,
                  token_balance: Math.max(0, (p?.token_balance || 0) - 1)
                }))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
