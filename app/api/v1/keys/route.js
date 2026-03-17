// app/api/v1/keys/route.js
// API key management — generate, list, revoke
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.split(' ')[1] || ''
  if (!token) return null
  const db = getServiceClient()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function generateApiKey() {
  // Format: mm_live_<32 random hex chars>
  return `mm_live_${crypto.randomBytes(16).toString('hex')}`
}

// GET — List user's API keys
export async function GET(req) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()

  // Check plan
  const { data: profile } = await db
    .from('users')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (!profile || profile.plan !== 'elite') {
    return NextResponse.json({
      error: 'Elite plan required for API access',
      upgrade_url: '/billing?upgrade=elite',
    }, { status: 403 })
  }

  const { data: keys } = await db
    .from('api_keys')
    .select('id, name, key, is_active, requests_today, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Mask keys for display (show first 12 + last 4 chars)
  const maskedKeys = (keys || []).map(k => ({
    id: k.id,
    name: k.name,
    key_preview: k.key.slice(0, 12) + '...' + k.key.slice(-4),
    full_key: k.key, // Only shown on creation in the frontend
    is_active: k.is_active,
    requests_today: k.requests_today || 0,
    created_at: k.created_at,
  }))

  return NextResponse.json({ keys: maskedKeys })
}

// POST — Generate new API key
export async function POST(req) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()

  // Check plan
  const { data: profile } = await db
    .from('users')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (!profile || profile.plan !== 'elite') {
    return NextResponse.json({
      error: 'Elite plan required for API access',
      upgrade_url: '/billing?upgrade=elite',
    }, { status: 403 })
  }

  // Limit: max 3 active keys per user
  const { data: existingKeys } = await db
    .from('api_keys')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if ((existingKeys || []).length >= 3) {
    return NextResponse.json({
      error: 'Maximum 3 active API keys. Revoke an existing key first.',
    }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const name = body.name || 'Default Key'

  const apiKey = generateApiKey()

  const { data: saved, error } = await db
    .from('api_keys')
    .insert({
      user_id: user.id,
      name: name.slice(0, 50),
      key: apiKey,
      is_active: true,
      requests_today: 0,
      last_request_date: null,
    })
    .select()
    .single()

  if (error) {
    console.error('[API Keys] Insert error:', error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }

  return NextResponse.json({
    message: 'API key created. Save it now — you won\'t see the full key again.',
    key: {
      id: saved.id,
      name: saved.name,
      key: apiKey,
      created_at: saved.created_at,
    },
    docs: 'https://matchmind.app/api-docs',
    example: `curl -H "X-API-Key: ${apiKey}" https://matchmind.app/api/v1/matches`,
  }, { status: 201 })
}

// DELETE — Revoke an API key
export async function DELETE(req) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const keyId = body.key_id

  if (!keyId) {
    return NextResponse.json({ error: 'key_id is required' }, { status: 400 })
  }

  const db = getServiceClient()

  const { error } = await db
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  }

  return NextResponse.json({ message: 'API key revoked' })
}
