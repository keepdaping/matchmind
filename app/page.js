'use client'
import { useState } from 'react'
import Link from 'next/link'

const DEMO_PREDICTIONS = [
  {
    home: 'Arsenal', away: 'Chelsea', league: 'Premier League',
    time: 'Today 20:00', confidence: 87, outcome: 'Home Win',
    risk: 'Low', reasons: [
      'Arsenal unbeaten in last 8 home games',
      'Chelsea missing 3 key defenders through injury',
      'Head-to-head: Arsenal won 4 of last 5 meetings'
    ]
  },
  {
    home: 'KCCA FC', away: 'Vipers SC', league: 'Uganda Premier League',
    time: 'Today 16:00', confidence: 72, outcome: 'Draw or Home Win',
    risk: 'Medium', reasons: [
      'KCCA strong form at home — 6W 1D 1L last 8',
      'Vipers top scorer doubtful — ankle knock',
      'High-stakes derby — both teams tactically cautious'
    ]
  },
  {
    home: 'Man City', away: 'Real Madrid', league: 'UEFA Champions League',
    time: 'Tomorrow 21:00', confidence: 63, outcome: 'Both Teams Score',
    risk: 'High', blurred: true,
    reasons: ['Unlock Pro to see full analysis']
  },
]

function ConfidenceRing({ value, size = 64 }) {
  const radius = (size - 8) / 2
  const circ = 2 * Math.PI * radius
  const fill = circ * (value / 100)
  const color = value >= 80 ? '#1D9E75' : value >= 65 ? '#EF9F27' : '#E24B4A'
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle"
        className="rotate-90" style={{ fontSize: size > 56 ? 13 : 10, fill: color, fontWeight: 600, transform: `rotate(90deg) translate(0, -${size/2}px)` }}>
      </text>
    </svg>
  )
}

function PredictionCard({ match, demo = false }) {
  const riskColor = match.risk === 'Low' ? 'text-brand-200 bg-brand-900/40' :
    match.risk === 'Medium' ? 'text-amber-400 bg-amber-900/30' : 'text-red-400 bg-red-900/30'
  const confColor = match.confidence >= 80 ? '#1D9E75' : match.confidence >= 65 ? '#EF9F27' : '#E24B4A'

  return (
    <div className={`glass rounded-2xl p-5 relative overflow-hidden ${match.blurred ? '' : 'glow'}`}>
      {match.blurred && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0f0d]/70 rounded-2xl">
          <div className="text-2xl mb-2">🔒</div>
          <div className="text-sm font-semibold text-white mb-1">Pro Prediction</div>
          <div className="text-xs text-gray-400 mb-3">Unlock with Pro — $7/mo</div>
          <Link href="/signup" className="bg-brand-500 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
            Unlock Now
          </Link>
        </div>
      )}
      <div className={match.blurred ? 'paywall-blur' : ''}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">{match.league}</div>
            <div className="font-semibold text-sm">{match.home} vs {match.away}</div>
            <div className="text-xs text-gray-500 mt-0.5">{match.time}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: confColor }}>{match.confidence}%</div>
            <div className="text-xs text-gray-400">confidence</div>
          </div>
        </div>

        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl px-4 py-2.5 mb-3">
          <div className="text-xs text-gray-400 mb-0.5">MatchMind predicts</div>
          <div className="font-bold text-brand-200">{match.outcome}</div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor}`}>
            {match.risk} Risk
          </div>
        </div>

        <div className="space-y-1.5">
          {match.reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="text-brand-500 mt-0.5 flex-shrink-0">›</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [activeLeague, setActiveLeague] = useState('All')
  const leagues = ['All', 'Premier League', 'Uganda PL', 'Champions League']

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="text-xl font-bold">
            Match<span className="text-brand-500">Mind</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Login</Link>
            <Link href="/signup" className="bg-brand-500 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 rounded-full bg-brand-500 pulse-green inline-block"></span>
              <span className="text-xs text-brand-200 font-medium">Live predictions updated daily</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
              Your edge<br />
              <span className="text-brand-500">before kickoff.</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              AI-powered football predictions for Premier League, AFCON, Uganda Premier League and more.
              Know what the bookmakers don’t want you to know.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup" className="bg-brand-500 hover:bg-brand-700 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all glow">
                Get 3 Free Predictions →
              </Link>
              <Link href="#predictions" className="text-gray-400 hover:text-white font-medium px-6 py-4 transition-colors">
                See today’s picks ↓
              </Link>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-16">
            {[
              { val: '78%', label: 'Avg accuracy' },
              { val: '10+', label: 'Leagues covered' },
              { val: 'Daily', label: 'Fresh predictions' },
            ].map((s, i) => (
              <div key={i} className="text-center glass rounded-xl py-3 px-2">
                <div className="text-2xl font-bold text-brand-500">{s.val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Predictions demo */}
      <section id="predictions" className="py-16 px-4 bg-black/20">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold">Today’s Predictions</h2>
              <p className="text-gray-400 text-sm mt-1">AI-generated. Updated every morning at 7am.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {leagues.map(l => (
                <button key={l} onClick={() => setActiveLeague(l)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    activeLeague === l ? 'bg-brand-500 text-white' : 'glass text-gray-400 hover:text-white'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {DEMO_PREDICTIONS.map((match, i) => (
              <PredictionCard key={i} match={match} demo />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">How MatchMind works</h2>
          <p className="text-gray-400 mb-12">The same AI used by professional analysts. Now in your pocket.</p>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Data collected', desc: 'Team form, H2H stats, injuries, lineups, weather, home advantage — all pulled automatically.' },
              { step: '02', title: 'AI analyses', desc: 'Claude AI processes thousands of data points and identifies the most likely match outcome.' },
              { step: '03', title: 'Prediction dropped', desc: 'Every morning at 7am, fresh prediction cards appear for the day’s matches.' },
              { step: '04', title: 'Result tracked', desc: 'After the match, your accuracy score updates. See MatchMind’s weekly record.' },
            ].map((s, i) => (
              <div key={i} className="glass rounded-2xl p-5 text-left">
                <div className="text-brand-500 font-bold text-sm mb-3">{s.step}</div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-black/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Simple pricing</h2>
            <p className="text-gray-400">Start free. Upgrade when you’re winning.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Free', price: '$0', period: 'forever',
                features: ['1 prediction per day', 'Top match only', '3-day streak tracking', 'Public leaderboard'],
                cta: 'Start Free', href: '/signup', featured: false
              },
              {
                name: 'Pro', price: '$7', period: 'per month',
                features: ['All daily predictions', '10+ leagues', 'Accumulator builder', 'Full streak system', 'WhatsApp alerts', 'PDF tip sheets'],
                cta: 'Get Pro', href: '/signup?plan=pro', featured: true
              },
              {
                name: 'Elite', price: '$18', period: 'per month',
                features: ['Everything in Pro', 'Deep match analysis', 'Early predictions (6am)', 'API access', 'Priority support', 'Team workspace'],
                cta: 'Get Elite', href: '/signup?plan=elite', featured: false
              },
            ].map((plan, i) => (
              <div key={i} className={`rounded-2xl p-6 relative ${plan.featured ? 'bg-brand-500/10 border-2 border-brand-500 glow' : 'glass'}`}>
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <div className="text-sm text-gray-400 mb-1">{plan.name}</div>
                <div className="text-4xl font-bold mb-1">{plan.price}</div>
                <div className="text-xs text-gray-500 mb-6">{plan.period}</div>
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-brand-500 font-bold">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href={plan.href}
                  className={`block text-center font-semibold py-3 rounded-xl transition-all ${
                    plan.featured ? 'bg-brand-500 hover:bg-brand-700 text-white' : 'glass hover:bg-white/10 text-white'
                  }`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Pay as you go? Token packs from $1 — 10 prediction unlocks, no subscription needed.
          </p>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-10">Built for East Africa. Used worldwide.</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { quote: "MatchMind called the KCCA vs Vipers result perfectly. Even got the scoreline direction right.", name: "Brian K.", location: "Kampala, Uganda" },
              { quote: "I was skeptical but the AI actually explains why it picks what it picks. That’s what I needed.", name: "Amara T.", location: "Nairobi, Kenya" },
              { quote: "Used to pay for WhatsApp tips that were 50/50. MatchMind is way more reliable.", name: "Emeka O.", location: "Lagos, Nigeria" },
            ].map((t, i) => (
              <div key={i} className="glass rounded-2xl p-5 text-left">
                <div className="text-brand-500 text-2xl mb-3">“</div>
                <p className="text-sm text-gray-300 mb-4 leading-relaxed">{t.quote}</p>
                <div className="text-xs text-gray-500">{t.name} · {t.location}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="glass rounded-3xl p-10 glow">
            <h2 className="text-3xl font-bold mb-4">Start with 3 free predictions today</h2>
            <p className="text-gray-400 mb-8">No credit card. No commitment. Just your edge before kickoff.</p>
            <Link href="/signup" className="inline-block bg-brand-500 hover:bg-brand-700 text-white font-bold px-10 py-4 rounded-xl text-lg transition-all">
              Get Started Free →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-bold text-lg">Match<span className="text-brand-500">Mind</span></div>
          <div className="text-xs text-gray-600">
            MatchMind is for informational purposes only. Always gamble responsibly.
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/login">Login</Link>
            <Link href="/signup">Sign up</Link>
            <Link href="#pricing">Pricing</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
