import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function sendMessage(chatId: string | number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

// Security: Verify the request is coming from our Supabase Database Webhook
// by checking a custom header we configure in the webhook settings.
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_POLL_SECRET
  if (!expected) {
    console.warn('telegram/notify: INTERNAL_POLL_SECRET not configured. Endpoint unprotected.')
    return true
  }
  const provided = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret') || ''
  return provided === expected
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await req.json()
    // Supabase DB Webhook payload format
    if (payload.type !== 'INSERT' || payload.table !== 'system_messages' || !payload.record) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const msg = payload.record
    const admin = getAdminClient()

    // Fetch all active users with linked telegrams
    const { data: allUsers, error } = await admin
      .from('user_profiles')
      .select('id, telegram_chat_id, role, company, site_id')
      .not('telegram_chat_id', 'is', null)
      .eq('is_active', true)

    if (error || !allUsers) {
      console.error('Failed to fetch users:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Filter matching users
    const users = allUsers.filter(u => {
      if (msg.recipient_user_id) return u.id === msg.recipient_user_id
      if (msg.recipient_role && u.role !== msg.recipient_role) return false
      if (msg.recipient_company && msg.recipient_company !== 'null' && u.company !== msg.recipient_company) return false
      if (msg.recipient_site_id && msg.recipient_site_id !== 'null' && u.site_id !== msg.recipient_site_id) return false
      return true
    })

    if (users.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 })
    }

    // Determine icon
    let icon = '🔔'
    if (msg.title.includes('Approved')) icon = '✅'
    if (msg.title.includes('Reject')) icon = '❌'
    if (msg.title.includes('Warning')) icon = '⚠️'
    if (msg.title.includes('Info')) icon = 'ℹ️'

    const text = `${icon} <b>${msg.title}</b>\n\n${msg.body}`
    let sentCount = 0

    // Send to all matching users
    for (const user of users) {
      if (user.telegram_chat_id) {
        try {
          await sendMessage(user.telegram_chat_id, text)
          sentCount++
        } catch (e) {
          console.error(`Failed to send to chat_id ${user.telegram_chat_id}:`, e)
        }
      }
    }

    return NextResponse.json({ ok: true, sent: sentCount })
  } catch (err: any) {
    console.error('Webhook processing error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
