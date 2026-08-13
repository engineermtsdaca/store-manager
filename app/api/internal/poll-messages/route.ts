import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest) {
  try {
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
