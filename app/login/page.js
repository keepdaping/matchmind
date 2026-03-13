'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center mb-8">
          <div className="text-2xl font-bold">Match<span className="text-brand-500">Mind</span></div>
        </Link>

        <div className="glass rounded-2xl p-8">
          <h1 className="text-xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-gray-400 mb-6">Your daily edge is waiting.</p>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? 'Signing in...' : 'Sign In'}
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
            No account yet?{' '}
            <Link href="/signup" className="text-brand-500 hover:text-brand-200 transition-colors">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
