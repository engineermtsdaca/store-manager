import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'

// POST /api/inventory — add/receive inventory item
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, name, unit, quantity, source, from_site } = await req.json()

  let final_from_site_id = null
  if (from_site) {
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(from_site)
    if (isUUID) {
      final_from_site_id = from_site
    } else {
      const { data: siteObj } = await supabase.from('sites').select('id').eq('name', from_site).single()
      if (siteObj) final_from_site_id = siteObj.id
    }
  }

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'manager', 'whole_manager'],
    site_id
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const { data, error } = await supabase.rpc('add_inventory_item', {
    p_site_id: site_id,
    p_name: name,
    p_unit: unit,
    p_quantity: quantity,
    p_source: source,
    p_user_id: user.id,
    p_from_site_id: final_from_site_id
  } as any)

  const result = data as any
  if (error || !result?.success) return NextResponse.json({ error: result?.error || 'Internal server error' }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

// PUT /api/inventory — log inventory usage (SIV)
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { site_id, item_id, quantity, notes } = await req.json()

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['storekeeper', 'manager', 'whole_manager'],
    site_id
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const { data, error } = await supabase.rpc('log_inventory_usage', {
    p_site_id: site_id,
    p_item_id: item_id,
    p_quantity: quantity,
    p_user_id: user.id,
    p_notes: notes ?? null,
  } as any)

  const result = data as any
  if (error || !result?.success) return NextResponse.json({ error: result?.error || 'Internal server error' }, { status: 400 })
  return NextResponse.json(data)
}
