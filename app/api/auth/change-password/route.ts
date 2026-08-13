import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// POST /api/auth/change-password
// Body: { current_password, new_password, recovery_phone? }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { current_password, new_password } = await req.json()

    if (!new_password || new_password.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }
    if (!current_password) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(user.id)
    
    if (userError || !userData.user?.email) {
      console.error('Admin API Error:', userError)
      return NextResponse.json({ error: 'Failed to find user or invalid admin key' }, { status: 400 })
    }

    const tempClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { error: verifyError } = await tempClient.auth.signInWithPassword({
      email: userData.user.email,
      password: current_password,
    })
    if (verifyError) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    await tempClient.auth.signOut()

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: new_password,
    })
    if (updateError) {
      console.error('Update Error:', updateError)
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Change password exception:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
