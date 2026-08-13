import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'

// POST /api/payer/release — payer releases bank payment
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { po_id, bank_name, bank_ref, screenshot_url } = await req.json()

  const { authorized, error: authError } = await requireRole(
    supabase as any,
    user.id,
    ['payer', 'ceo']
  )
  if (!authorized) return NextResponse.json({ error: authError }, { status: 403 })

  const { data, error } = await supabase.rpc('payer_release_payment', {
    p_po_id: po_id,
    p_bank_name: bank_name,
    p_bank_ref: bank_ref,
    p_screenshot_url: screenshot_url ?? null,
    p_user_id: user.id,
  } as any)

  const result = data as any
  if (error || !result?.success) return NextResponse.json({ error: 'Internal server error' }, { status: 400 })
  return NextResponse.json({ success: true })
}
