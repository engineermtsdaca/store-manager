import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    // SECURITY: never log credentials (plaintext password logging removed).
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    // Get client IP from headers (req.ip is not available in Next.js App Router)
    const rawIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown-ip'
    const ip = rawIp.split(',')[0].trim()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // SECURITY (LOW-02): Account Lockout / Rate Limiting for Login
    // Limit to 5 attempts per 15 minutes (900 seconds)
    if (supabaseServiceKey && ip !== 'unknown-ip' && !ip.includes('127.0.0.1') && ip !== '::1') {
      const adminSupabase = createAdminClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false }
      })
      const { data: allowed } = await adminSupabase.rpc('check_rate_limit', {
        p_ip: ip + '_login',
        p_max_requests: 5,
        p_window_seconds: 900
      })
      if (allowed === false) {
        return NextResponse.json({ error: 'Too many login attempts. Please try again later.' }, { status: 429 })
      }
    }

    const supabase = await createClient()
    const email = `${username.toLowerCase()}@cappadocia.internal`

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // SECURITY (LOW-01): Generic error message so account existence is not revealed
      return NextResponse.json({ error: 'Incorrect username or password' }, { status: 401 })
    }

    return NextResponse.json({ success: true, session: data.session })

  } catch (err: any) {
    // SECURITY/RELIABILITY: A genuine auth failure is already handled above with a
    // generic 401. Reaching this catch means an *unexpected* exception (bad JSON,
    // DB/network failure, misconfig). Returning 401 here would mask real bugs, so we
    // log server-side and return 500 without leaking internal details to the client.
    console.error('Login route exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
