// lib/api-auth.js
// API key authentication and rate limiting for Elite API
import { getServiceClient } from '@/lib/supabase'

const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour in ms
const RATE_LIMIT_MAX = 100 // 100 requests per hour

// In-memory rate limit store (resets on deploy — good enough for v1)
const rateLimitStore = new Map()

function getRateLimitKey(apiKey) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW

  let entry = rateLimitStore.get(apiKey)
  if (!entry) {
    entry = { requests: [], blocked: false }
    rateLimitStore.set(apiKey, entry)
  }

  // Prune old requests outside the window
  entry.requests = entry.requests.filter(t => t > windowStart)

  return entry
}

/**
 * Authenticate an API request via Bearer token or x-api-key header.
 * Returns { user, profile, error, status }
 */
export async function authenticateApiKey(req) {
  // Extract API key from header
  const authHeader = req.headers.get('authorization') || ''
  const xApiKey = req.headers.get('x-api-key') || ''
  const apiKey = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : xApiKey.trim()

  if (!apiKey) {
    return {
      error: 'Missing API key. Pass it as Authorization: Bearer <key> or X-API-Key: <key>',
      status: 401,
    }
  }

  // Look up the key in Supabase
  const db = getServiceClient()
  const { data: keyRecord, error: keyError } = await db
    .from('api_keys')
    .select('id, user_id, name, is_active, requests_today, last_request_date')
    .eq('key', apiKey)
    .single()

  if (keyError || !keyRecord) {
    return { error: 'Invalid API key', status: 401 }
  }

  if (!keyRecord.is_active) {
    return { error: 'API key is deactivated', status: 403 }
  }

  // Check user plan
  const { data: profile, error: profileError } = await db
    .from('users')
    .select('id, plan, email, full_name')
    .eq('id', keyRecord.user_id)
    .single()

  if (profileError || !profile) {
    return { error: 'User not found', status: 404 }
  }

  if (profile.plan !== 'elite') {
    return {
      error: 'Elite plan required for API access. Upgrade at matchmind.app/billing',
      status: 403,
    }
  }

  // Rate limiting
  const rateEntry = getRateLimitKey(apiKey)
  if (rateEntry.requests.length >= RATE_LIMIT_MAX) {
    return {
      error: `Rate limit exceeded. Max ${RATE_LIMIT_MAX} requests per hour.`,
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil((rateEntry.requests[0] + RATE_LIMIT_WINDOW) / 1000)),
        'Retry-After': '60',
      },
    }
  }

  // Track request
  rateEntry.requests.push(Date.now())

  // Update daily request count in DB (fire-and-forget)
  const today = new Date().toISOString().split('T')[0]
  const newCount = keyRecord.last_request_date === today
    ? (keyRecord.requests_today || 0) + 1
    : 1

  db.from('api_keys')
    .update({ requests_today: newCount, last_request_date: today })
    .eq('id', keyRecord.id)
    .then(() => {})
    .catch(() => {})

  return {
    user: { id: profile.id, email: profile.email, name: profile.full_name },
    profile,
    keyId: keyRecord.id,
    remaining: RATE_LIMIT_MAX - rateEntry.requests.length,
  }
}

/**
 * Generate rate limit headers for successful responses.
 */
export function rateLimitHeaders(remaining) {
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
  }
}
