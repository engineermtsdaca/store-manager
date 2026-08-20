import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'

// GET /api/attendance?site_id=xxx&date=2024-01-01
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteId = req.nextUrl.searchParams.get('site_id')
  const date   = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]

  // SECURITY (HIGH-06): Validate site_id against user's profile to prevent IDOR
  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'engineer', 'whole_manager', 'ceo', 'finance', 'payer', 'purchaser', 'purchase_assistant'],
    siteId
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const [workersRes, recordsRes] = await Promise.all([
    supabase.from('workers').select('*').eq('site_id', siteId!).eq('is_active', true),
    supabase.from('attendance_records').select('*').eq('site_id', siteId!).eq('record_date', date),
  ])

  return NextResponse.json({ workers: workersRes.data, records: recordsRes.data, date })
}

// POST /api/attendance — submit attendance sheet
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, records, date } = await req.json()

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['engineer', 'storekeeper', 'whole_manager', 'ceo'],
    site_id
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const inserts = records.map((r: { worker_id: string; is_present: boolean }) => ({
    site_id,
    worker_id: r.worker_id,
    record_date: date,
    is_present: r.is_present,
    submitted_by: user.id,
    submitted_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('attendance_records')
    .upsert(inserts as any, { onConflict: 'worker_id,record_date' })
    .select()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Notify manager
  await supabase.from('system_messages').insert({
    title: 'Attendance sheet submitted',
    body: `Site attendance for ${date} has been submitted and is ready for review.`,
    action_key: 'manager_attendance',
    recipient_role: 'whole_manager',
    recipient_site_id: site_id,
  } as any)

  return NextResponse.json(data)
}

// PUT /api/attendance — add a new labour worker to the site roster
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, name, role_title, worker_type } = await req.json()
  if (!site_id || !name) return NextResponse.json({ error: 'site_id and name are required' }, { status: 400 })

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['engineer', 'storekeeper', 'whole_manager', 'ceo', 'finance'],
    site_id
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const { data, error } = await supabase
    .from('workers')
    .insert({
      site_id,
      name: name.trim(),
      role_title: role_title?.trim() || 'Daily Laborer',
      worker_type: worker_type || 'labor',
      is_active: true,
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
