import { generateId } from '@/lib/utils'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Use service role key to bypass RLS for administrative actions (like sending system messages)
const getAdminClient = (fallbackClient: any) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not configured, falling back to user client')
    return fallbackClient
  }
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name_en, role, site_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const adminSupabase = getAdminClient(supabase)
    const { reqId, itemName, qty, reason } = await req.json()

    // Subcontractor submitting a return
    if (profile.role === 'subcontractor') {
      const { error } = await adminSupabase.from('system_messages').insert({
        title: 'Material Return Request',
        body: `${profile.name_en} wants to return ${qty} of ${itemName}. Reason: ${reason}`,
        recipient_role: 'storekeeper',
        recipient_site_id: profile.site_id,
        action_key: 'pending_material_return',
        reference_id: reqId,
        reference_type: JSON.stringify({
          subcontractor: profile.name_en,
          item: itemName,
          qty: parseFloat(qty),
          reason: reason
        })
      })

      if (error) throw error

      // Generate receipt for subcontractor
      const receiptNum = generateId('RET')
      await adminSupabase.from('action_receipts').insert({
        receipt_number: receiptNum,
        action_type: 'Material Return Request',
        details: {
          item: itemName,
          qty_returned: parseFloat(qty),
          reason: reason,
          subcontractor: profile.name_en,
          status: 'Pending Storekeeper Approval'
        },
        site_id: profile.site_id,
        user_id: user.id
      })

      // Remove from received items list by updating qty.
      // If returned qty >= original qty, change status to pending_engineer so it leaves the list.
      // Otherwise reduce the qty.
      const { data: reqData } = await adminSupabase.from('material_requests')
        .select('qty').eq('id', reqId).single()
      
      if (reqData) {
        const remaining = reqData.qty - parseFloat(qty)
        if (remaining <= 0) {
          // All returned, remove from received items
          await adminSupabase.from('material_requests')
            .update({ status: 'pending_engineer' })
            .eq('id', reqId)
        } else {
          // Partial return, reduce qty
          await adminSupabase.from('material_requests')
            .update({ qty: remaining })
            .eq('id', reqId)
        }
      }

      return NextResponse.json({ success: true, receiptNumber: receiptNum })
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  } catch (err: any) {
    console.error('Material Returns API Error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('user_profiles').select('name_en, role, site_id').eq('id', user.id).single()
    if (!profile || profile.role !== 'storekeeper') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const adminSupabase = getAdminClient(supabase)
    const { messageId } = await req.json()
    if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })

    // Storekeeper approving a return
    const { data: msg } = await adminSupabase.from('system_messages').select('*').eq('id', messageId).single()
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    // SECURITY (HIGH-06): Verify this message is for the storekeeper's own site
    if (msg.recipient_site_id && msg.recipient_site_id !== profile.site_id) {
      return NextResponse.json({ error: 'Forbidden: This message is not for your site' }, { status: 403 })
    }

    const meta = msg.reference_type ? JSON.parse(msg.reference_type) : {}
    const qty = meta.qty
    const itemName = meta.item

    // Find the item in inventory
    const { data: itemData } = await supabase.from('inventory_items')
      .select('id, unit')
      .eq('name', itemName)
      .eq('site_id', profile.site_id)
      .single()

    if (!itemData) throw new Error('Inventory item not found')

    // Call log_inventory_usage with a negative quantity to add it back to remained
    const { error: rpcError, data: rpcData } = await supabase.rpc('log_inventory_usage', { 
      p_site_id: profile.site_id,
      p_item_id: itemData.id, 
      p_quantity: -qty,
      p_user_id: user.id,
      p_notes: `Returned by ${meta.subcontractor}. Reason: ${meta.reason}`
    })

    const rpcResult = rpcData as any
    if (rpcError || !rpcResult?.success) throw new Error(rpcResult?.error || 'Failed to update inventory')

    // Generate system message for Engineer (info only, no action needed)
    await adminSupabase.from('system_messages').insert({
      title: 'ℹ️ Material Return — For Your Info',
      body: `${meta.subcontractor} returned ${qty} ${itemData.unit} of "${itemName}" to the store. Reason: "${meta.reason}". Storekeeper: ${profile.name_en}.`,
      recipient_role: 'engineer',
      recipient_site_id: profile.site_id,
      action_key: 'info_only',
      reference_type: 'material_return'
    })

    // Delete the pending return message
    await adminSupabase.from('system_messages').delete().eq('id', messageId)

    return NextResponse.json({ 
      success: true, 
      subcontractorName: meta.subcontractor,
      itemName: itemName,
      qty: qty,
      unit: itemData.unit
    })

  } catch (err: any) {
    console.error('Material Returns API Error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
