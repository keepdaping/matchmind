import { createClient } from '@supabase/supabase-js'

// Disable realtime entirely — MatchMind doesn't use it.
// Without this, the Supabase Realtime websocket fires before
// the auth session is ready and throws:
// "Cannot read properties of undefined (reading 'payload')"
const SUPABASE_OPTIONS = {
  realtime: { enabled: false },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}

// Client-side supabase client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_OPTIONS
)

// Server-side supabase client (service role — API routes only, never frontend)
export function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase config: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    ...SUPABASE_OPTIONS,
    auth: { persistSession: false },
  })
}
