import { generateId } from '@/lib/utils'
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/receipts
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SECURITY (HIGH-06): Enforce site-scoping based on the user's actual profile
  // Do NOT blindly trust query params for scoping sensitive data
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, site_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  // Privileged roles can query cross-site (optionally filtering by query param)
  const privilegedRoles = ['whole_manager', 'ceo', 'finance', 'purchaser', 'purchase_assistant']
  const isPrivileged = privilegedRoles.includes(profile.role as string)

  // The client can still pass ?user_id= to filter by a specific user
  const filterUserId = req.nextUrl.searchParams.get('user_id')

  let query = supabase
    .from('action_receipts')
    .select('*, user_profiles(name_en, role), sites(name)')
    .order('created_at', { ascending: false })
    .limit(100) // SECURITY (MED-03): Hard limit to prevent memory bloat / DoS

  if (isPrivileged) {
    // Privileged: allow optional site_id param, but don't force it
    const reqSiteId = req.nextUrl.searchParams.get('site_id')
    if (reqSiteId) query = query.eq('site_id', reqSiteId)
  } else {
    // Non-privileged: ALWAYS scope to their own site
    if (profile.site_id) query = query.eq('site_id', profile.site_id)
    // Also restrict to their own records if they have no site (safety net)
    else query = query.eq('user_id', user.id)
  }

  if (filterUserId) query = query.eq('user_id', filterUserId)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/receipts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action_type, details, site_id } = await req.json()

  // Verify site scope
  const { data: profile } = await supabase.from('user_profiles').select('site_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  if (site_id && profile.site_id && profile.site_id !== site_id) {
    return NextResponse.json({ error: 'Cannot create receipts for other sites' }, { status: 403 })
  }

  const receipt_number = generateId('REC')

  const { data, error } = await supabase
    .from('action_receipts')
    .insert({
      receipt_number,
      action_type,
      details,
      site_id: site_id || null,
      user_id: user.id
    })
    .select()
    .single()

  if (error) {
    console.error("Supabase insert error for action_receipts:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 })
}
