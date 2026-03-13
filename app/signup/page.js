'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/dashboard`
      }
    })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // Create user profile with 3 free tokens
    if (data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        email,
        full_name: name,
        plan: 'free',
        token_balance: 3,
        streak: 0,
        last_visit_date: new Date().toISOString().split('T')[0],
      })

      await supabase.from('token_transactions').insert({
        user_id: data.user.id,
        amount: 3,
        type: 'signup_bonus',
        reference: 'welcome'
      })
    }

    setDone(true)
    setLoading(false)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    })
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⚽</div>
          <h2 className="text-2xl font-bold mb-2">Check your email</h2>
          <p className="text-gray-400 text-sm mb-6">
            We sent a confirmation link to <strong className="text-white">{email}</strong>.
            Click it to activate your account and claim your 3 free predictions.
          </p>
          <Link href="/login" className="text-brand-500 text-sm hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center mb-8">
          <div className="text-2xl font-bold">Match<span className="text-brand-500">Mind</span></div>
        </Link>

        <div className="glass rounded-2xl p-8">
          <h1 className="text-xl font-bold mb-1">Get your edge today</h1>
          <p className="text-sm text-gray-400 mb-6">
            Free to join. 3 predictions included. No credit card.
          </p>

          {/* Benefits */}
          <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 mb-6 space-y-1.5">
            {['3 free AI predictions on signup', 'Daily match updates — 10+ leagues', 'Streak tracking from day one'].map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-brand-200">
                <span className="text-brand-500 font-bold">✓</span> {b}
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Odyk"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Min 6 characters"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? 'Creating account...' : 'Create Free Account →'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-500">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <button onClick={handleGoogle}
            className="w-full glass hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm border border-white/10">
            <span>🔵</span> Continue with Google
          </button>

          <p className="text-center text-xs text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-500 hover:text-brand-200 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
