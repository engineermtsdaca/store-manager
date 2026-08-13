// app/api/auth/unlink-telegram/route.ts
// ============================================================
// POST /api/auth/unlink-telegram
// No body required — uses the currently authenticated session.
//
// Clears telegram_chat_id for the logged-in user.
// ============================================================

import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = getAdminClient()

    const { error } = await admin
      .from('user_profiles')
      .update({ telegram_chat_id: null } as any)
      .eq('id', user.id)

    if (error) {
      console.error('Unlink telegram error:', error)
      return NextResponse.json({ error: 'Failed to unlink Telegram' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('unlink-telegram error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
