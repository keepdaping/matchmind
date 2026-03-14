'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function PredictionPage({ params }) {
  const router = useRouter()
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!user) { router.push('/login'); return }

        const { data, error: queryError } = await supabase
          .from('predictions')
          .select('*')
          .eq('id', params.id)
          .single()

        if (queryError || !data) {
          router.push('/dashboard')
          return
        }
        setPrediction(data)
      } catch (err) {
        console.error('Prediction page load error:', err)
        setError('Unable to load prediction. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.id, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-brand-500 animate-pulse">Loading prediction...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-red-400 font-semibold mb-2">{error}</div>
          <button onClick={() => router.push('/dashboard')}
            className="mt-3 bg-brand-500 hover:bg-brand-700 text-white py-2 px-4 rounded-lg">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  if (!prediction) return null

  const confColor = prediction.confidence >= 80 ? '#1D9E75' :
    prediction.confidence >= 65 ? '#EF9F27' : '#E24B4A'

  const riskStyle = {
    Low:    'text-green-400 bg-green-900/30 border-green-500/20',
    Medium: 'text-amber-400 bg-amber-900/30 border-amber-500/20',
    High:   'text-red-400 bg-red-900/30 border-red-500/20',
  }[prediction.risk] || 'text-gray-400 bg-gray-900/30'

  function share() {
    const text = `MatchMind AI Prediction:\n${prediction.home_team} vs ${prediction.away_team}\nPrediction: ${prediction.outcome} (${prediction.confidence}% confidence)\n\nGet your edge: ${window.location.origin}`
    if (navigator.share) {
      navigator.share({ title: 'MatchMind Prediction', text })
    } else {
      navigator.clipboard.writeText(text)
      alert('Prediction copied to clipboard!')
    }
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="font-bold text-lg">Match<span className="text-brand-500">Mind</span></Link>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">← All predictions</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Match header */}
        <div className="text-center mb-8">
          <div className="text-xs text-brand-500 font-medium mb-2 uppercase tracking-wider">{prediction.league}</div>
          <h1 className="text-3xl font-bold mb-1">{prediction.home_team}</h1>
          <div className="text-gray-500 my-2">vs</div>
          <h1 className="text-3xl font-bold mb-3">{prediction.away_team}</h1>
          <div className="text-sm text-gray-400">
            {prediction.match_date ? new Date(prediction.match_date).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Match date TBC'}
          </div>
        </div>

        {/* Main prediction */}
        <div className="glass rounded-2xl p-6 mb-5 glow text-center">
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">MatchMind predicts</div>
          <div className="text-3xl font-bold text-brand-500 mb-3">{prediction.outcome}</div>
          <div className="text-6xl font-bold mb-1" style={{ color: confColor }}>
            {prediction.confidence}%
          </div>
          <div className="text-sm text-gray-400 mb-4">confidence score</div>

          <div className="w-full bg-white/10 rounded-full h-2 mb-4">
            <div className="h-2 rounded-full transition-all"
              style={{ width: `${prediction.confidence}%`, background: confColor }} />
          </div>

          <div className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border ${riskStyle}`}>
            {prediction.risk} Risk
          </div>
        </div>

        {/* Summary */}
        <div className="glass rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">AI Summary</h2>
          <p className="text-gray-300 leading-relaxed">{prediction.summary}</p>
        </div>

        {/* Reasons */}
        <div className="glass rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Key Reasons</h2>
          <div className="space-y-3">
            {(prediction.reasons || []).map((reason, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{reason}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="glass rounded-2xl p-4 text-center">
            <div className="text-xs text-gray-400 mb-1">Both Teams Score</div>
            <div className="text-2xl font-bold" style={{ color: confColor }}>{prediction.btts_confidence}%</div>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <div className="text-xs text-gray-400 mb-1">Over 2.5 Goals</div>
            <div className="text-2xl font-bold" style={{ color: confColor }}>{prediction.over25_confidence}%</div>
          </div>
        </div>

        {/* Key stat */}
        {prediction.key_stat && (
          <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl p-4 mb-5">
            <div className="text-xs text-brand-500 font-medium mb-1 uppercase tracking-wider">Key Stat</div>
            <p className="text-sm text-brand-100">{prediction.key_stat}</p>
          </div>
        )}

        {/* Watch out */}
        {prediction.watch_out && (
          <div className="bg-amber-900/20 border border-amber-500/20 rounded-2xl p-4 mb-8">
            <div className="text-xs text-amber-500 font-medium mb-1 uppercase tracking-wider">Watch Out</div>
            <p className="text-sm text-amber-200">{prediction.watch_out}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={share}
            className="flex-1 glass hover:bg-white/10 border border-white/10 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
            Share Prediction
          </button>
          <Link href="/dashboard"
            className="flex-1 bg-brand-500 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm text-center">
            More Predictions
          </Link>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          MatchMind is for informational purposes only. Please gamble responsibly.
        </p>
      </div>
    </div>
  )
}
