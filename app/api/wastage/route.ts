import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'

import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(url, key)
}

// POST /api/wastage — log wastage
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, item_id, quantity, reason, photo_url, reporter_role } = await req.json()

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'engineer'],
    site_id
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const { data, error } = await supabase.rpc('log_wastage', {
    p_site_id: site_id,
    p_item_id: item_id,
    p_quantity: quantity,
    p_reason: reason,
    p_photo_url: photo_url ?? null,
    p_reporter_role: reporter_role,
    p_user_id: user.id,
  } as any)

  const result = data as any
  if (error || !result?.success) {
    console.error('Wastage API Error:', error || result?.error, {
      p_site_id: site_id,
      p_item_id: item_id,
      p_quantity: quantity,
      p_reason: reason,
      p_reporter_role: reporter_role,
      p_user_id: user.id
    });
    return NextResponse.json({ error: result?.error || 'Internal server error' }, { status: 400 })
  }
  return NextResponse.json(data)
}

// PATCH /api/wastage — manager review
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const adminSupabase = getAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['whole_manager', 'ceo']
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const { report_id } = await req.json()
  if (!report_id) return NextResponse.json({ error: 'report_id is required' }, { status: 400 })

  // Dismiss any existing system messages for this wastage report
  await adminSupabase.from('system_messages')
    .update({ is_dismissed: true, is_read: true } as any)
    .eq('reference_id', report_id)

  const { data, error } = await supabase
    .from('wastage_reports')
    .update({ status: 'reviewed', reviewed_by: user.id } as any)
    .eq('id', report_id)
    .select().single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data)
}
