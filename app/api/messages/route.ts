import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth-helpers'
import { sendTelegramToMatchingUsers } from '@/lib/telegram'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}



// GET /api/messages — get system messages (RLS already filters by recipient)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch user profile to get their role
  const { data: profile } = await supabase.from('user_profiles').select('role, company, site_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  let query = supabase
    .from('system_messages')
    .select('*')
    .eq('is_dismissed', false)
    .eq('recipient_role', profile.role)
    .order('created_at', { ascending: false })
    .limit(20)

  // Further filter by company and site_id if they are specified in the message
  // In Supabase we can use an OR condition to match either NULL or the exact value
  // But actually we just want: (recipient_company IS NULL OR recipient_company = user.company)
  query = query.or(`recipient_company.is.null,recipient_company.eq.${profile.company || ''}`)
  if (profile.site_id) {
    query = query.or(`recipient_site_id.is.null,recipient_site_id.eq.${profile.site_id}`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/messages — create a system message
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SECURITY (HIGH-06): Restrict which roles can create system messages
  const { authorized } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'engineer', 'whole_manager', 'ceo', 'purchaser', 'purchase_assistant', 'payer', 'finance']
  )

  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden: Your role cannot send system messages' }, { status: 403 })
  }

  const adminSupabase = getAdminClient()
  const { title, body, action_key, recipient_role, recipient_company, recipient_site_id } = await req.json()

  let finalSiteId = recipient_site_id
  if (finalSiteId && !/^[0-9a-fA-F]{8}-/.test(finalSiteId)) {
    const { data: site } = await adminSupabase.from('sites').select('id').eq('name', finalSiteId).single()
    if (site) finalSiteId = site.id
  }

  const { error } = await adminSupabase
    .from('system_messages')
    .insert({
      title,
      body,
      action_key,
      recipient_role,
      recipient_company: recipient_company ?? null,
      recipient_site_id: finalSiteId ?? null,
      is_read: false,
      is_dismissed: false,
    } as any)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // --- Fire-and-forget Telegram notification ---
  // Build a clickable link using the app URL (falls back gracefully if not set)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com'
  const telegramText =
    `📢 <b>Cappadocia Store System</b>\n\n` +
    `<b>${title}</b>\n${body}\n\n` +
    `👉 <a href="${appUrl}">Go to the system</a>`

  sendTelegramToMatchingUsers(
    adminSupabase,
    {
      recipient_role,
      recipient_company: recipient_company ?? null,
      recipient_site_id: finalSiteId ?? null,
    },
    telegramText
  ).catch((err) => console.error('[Telegram] notification error:', err))

  return NextResponse.json({ success: true })
}

// PATCH /api/messages — dismiss message
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message_id } = await req.json()
  if (!message_id) return NextResponse.json({ error: 'message_id is required' }, { status: 400 })

  // SECURITY (HIGH-06): Verify the message belongs to the current user's role/site
  // Use the user-context client: RLS only returns messages targeted to this user.
  // If the message isn't returned, this user has no right to dismiss it.
  const { data: msg } = await supabase
    .from('system_messages')
    .select('id, recipient_role, recipient_site_id, recipient_company')
    .eq('id', message_id)
    .single()

  if (!msg) {
    // Either not found or RLS blocked it — in either case, forbidden
    return NextResponse.json({ error: 'Message not found or access denied' }, { status: 404 })
  }

  // Now use admin client for the actual update (needed to bypass RLS for UPDATE)
  const adminSupabase = getAdminClient()
  const { error } = await adminSupabase
    .from('system_messages')
    .update({ is_dismissed: true, is_read: true } as any)
    .eq('id', message_id)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ success: true })
}
