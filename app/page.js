'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const DEMO_PREDICTIONS = [
  {
    home: 'Arsenal', away: 'Chelsea', league: 'Premier League',
    time: 'Today 20:00', confidence: 87, outcome: 'Home Win',
    risk: 'Low', scoreline: '2-0', xgHome: 1.92, xgAway: 0.74,
    reasons: [
      'Arsenal unbeaten in last 8 home games',
      'Chelsea missing 3 key defenders through injury',
      'H2H: Arsenal won 4 of last 5 meetings'
    ]
  },
  {
    home: 'KCCA FC', away: 'Vipers SC', league: 'Uganda Premier League',
    time: 'Today 16:00', confidence: 72, outcome: 'Home Win',
    risk: 'Medium', scoreline: '1-0', xgHome: 1.15, xgAway: 0.88,
    reasons: [
      'KCCA strong home form — 6W 1D 1L last 8',
      'Vipers top scorer doubtful — ankle knock',
      'High-stakes derby — both teams tactically cautious'
    ]
  },
  {
    home: 'Real Madrid', away: 'Bayern Munich', league: 'Champions League',
    time: 'Tomorrow 21:00', confidence: 63, outcome: 'Both Teams Score',
    risk: 'High', blurred: true,
    reasons: ['Unlock Pro to see full analysis']
  },
]

const TICKER_MATCHES = [
  { home: 'Liverpool', away: 'Man City', pick: 'Home Win', conf: 81, league: 'PL' },
  { home: 'Barcelona', away: 'Atletico', pick: 'Over 2.5', conf: 74, league: 'La Liga' },
  { home: 'PSG', away: 'Marseille', pick: 'Home Win', conf: 78, league: 'Ligue 1' },
  { home: 'Gor Mahia', away: 'Leopards', pick: 'Draw', conf: 61, league: 'KPL' },
  { home: 'Bayern', away: 'Dortmund', pick: 'BTTS', conf: 82, league: 'Bund.' },
  { home: 'Al Ahly', away: 'Zamalek', pick: 'Home Win', conf: 69, league: 'Egypt' },
  { home: 'AC Milan', away: 'Inter', pick: 'BTTS', conf: 76, league: 'Serie A' },
  { home: 'Ajax', away: 'PSV', pick: 'Over 2.5', conf: 85, league: 'Ered.' },
]

function ConfidenceBar({ value }) {
  const color = value >= 80 ? '#1D9E75' : value >= 65 ? '#EF9F27' : '#E24B4A'
  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-1000"
        style={{ width: `${value}%`, background: color }} />
    </div>
  )
}

function PredictionCard({ match }) {
  const confColor = match.confidence >= 80 ? '#1D9E75' : match.confidence >= 65 ? '#EF9F27' : '#E24B4A'
  const riskColor = match.risk === 'Low' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    match.risk === 'Medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'

  return (
    <div className={`glass-strong rounded-2xl relative overflow-hidden card-hover ${match.blurred ? '' : 'border-glow'}`}>
      {match.blurred && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d1210]/80 rounded-2xl backdrop-blur-sm">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 7H4a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2z" stroke="#888" strokeWidth="1.5"/><path d="M5 7V5a3 3 0 016 0v2" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div className="text-sm font-semibold text-white mb-1">Pro prediction</div>
          <div className="text-xs text-gray-500 mb-4">Full analysis, scoreline, xG</div>
          <Link href="/signup" className="bg-brand-500 hover:bg-brand-700 text-white text-xs font-semibold px-5 py-2 rounded-lg transition-colors">
            Unlock — $7/mo
          </Link>
        </div>
      )}
      <div className={match.blurred ? 'paywall-blur' : ''}>
        {/* League + time header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-brand-500 font-semibold">{match.league}</span>
          <span className="text-[10px] text-gray-600">{match.time}</span>
        </div>

        <div className="p-5">
          {/* Teams + confidence */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-semibold leading-tight">{match.home}</div>
              <div className="text-xs text-gray-500 mt-0.5">vs {match.away}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-bold" style={{ color: confColor }}>{match.confidence}%</div>
            </div>
          </div>

          <ConfidenceBar value={match.confidence} />

          {/* Prediction */}
          <div className="mt-4 bg-brand-500/8 border border-brand-500/15 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Prediction</div>
              <div className="text-sm font-bold text-brand-200 mt-0.5">{match.outcome}</div>
            </div>
            {match.scoreline && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Score</div>
                <div className="font-mono text-sm font-bold text-white mt-0.5">{match.scoreline}</div>
              </div>
            )}
          </div>

          {/* xG + Risk row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${riskColor}`}>
              {match.risk}
            </span>
            {match.xgHome != null && (
              <span className="text-[10px] text-gray-500 font-mono">
                xG {match.xgHome} – {match.xgAway}
              </span>
            )}
          </div>

          {/* Reasons */}
          <div className="mt-3 space-y-1.5">
            {match.reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                <span className="text-brand-500 mt-0.5 flex-shrink-0 text-[10px]">{'///'[i] || '/'}</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AnimatedCounter({ target, suffix = '' }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const duration = 1500
    const steps = 40
    const increment = target / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.round(current))
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [target])
  return <span className="font-mono">{count}{suffix}</span>
}

export default function LandingPage() {
  const [activeLeague, setActiveLeague] = useState('All')
  const leagues = ['All', 'Premier League', 'Uganda PL', 'La Liga', 'Champions League']

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="text-lg font-bold tracking-tight">
            Match<span className="text-brand-500">Mind</span>
            <span className="ml-2 text-[9px] uppercase tracking-widest text-gray-600 font-medium hidden sm:inline">AI Predictions</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="#pricing" className="text-xs text-gray-500 hover:text-white transition-colors hidden sm:block">Pricing</Link>
            <Link href="/login" className="text-xs text-gray-400 hover:text-white transition-colors">Log in</Link>
            <Link href="/signup" className="bg-brand-500 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all glow-sm">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Live ticker */}
      <div className="pt-14 bg-[#080c0a] border-b border-white/5 overflow-hidden">
        <div className="flex ticker-track" style={{ width: 'max-content' }}>
          {[...TICKER_MATCHES, ...TICKER_MATCHES].map((m, i) => {
            const color = m.conf >= 80 ? '#1D9E75' : m.conf >= 65 ? '#EF9F27' : '#E24B4A'
            return (
              <div key={i} className="flex items-center gap-3 px-6 py-2 text-xs whitespace-nowrap border-r border-white/5">
                <span className="text-gray-600 font-mono text-[10px]">{m.league}</span>
                <span className="text-gray-400">{m.home} vs {m.away}</span>
                <span className="font-semibold text-white">{m.pick}</span>
                <span className="font-mono font-bold" style={{ color }}>{m.conf}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Hero */}
      <section className="pt-20 pb-24 px-4 relative overflow-hidden hero-glow grid-bg">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="animate-in inline-flex items-center gap-2 bg-brand-500/8 border border-brand-500/15 rounded-full px-4 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 pulse-green inline-block"></span>
              <span className="text-[11px] text-brand-200 font-medium tracking-wide">Dixon-Coles model — updated daily at 07:00 UTC</span>
            </div>
            <h1 className="animate-in-delay-1 text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6 leading-[0.95]">
              Know the result<br />
              <span className="text-brand-500 glow-text">before kickoff.</span>
            </h1>
            <p className="animate-in-delay-2 text-lg md:text-xl text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
              AI football predictions powered by Poisson statistics, real match data, and 28+ leagues worldwide.
            </p>
            <div className="animate-in-delay-3 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup" className="bg-brand-500 hover:bg-brand-700 text-white font-bold px-8 py-4 rounded-xl text-base transition-all glow group">
                Get 3 Free Predictions
                <span className="inline-block ml-1 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </Link>
              <Link href="#predictions" className="text-gray-500 hover:text-white font-medium px-6 py-4 transition-colors text-sm">
                See today's picks
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="animate-in-delay-4 grid grid-cols-4 gap-3 max-w-2xl mx-auto mt-16">
            {[
              { val: 28, suffix: '+', label: 'Leagues' },
              { val: 78, suffix: '%', label: 'Accuracy' },
              { val: 6, suffix: '', label: 'Markets' },
              { val: 100, suffix: '/hr', label: 'API calls' },
            ].map((s, i) => (
              <div key={i} className="text-center glass rounded-xl py-4 px-2">
                <div className="text-xl md:text-2xl font-bold text-brand-500">
                  <AnimatedCounter target={s.val} suffix={s.suffix} />
                </div>
                <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Predictions demo */}
      <section id="predictions" className="py-20 px-4 bg-[#080c0a]">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Today's predictions</h2>
              <p className="text-gray-600 text-sm mt-1">AI-generated. Updated every morning.</p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {leagues.map(l => (
                <button key={l} onClick={() => setActiveLeague(l)}
                  className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
                    activeLeague === l
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                      : 'bg-white/3 text-gray-500 hover:text-white border border-white/5'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {DEMO_PREDICTIONS.map((match, i) => (
              <PredictionCard key={i} match={match} />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-4 grid-bg">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-3">How it works</h2>
            <p className="text-gray-500 text-sm">Dixon-Coles Poisson model. Not vibes.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { step: '01', title: 'Data ingested', desc: 'Team form, H2H, xG, rest days, Elo ratings — pulled from API-Football across 28 leagues.', accent: 'border-brand-500/30' },
              { step: '02', title: 'Model runs', desc: 'Dixon-Coles Poisson simulation: expected goals, home advantage, scoreline matrix, BTTS probability.', accent: 'border-emerald-500/30' },
              { step: '03', title: 'AI explains', desc: 'Claude analyzes the numbers and writes a human-readable prediction with key stats and risk factors.', accent: 'border-amber-500/30' },
              { step: '04', title: 'Results graded', desc: 'Every night, actual results are fetched and every prediction is graded. Full transparency.', accent: 'border-blue-500/30' },
            ].map((s, i) => (
              <div key={i} className={`glass rounded-2xl p-5 text-left border-t-2 ${s.accent} card-hover`}>
                <div className="font-mono text-brand-500 text-xs font-bold mb-3 tracking-wider">{s.step}</div>
                <h3 className="font-semibold text-sm mb-2">{s.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leagues */}
      <section className="py-16 px-4 bg-[#080c0a] border-y border-white/5">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gray-600 mb-6 font-medium">28 leagues covered</div>
          <div className="flex flex-wrap justify-center gap-3">
            {['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League', 'Europa League',
              'Uganda PL', 'Kenya PL', 'NPFL Nigeria', 'Ghana Premier', 'South Africa PSL', 'Egypt Premier',
              'Eredivisie', 'MLS', 'AFCON', 'J-League', 'World Cup'].map((l, i) => (
              <span key={i} className="text-[11px] px-3 py-1 rounded-full bg-white/3 border border-white/5 text-gray-500">
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 grid-bg">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Simple pricing</h2>
            <p className="text-gray-500 text-sm">Start free. Upgrade when you're winning.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                name: 'Free', price: '$0', period: 'forever',
                features: ['3 predictions on signup', 'Top matches only', 'Streak tracking', 'Pay-as-you-go tokens'],
                cta: 'Start Free', href: '/signup', featured: false
              },
              {
                name: 'Pro', price: '$7', period: '/month',
                features: ['Unlimited predictions', '28 leagues worldwide', 'Accumulator builder', 'Scoreline predictions', 'BTTS + Over/Under markets', 'Full streak system'],
                cta: 'Get Pro', href: '/signup?plan=pro', featured: true
              },
              {
                name: 'Elite', price: '$18', period: '/month',
                features: ['Everything in Pro', 'Deep tactical analysis', 'REST API access (100/hr)', 'API key management', 'Live odds integration', 'Priority support'],
                cta: 'Get Elite', href: '/signup?plan=elite', featured: false
              },
            ].map((plan, i) => (
              <div key={i} className={`rounded-2xl p-6 relative card-hover ${plan.featured ? 'bg-brand-500/8 border-2 border-brand-500/40 glow' : 'glass'}`}>
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-xs text-gray-600">{plan.period}</span>
                </div>
                <div className="h-px bg-white/5 my-5" />
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-400">
                      <svg className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.href}
                  className={`block text-center font-semibold py-3 rounded-xl text-sm transition-all ${
                    plan.featured ? 'bg-brand-500 hover:bg-brand-700 text-white' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                  }`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-600 mt-6">
            No subscription? Token packs from $1 — 10 prediction unlocks, never expire.
          </p>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-24 px-4 bg-[#080c0a]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight mb-2">Built for East Africa. Used worldwide.</h2>
            <p className="text-xs text-gray-600">Real users, real results.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { quote: "MatchMind called the KCCA vs Vipers result perfectly. Even got the scoreline direction right.", name: "Brian K.", location: "Kampala" },
              { quote: "I was skeptical but the AI actually explains why it picks what it picks. That's what I needed.", name: "Amara T.", location: "Nairobi" },
              { quote: "Used to pay for WhatsApp tips that were 50/50. MatchMind's stats-based approach is way better.", name: "Emeka O.", location: "Lagos" },
            ].map((t, i) => (
              <div key={i} className="glass rounded-2xl p-6 text-left card-hover">
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 1l2.24 4.55 5.01.73-3.63 3.53.86 4.99L8 12.27 3.52 14.8l.86-4.99L.75 6.28l5.01-.73z"/>
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-gray-400 mb-4 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="text-xs">
                  <span className="text-white font-medium">{t.name}</span>
                  <span className="text-gray-600"> · {t.location}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 text-center grid-bg">
        <div className="max-w-xl mx-auto">
          <div className="glass-strong rounded-3xl p-12 glow border-glow">
            <div className="font-mono text-brand-500 text-xs tracking-wider mb-4">MATCH<span className="text-white">MIND</span></div>
            <h2 className="text-3xl font-bold tracking-tight mb-4">Your edge starts now.</h2>
            <p className="text-gray-500 text-sm mb-8">3 free predictions. No credit card. Dixon-Coles model running before every match.</p>
            <Link href="/signup" className="inline-block bg-brand-500 hover:bg-brand-700 text-white font-bold px-10 py-4 rounded-xl text-base transition-all glow group">
              Get Started Free
              <span className="inline-block ml-1 group-hover:translate-x-1 transition-transform">&rarr;</span>
            </Link>
            <div className="mt-6 flex items-center justify-center gap-6 text-[10px] text-gray-600 uppercase tracking-wider">
              <span>28 leagues</span>
              <span className="w-1 h-1 rounded-full bg-gray-700"></span>
              <span>API access</span>
              <span className="w-1 h-1 rounded-full bg-gray-700"></span>
              <span>Auto-graded</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="font-bold text-lg tracking-tight mb-1">Match<span className="text-brand-500">Mind</span></div>
              <div className="text-[10px] text-gray-700 max-w-xs leading-relaxed">
                AI-powered football predictions. For informational and entertainment purposes only. Always gamble responsibly.
              </div>
            </div>
            <div className="flex gap-8 text-xs text-gray-600">
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-700 font-medium">Product</div>
                <Link href="/signup" className="block hover:text-white transition-colors">Sign up</Link>
                <Link href="/login" className="block hover:text-white transition-colors">Log in</Link>
                <Link href="#pricing" className="block hover:text-white transition-colors">Pricing</Link>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-700 font-medium">Tech</div>
                <span className="block">Dixon-Coles model</span>
                <span className="block">API-Football data</span>
                <span className="block">REST API</span>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-700">
            <span>Built by Odyk · @KeepdapingB</span>
            <span>Powered by Anthropic Claude</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
