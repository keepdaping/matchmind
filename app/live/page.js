'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const REFRESH_INTERVAL = 30000 // 30 seconds

function LiveBadge({ status, minute }) {
  const isLive = ['1H', '2H', 'ET', 'LIVE'].includes(status)
  const isHT = status === 'HT' || status === 'BT'
  const isFinished = ['FT', 'AET', 'PEN'].includes(status)

  if (isFinished) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-500/10 border border-gray-500/20 text-gray-400 font-medium">
        FT
      </span>
    )
  }

  if (isHT) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium">
        HT
      </span>
    )
  }

  if (isLive) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
        {minute ? `${minute}'` : 'LIVE'}
      </span>
    )
  }

  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-500 font-medium">
      {status}
    </span>
  )
}

function PredictionTracker({ prediction, currentOutcome, bttsLive, over25Live }) {
  if (!prediction) return null

  const isWinning = prediction.status === 'winning' || prediction.status === 'won'
  const isLost = prediction.status === 'lost'
  const isLosing = prediction.status === 'losing'

  const statusColor = isWinning ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : isLost ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : isLosing ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-gray-400 bg-white/5 border-white/10'

  const statusIcon = isWinning ? '✓' : isLost ? '✗' : isLosing ? '~' : '?'
  const statusLabel = prediction.status === 'won' ? 'Won' : prediction.status === 'lost' ? 'Lost' : isWinning ? 'Winning' : 'Losing'

  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-600">Your prediction</div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusColor}`}>
          {statusIcon} {statusLabel}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-xs">
          <span className="text-gray-500">Pick: </span>
          <span className="text-white font-semibold">{prediction.outcome}</span>
          <span className="text-gray-600 ml-1">({prediction.confidence}%)</span>
        </div>
        {prediction.top_scoreline && (
          <div className="text-xs">
            <span className="text-gray-500">Score: </span>
            <span className="text-white font-mono">{prediction.top_scoreline}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px]">
        <span className={bttsLive ? 'text-emerald-400' : 'text-gray-600'}>
          BTTS {bttsLive ? '✓' : '—'} ({prediction.btts_confidence}%)
        </span>
        <span className={over25Live ? 'text-emerald-400' : 'text-gray-600'}>
          O2.5 {over25Live ? '✓' : '—'} ({prediction.over25_confidence}%)
        </span>
      </div>
    </div>
  )
}

function EventFeed({ events }) {
  if (!events || events.length === 0) return null

  const eventIcon = (type) => {
    if (type === 'Goal') return '⚽'
    if (type === 'Card' ) return '🟨'
    if (type === 'subst') return '🔄'
    if (type === 'Var') return '📺'
    return '•'
  }

  return (
    <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
      {events.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="font-mono text-gray-600 w-6 text-right">{e.minute}'</span>
          <span>{eventIcon(e.type)}</span>
          <span className="text-gray-400">{e.player || e.detail}</span>
          <span className="text-gray-700">({e.team})</span>
        </div>
      ))}
    </div>
  )
}

function LiveMatchCard({ match }) {
  const isLive = ['1H', '2H', 'ET', 'LIVE'].includes(match.status)
  const isFinished = ['FT', 'AET', 'PEN'].includes(match.status)

  return (
    <div className={`glass-strong rounded-2xl overflow-hidden ${isLive ? 'border-glow' : ''}`}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-brand-500 font-semibold">{match.league}</span>
        <LiveBadge status={match.status} minute={match.minute} />
      </div>

      <div className="p-4">
        {/* Score */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex-1">
            <div className="text-sm font-semibold">{match.home_team}</div>
          </div>
          <div className="flex items-center gap-3 mx-4">
            <span className={`font-mono text-3xl font-bold ${isLive ? 'text-white' : 'text-gray-300'}`}>
              {match.home_goals}
            </span>
            <span className="text-gray-600 text-lg">:</span>
            <span className={`font-mono text-3xl font-bold ${isLive ? 'text-white' : 'text-gray-300'}`}>
              {match.away_goals}
            </span>
          </div>
          <div className="flex-1 text-right">
            <div className="text-sm font-semibold">{match.away_team}</div>
          </div>
        </div>

        {/* Minute bar */}
        {isLive && match.minute && (
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-red-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min((match.minute / 90) * 100, 100)}%` }} />
          </div>
        )}

        {/* Events */}
        <EventFeed events={match.events} />

        {/* Prediction tracker */}
        <PredictionTracker
          prediction={match.prediction}
          currentOutcome={match.current_outcome}
          bttsLive={match.btts_live}
          over25Live={match.over25_live}
        />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-4xl mb-4">📡</div>
      <div className="text-lg font-semibold mb-2">No live matches right now</div>
      <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
        Live scores appear here when matches in our 28 supported leagues kick off. Check back during game time.
      </p>
      <Link href="/dashboard" className="text-sm text-brand-500 hover:text-brand-200 transition-colors">
        &larr; View today's predictions
      </Link>
    </div>
  )
}

export default function LivePage() {
  const router = useRouter()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [countdown, setCountdown] = useState(30)

  const fetchLive = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {}
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }
      const res = await fetch('/api/live', { headers, cache: 'no-store' })
      const data = await res.json()
      setMatches(data.live || [])
      setLastUpdate(new Date().toLocaleTimeString())
      setCountdown(30)
    } catch (err) {
      console.error('Live fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLive()
    const interval = setInterval(fetchLive, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchLive])

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => (c <= 1 ? 30 : c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const liveCount = matches.filter(m => ['1H', '2H', 'ET', 'LIVE', 'HT', 'BT'].includes(m.status)).length
  const finishedCount = matches.filter(m => ['FT', 'AET', 'PEN'].includes(m.status)).length

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-bold text-lg tracking-tight">
              Match<span className="text-brand-500">Mind</span>
            </Link>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-red-400 font-semibold">LIVE</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[10px] text-gray-600 hidden sm:block">
              Refreshing in {countdown}s
            </div>
            <button onClick={fetchLive}
              className="text-xs text-gray-400 hover:text-white transition-colors">
              Refresh now
            </button>
            <Link href="/dashboard" className="text-xs text-gray-500 hover:text-white transition-colors">
              &larr; Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              Live Scores
              {liveCount > 0 && (
                <span className="text-sm font-mono bg-red-500/10 border border-red-500/20 text-red-400 px-2.5 py-0.5 rounded-full">
                  {liveCount} live
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-600 mt-1">
              {lastUpdate ? `Last updated ${lastUpdate}` : 'Loading...'} · Auto-refreshes every 30s
              {finishedCount > 0 && ` · ${finishedCount} finished`}
            </p>
          </div>

          {/* Stats */}
          {matches.length > 0 && (
            <div className="flex gap-3">
              {(() => {
                const withPreds = matches.filter(m => m.prediction)
                const winning = withPreds.filter(m => m.prediction?.status === 'winning' || m.prediction?.status === 'won').length
                if (withPreds.length === 0) return null
                return (
                  <div className="glass rounded-xl px-4 py-2 text-center">
                    <div className="font-mono text-lg font-bold text-brand-500">{winning}/{withPreds.length}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Predictions correct</div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3].map(i => (
              <div key={i} className="glass rounded-2xl h-48 shimmer" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && matches.length === 0 && <EmptyState />}

        {/* Live matches first, then finished */}
        {!loading && matches.length > 0 && (
          <div className="space-y-8">
            {/* Currently live */}
            {(() => {
              const live = matches.filter(m => !['FT', 'AET', 'PEN'].includes(m.status))
              if (live.length === 0) return null
              return (
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-600 font-medium mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    In play
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {live.map((m, i) => <LiveMatchCard key={m.match_id || i} match={m} />)}
                  </div>
                </div>
              )
            })()}

            {/* Finished */}
            {(() => {
              const finished = matches.filter(m => ['FT', 'AET', 'PEN'].includes(m.status))
              if (finished.length === 0) return null
              return (
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-600 font-medium mb-4">
                    Finished today
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {finished.map((m, i) => <LiveMatchCard key={m.match_id || i} match={m} />)}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
