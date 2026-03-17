'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AccumulatorPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [accumulator, setAccumulator] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }
      setUser(authUser)
      const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setProfile(data)
    }
    init()
  }, [router])

  async function generateAccumulator() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expired, please sign in again.')

      const res = await fetch('/api/accumulator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAccumulator(data.accumulator)
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  function copySlip() {
    if (!accumulator) return
    const text = `🎯 MatchMind Elite Accumulator — ${new Date().toDateString()}
${accumulator.title}
Combined Odds: ${accumulator.estimated_combined_odds} | Confidence: ${accumulator.overall_confidence}%

SELECTIONS:
${accumulator.selections.map((s, i) =>
  `${i + 1}. ${s.match}\n   Pick: ${s.pick} @ ${s.estimated_odds}\n   ${s.reasoning}`
).join('\n\n')}

💰 ${accumulator.potential_return_example}
🔒 Banker: ${accumulator.banker}
⚠️ ${accumulator.risk_warning}

Powered by MatchMind Elite — matchmind.app`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const confColor = (c) => c >= 80 ? '#1D9E75' : c >= 65 ? '#EF9F27' : '#E24B4A'

  // Not Pro/Elite — show upgrade wall
  if (profile && !['pro', 'elite'].includes(profile.plan)) {
    return (
      <div className="min-h-screen">
        <nav className="sticky top-0 z-40 glass border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/dashboard" className="font-bold text-lg">Match<span className="text-brand-500">Mind</span></Link>
            <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">← Back</Link>
          </div>
        </nav>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl font-bold mb-3">Elite Feature</h1>
          <p className="text-gray-400 mb-3">The Daily AI Accumulator is exclusive to Elite members.</p>
          <p className="text-gray-400 mb-8 text-sm">Every day our AI scans all matches, picks the 3 highest-confidence selections, and builds a ready-made accumulator slip — straight to your betting app.</p>
          <div className="glass rounded-2xl p-6 mb-8 text-left space-y-3">
            {[
              '3 AI-selected matches daily — highest confidence picks only',
              'Combined odds between 5x and 12x',
              'Banker selection identified — your safest leg',
              'Copy slip directly to Betway, SportPesa, BetKing',
              'Tactical reasoning behind every selection',
              'Avoid market tip — what NOT to bet today',
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
                <span className="text-brand-500 font-bold">✓</span> {f}
              </div>
            ))}
          </div>
          <Link href="/billing?upgrade=elite"
            className="inline-block bg-brand-500 hover:bg-brand-700 text-white font-bold px-10 py-4 rounded-xl text-lg transition-all">
            Upgrade to Elite — $18/mo →
          </Link>
          <p className="text-xs text-gray-600 mt-4">Cancel anytime. Instant access after payment.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="font-bold text-lg">Match<span className="text-brand-500">Mind</span></Link>
            <span className="ml-2 text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full font-bold">ELITE</span>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">← All predictions</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-3">🎯</div>
          <h1 className="text-3xl font-bold mb-2">Daily AI Accumulator</h1>
          <p className="text-gray-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Our AI scans every match today and picks the 3 strongest selections for maximum value.
          </p>
        </div>

        {/* Generate button */}
        {!accumulator && (
          <div className="text-center mb-10">
            <button onClick={generateAccumulator} disabled={loading}
              className="bg-brand-500 hover:bg-brand-700 disabled:opacity-50 text-white font-bold px-10 py-4 rounded-xl text-lg transition-all glow">
              {loading ? (
                <span className="flex items-center gap-3">
                  <span className="animate-spin">⚽</span>
                  AI scanning today’s matches...
                </span>
              ) : 'Build Today’s Accumulator →'}
            </button>
            <p className="text-xs text-gray-500 mt-3">Takes about 10 seconds</p>
          </div>
        )}

        {/* Accumulator card */}
        {accumulator && (
          <div>
            {/* Header card */}
            <div className="glass rounded-2xl p-6 mb-5 glow text-center">
              <div className="text-xs text-brand-500 font-bold uppercase tracking-wider mb-2">Today’s Elite Slip</div>
              <h2 className="text-2xl font-bold mb-4">{accumulator.title}</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-3xl font-bold text-brand-500">{accumulator.estimated_combined_odds}x</div>
                  <div className="text-xs text-gray-400 mt-1">Combined odds</div>
                </div>
                <div>
                  <div className="text-3xl font-bold" style={{ color: confColor(accumulator.overall_confidence) }}>
                    {accumulator.overall_confidence}%
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Confidence</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-amber-400">3</div>
                  <div className="text-xs text-gray-400 mt-1">Selections</div>
                </div>
              </div>
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl px-4 py-2.5 text-sm text-brand-200 font-medium">
                💰 {accumulator.potential_return_example}
              </div>
            </div>

            {/* Selections */}
            <div className="space-y-4 mb-5">
              {accumulator.selections.map((sel, i) => (
                <div key={i} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{sel.league}</div>
                      <div className="font-bold">{sel.match}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xl font-bold" style={{ color: confColor(sel.confidence) }}>
                        {sel.confidence}%
                      </div>
                      <div className="text-xs text-gray-400">confidence</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-gray-400 mr-1">Pick:</span>
                      <span className="text-sm font-bold text-brand-200">{sel.pick}</span>
                    </div>
                    <div className="glass rounded-lg px-3 py-1.5">
                      <span className="text-xs text-gray-400 mr-1">Odds:</span>
                      <span className="text-sm font-bold text-amber-400">{sel.estimated_odds}</span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-400 leading-relaxed">{sel.reasoning}</p>
                </div>
              ))}
            </div>

            {/* Banker + insider */}
            <div className="grid md:grid-cols-2 gap-4 mb-5">
              <div className="bg-amber-900/20 border border-amber-500/20 rounded-2xl p-4">
                <div className="text-xs text-amber-500 font-bold uppercase mb-2">🔒 Banker Selection</div>
                <p className="text-sm text-amber-200">{accumulator.banker}</p>
              </div>
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl p-4">
                <div className="text-xs text-brand-500 font-bold uppercase mb-2">⚡ Elite Insider Note</div>
                <p className="text-sm text-brand-100">{accumulator.elite_note}</p>
              </div>
            </div>

            {/* Avoid */}
            {accumulator.avoid_market && (
              <div className="bg-red-900/20 border border-red-500/20 rounded-2xl p-4 mb-5">
                <div className="text-xs text-red-400 font-bold uppercase mb-2">⛔ Avoid Today</div>
                <p className="text-sm text-red-300">{accumulator.avoid_market}</p>
              </div>
            )}

            {/* Risk warning */}
            <div className="text-center text-xs text-gray-600 mb-6">{accumulator.risk_warning}</div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={copySlip}
                className={`flex-1 font-bold py-4 rounded-xl transition-all text-sm ${
                  copied
                    ? 'bg-brand-500 text-white'
                    : 'glass hover:bg-white/10 border border-white/10 text-white'
                }`}>
                {copied ? '✓ Copied to clipboard!' : '📋 Copy Slip'}
              </button>
              <button onClick={() => setAccumulator(null)}
                className="glass hover:bg-white/10 border border-white/10 text-white font-semibold px-6 py-4 rounded-xl transition-colors text-sm">
                Regenerate
              </button>
            </div>

            <p className="text-center text-xs text-gray-600 mt-4">
              Paste this slip directly into Betway, SportPesa, BetKing or any betting app.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
