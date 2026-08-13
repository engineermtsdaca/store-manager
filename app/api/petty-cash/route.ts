import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'

// GET /api/petty-cash?site_id=xxx
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteId = req.nextUrl.searchParams.get('site_id')

  // SECURITY (HIGH-06): Validate site_id against user's profile to prevent IDOR
  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'engineer', 'whole_manager', 'ceo', 'finance', 'payer', 'purchaser', 'purchase_assistant'],
    siteId
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const [accountRes, logsRes] = await Promise.all([
    supabase.from('petty_cash_accounts').select('*').eq('site_id', siteId!).single(),
    supabase.from('petty_cash_logs').select('*').eq('site_id', siteId!).order('created_at', { ascending: false }).limit(100)
  ])

  return NextResponse.json({ account: accountRes.data, logs: logsRes.data })
}

// POST /api/petty-cash — log expense
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, description, amount, item_name, receipt_url } = await req.json()

  const { data, error } = await supabase.rpc('log_petty_cash_expense', {
    p_site_id: site_id,
    p_description: description,
    p_amount: amount,
    p_item_name: item_name ?? null,
    p_receipt_url: receipt_url ?? null,
    p_user_id: user.id,
  } as any)

  const result = data as any
  if (error || !result?.success) return NextResponse.json({ error: result?.error || 'Internal server error' }, { status: 400 })
  return NextResponse.json(data)
}

// PATCH /api/petty-cash — payer replenishes
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  const role = (profile as any)?.role
  if (role !== 'payer' && role !== 'whole_manager' && role !== 'ceo') {
     return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { site_id } = await req.json()

  const { data: accountData } = await supabase
    .from('petty_cash_accounts').select('*').eq('site_id', site_id).single()

  const account = accountData as any
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const topUp = account.max_balance - account.balance

  await supabase.from('petty_cash_accounts')
    .update({ balance: account.max_balance } as any).eq('site_id', site_id)

  await supabase.from('petty_cash_logs').insert({
    site_id,
    description: 'Petty cash replenishment',
    amount: topUp,
    is_audited: true,
    performed_by: user.id,
  } as any)

  return NextResponse.json({ success: true, new_balance: account.max_balance })
}
