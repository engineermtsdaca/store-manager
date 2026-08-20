import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// SECURITY: This endpoint uses the service-role key and returns system messages plus
// user directory data (id, telegram_chat_id, role, company, site_id). It is called by
// an external poller (scripts/telegram-poll.mjs), not by a browser session, so it is
// protected with a shared secret (INTERNAL_POLL_SECRET) instead of a user session.
//
// The secret may be supplied either via the `x-internal-secret` header or a `?secret=`
// query param, so it matches whatever the poller sends.
//
// NOTE: If INTERNAL_POLL_SECRET is not configured, the endpoint stays open (with a
// warning) so the running poller is not broken during rollout. Set the secret in BOTH
// .env.local and the poller to enforce it and close the data-leak.
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_POLL_SECRET
  if (!expected) {
    console.warn(
      'poll-messages: INTERNAL_POLL_SECRET is not configured — endpoint is UNPROTECTED. ' +
      'Set INTERNAL_POLL_SECRET in .env.local and in the poller to secure it.'
    )
    return true
  }
  const provided =
    req.headers.get('x-internal-secret') || req.nextUrl.searchParams.get('secret') || ''
  return provided === expected
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const since = req.nextUrl.searchParams.get('since')
    if (!since) return NextResponse.json({ error: 'since parameter is required' }, { status: 400 })

    const adminSupabase = getAdminClient()
    const { data: messages, error } = await adminSupabase
      .from('system_messages')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Also fetch users to determine who should get which message
    const { data: users } = await adminSupabase
      .from('user_profiles')
      .select('id, telegram_chat_id, role, company, site_id, is_active')
      .not('telegram_chat_id', 'is', null)
      .eq('is_active', true)

    return NextResponse.json({ messages, users })
  } catch (err: any) {
    console.error('poll-messages error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
