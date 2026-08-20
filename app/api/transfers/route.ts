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

// POST /api/transfers — storekeeper initiates
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let { source_site_id, dest_site_id, item_id, quantity, qty, transfer_type } = await req.json()

  // Handle destination site name to UUID mapping
  let final_dest_site_id = dest_site_id
  const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(dest_site_id)
  
  if (!isUUID && dest_site_id) {
    const { data: site } = await supabase.from('sites').select('id').eq('name', dest_site_id).single()
    if (!site) return NextResponse.json({ error: 'Destination site not found' }, { status: 400 })
    final_dest_site_id = site.id
  }

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'whole_manager', 'ceo'],
    source_site_id
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const { data, error } = await supabase.rpc('initiate_transfer', {
    p_source_site_id: source_site_id,
    p_dest_site_id: final_dest_site_id,
    p_item_id: item_id,
    p_quantity: quantity ?? qty,
    p_transfer_type: transfer_type,
    p_user_id: user.id,
  } as any)

  const result = data as any
  if (error || !result?.success) return NextResponse.json({ error: result?.error || 'Internal server error' }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/transfers — manager decision or finance verify
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const adminSupabase = getAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })


  const { transfer_id, action } = await req.json()
  if (!transfer_id || !action) return NextResponse.json({ error: 'transfer_id and action are required' }, { status: 400 })

  // Dismiss any existing system messages for this transfer
  await adminSupabase.from('system_messages')
    .update({ is_dismissed: true, is_read: true } as any)
    .eq('reference_id', transfer_id)

  if (action === 'manager_approve' || action === 'manager_return') {
    // Only managers can approve/return transfers
    const managerRoles = ['whole_manager', 'ceo']
    const { authorized, error: authError } = await requireRole(supabase as any, user.id, managerRoles)
    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden: Only managers can approve or return transfers' }, { status: 403 })
    }
    const { data, error } = await supabase.rpc('manager_transfer_decision', {
      p_transfer_id: transfer_id,
      p_decision: action === 'manager_approve' ? 'approve' : 'return',
      p_user_id: user.id,
    } as any)
    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'finance_verify') {
    // Only finance role can verify transfers
    const { authorized, error: authError } = await requireRole(supabase as any, user.id, ['finance'])
    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden: Only finance staff can verify transfers' }, { status: 403 })
    }
    const { data, error } = await supabase.rpc('finance_verify_transfer', {
      p_transfer_id: transfer_id,
      p_user_id: user.id,
    } as any)
    const result = data as any
    if (error || !result?.success) return NextResponse.json({ error: result?.error || 'Internal server error' }, { status: 400 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
