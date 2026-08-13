import { generateId } from '@/lib/utils'
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'

// GET /api/purchase-orders
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteId = req.nextUrl.searchParams.get('site_id')
  const status = req.nextUrl.searchParams.get('status')

  // SECURITY (HIGH-06): Validate site_id against user's profile to prevent IDOR
  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'engineer', 'whole_manager', 'ceo', 'finance', 'payer', 'purchaser', 'purchase_assistant', 'manager', 'coordinator'],
    siteId
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  let query = supabase
    .from('purchase_orders')
    .select('*, sites(name, company)')
    .order('created_at', { ascending: false })
    .limit(100) // SECURITY (MED-03): Hard limit to prevent memory bloat / DoS

  if (siteId) query = query.eq('site_id', siteId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/purchase-orders — create PO draft
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, company, item, qty, estimated_price, from_sc_request, sc_request_id } = await req.json()

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'whole_manager', 'ceo', 'purchaser', 'purchase_assistant', 'engineer', 'manager', 'coordinator'],
    site_id
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const poNumber = generateId('PO')

  // System messages are now handled AUTOMATICALLY by the Postgres trigger we added in Phase 3
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      po_number: poNumber,
      site_id,
      company,
      item,
      qty,
      estimated_price,
      status: 'pending_site_manager_req',
      requested_by: user.id,
      from_sc_request: from_sc_request ?? false,
      sc_request_id: sc_request_id ?? null,
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/purchase-orders — update PO status workflow securely via RPCs
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user profile to know their role securely
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  const role = (profile as any)?.role

  const body = await req.json()
  const { po_id, new_status, action, bank_name, payment_screenshot_url, proforma_url } = body

  // System messages are handled automatically by the DB trigger now.
  // We just map the intended next status to our secure RPCs.

  let rpcName = ''
  let rpcParams: any = { p_po_id: po_id, p_user_id: user.id }

  if (action === 'sk_confirm_receipt' || new_status === 'sk_received') {
    rpcName = 'po_receive_goods'
  } else if (new_status === 'shipped') {
    rpcName = 'po_ship_goods'
  } else if (new_status === 'money_released') {
    rpcName = 'po_release_payment'
    rpcParams.p_bank_name = bank_name
    rpcParams.p_screenshot_url = payment_screenshot_url
  } else if (role === 'whole_manager' && new_status === 'pending_payer') {
    rpcName = 'po_approve_payment'
  } else if (new_status === 'pending_purchaser_sign' || new_status === 'pending_ceo_formal_paper' || (new_status === 'pending_whole_manager_payment' || new_status === 'pending_payer')) {
      const { data: v_po } = await supabase.from('purchase_orders').select('*').eq('id', po_id).single()
      let v_next_status = ''
      let updatePayload: any = {}
      
      if (role === 'purchase_assistant' && v_po.status === 'pending_pa_formal_paper') {
          v_next_status = 'pending_purchaser_sign'
          updatePayload = { status: v_next_status, pa_signed: true }
      } else if (role === 'purchaser' && v_po.status === 'pending_purchaser_sign') {
          v_next_status = 'pending_ceo_formal_paper'
          updatePayload = { status: v_next_status, purchaser_signed: true }
      } else if (role === 'ceo' && v_po.status === 'pending_ceo_formal_paper') {
          if (v_po.company === 'Cappadocia') {
              v_next_status = 'pending_whole_manager_payment'
          } else {
              v_next_status = 'pending_payer'
          }
          updatePayload = { status: v_next_status, ceo_signed: true }
      } else {
          return NextResponse.json({ error: 'Invalid role or PO status for formal paper sign' }, { status: 400 })
      }
      
      const { error: updateError } = await supabase.from('purchase_orders').update(updatePayload).eq('id', po_id)
      if (updateError) return NextResponse.json({ error: 'Failed to update PO' }, { status: 500 })
      return NextResponse.json({ success: true, new_status: v_next_status })

  } else if (new_status === 'pending_whole_manager_prof' || new_status === 'pending_ceo_prof' || new_status === 'pending_pa_formal_paper') {
    rpcName = 'po_approve_proforma'
    rpcParams.p_role = role
  } else if (new_status === 'pending_site_manager_prof') {
    rpcName = 'po_attach_proforma'
    rpcParams.p_url = proforma_url || 'attached'
  } else if (new_status === 'pending_whole_manager_req' || new_status === 'pending_ceo_req' || new_status === 'pending_purchaser_proforma') {
    rpcName = 'po_authorize_request'
    rpcParams.p_role = role
  } else if (new_status === 'blocked_mismatch' || (action === 'reject' && new_status === 'pending_purchaser_proforma')) {
    // Rejection handling
    if (action === 'reject' && new_status === 'pending_purchaser_proforma') {
       rpcName = 'po_approve_proforma'
       rpcParams.p_role = role
       rpcParams.p_reject = true
    } else {
       rpcName = 'po_reject_request'
       rpcParams.p_role = role
    }
  } else {
    return NextResponse.json({ error: 'Invalid state transition requested' }, { status: 400 })
  }

  // Call the chosen secure RPC
  if (rpcName) {
    const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName as any, rpcParams)
    if (rpcError) return NextResponse.json({ error: 'Internal server error: ' + rpcError.message }, { status: 500 })
    if (!(rpcData as any)?.success) return NextResponse.json({ error: (rpcData as any)?.error }, { status: 400 })
    return NextResponse.json({ success: true, new_status: (rpcData as any)?.new_status })
  }

  return NextResponse.json({ success: true })
}
