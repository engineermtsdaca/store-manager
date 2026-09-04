import { generateId } from '@/lib/utils'
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'

// GET /api/material-requests — fetch requests
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteId = req.nextUrl.searchParams.get('site_id')
  
  // SECURITY (MED-06): Validate site_id against user's profile to prevent IDOR
  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'engineer', 'whole_manager', 'ceo', 'finance', 'payer', 'purchaser', 'purchase_assistant', 'subcontractor', 'manager', 'coordinator'],
    siteId
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  let query = supabase.from('material_requests').select('*, sites(name), user_profiles!material_requests_requested_by_fkey(name_en, username)').order('created_at', { ascending: false }).limit(100)
  
  if (siteId) {
    query = query.eq('site_id', siteId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/material-requests — subcontractor creates request
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, item, qty } = await req.json()
  const reqNum = generateId('REQ')

  // Trigger automatically handles sending notification to engineer
  const { data, error } = await supabase
    .from('material_requests')
    .insert({ req_number: reqNum, site_id, item, qty, requested_by: user.id, status: 'pending_engineer' } as any)
    .select().single()

  if (error) {
    console.error('Supabase Insert Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/material-requests — engineer or storekeeper decision
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  const role = (profile as any)?.role

  const body = await req.json()
  const { request_id, action, site_id, exact_item_name, approve_qty, split_action, remaining_qty } = body

  // Mark related notifications as read
  await supabase.from('system_messages')
    .update({ is_dismissed: true, is_read: true } as any)
    .eq('reference_id', request_id)

  if (action === 'engineer_approve_instock' || action === 'engineer_approve_partial') {
    if (role !== 'engineer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: originalReq } = await supabase.from('material_requests').select('*').eq('id', request_id).single()
    const isPartial = action === 'engineer_approve_partial'
    
    const updateData: any = { status: 'approved_instock' }
    if (isPartial) updateData.qty = approve_qty
    if (exact_item_name) updateData.item = exact_item_name
    await supabase.from('material_requests').update(updateData).eq('id', request_id)

    if (isPartial && originalReq && remaining_qty > 0) {
      const clonedReq = { ...originalReq }
      delete clonedReq.id
      delete clonedReq.created_at
      clonedReq.qty = remaining_qty
      clonedReq.status = split_action === 'cancel_remaining' ? 'cancelled' : 'ordered_pending'
      if (exact_item_name) clonedReq.item = exact_item_name
      
      const safeReqNum = clonedReq.req_number || generateId('REQ')
      clonedReq.req_number = safeReqNum + '-SPLIT'
      
      await supabase.from('material_requests').insert(clonedReq)
    }
  } else if (action === 'storekeeper_signoff') {
    if (role !== 'storekeeper') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: reqToSign, error: reqError } = await supabase.from('material_requests').select('*').eq('id', request_id).single()
    if (reqError || !reqToSign) {
      console.error('[SK Signoff] Request not found:', request_id, reqError)
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Try exact match first, then case-insensitive with ilike
    let invItem: any = null
    const { data: exactMatch } = await supabase.from('inventory_items')
      .select('id').eq('name', reqToSign.item).eq('site_id', reqToSign.site_id).single()
    
    if (exactMatch) {
      invItem = exactMatch
    } else {
      // Fallback: case-insensitive + trimmed match
      const { data: ilikeMatch } = await supabase.from('inventory_items')
        .select('id').ilike('name', reqToSign.item.trim()).eq('site_id', reqToSign.site_id).single()
      invItem = ilikeMatch
    }
    
    if (!invItem) {
      console.warn('[SK Signoff] Item not in inventory, proceeding with handover only. Item:', reqToSign.item, 'Site:', reqToSign.site_id)
    }
    
    // Deduct from inventory only if the item exists
    let inventoryDeducted = false
    if (invItem) {
      const { error: rpcError, data: rpcData } = await supabase.rpc('log_inventory_usage', { 
        p_site_id: reqToSign.site_id,
        p_item_id: invItem.id, 
        p_quantity: reqToSign.qty,
        p_user_id: user.id,
        p_notes: 'Approved via Material Request handover'
      })
      const rpcResult = rpcData as any;
      if (rpcError || !rpcResult?.success) {
        console.error('[SK Signoff] RPC failed:', rpcError, rpcResult)
        return NextResponse.json({ error: 'Failed to log usage: ' + (rpcResult?.error || rpcError?.message || 'Insufficient stock or internal error') }, { status: 500 })
      }
      inventoryDeducted = true
    }

    // Update the request status to delivered
    const { error: updateError } = await supabase.from('material_requests').update({ status: 'delivered' } as any).eq('id', request_id)
    if (updateError) {
      console.error('[SK Signoff] Update failed:', updateError)
      return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
    }

    // Fetch subcontractor name separately (safe even if requested_by is NULL)
    let subcontractorName = 'Unknown'
    if (reqToSign.requested_by) {
      const { data: scProfile } = await supabase.from('user_profiles').select('name_en').eq('id', reqToSign.requested_by).single()
      if (scProfile) subcontractorName = (scProfile as any).name_en || 'Unknown'
    }

    return NextResponse.json({ 
      success: true, 
      inventoryDeducted,
      subcontractorName,
      item: reqToSign.item,
      qty: reqToSign.qty
    })
  } else if (action === 'engineer_order') {
    if (role !== 'engineer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { from_sc_request, sc_request_id } = body
    const { data: req_ } = await supabase.from('material_requests').select('*').eq('id', request_id).single()
    const updateData: any = { status: 'ordered' }
    if (exact_item_name) updateData.item = exact_item_name
    await supabase.from('material_requests').update(updateData).eq('id', request_id)
    const requestData = req_ as any
    if (exact_item_name && requestData) requestData.item = exact_item_name
    if (requestData) {
      const { data: siteData } = await supabase.from('sites').select('company').eq('id', requestData.site_id).single()
      const company = (siteData as any)?.company || 'Cappadocia'

      // Triggers will automatically notify Site Manager (Addis)
      await supabase.from('purchase_orders').insert({
        po_number: generateId('PO'),
        site_id: requestData.site_id,
        company: company,
        item: requestData.item,
        qty: requestData.qty,
        status: 'pending_site_manager_req',
        proforma_attached: false,
        requested_by: user.id,
        from_sc_request: from_sc_request ?? false,
        sc_request_id: sc_request_id ?? null,
      } as any)
    }
  }

  return NextResponse.json({ success: true })
}
