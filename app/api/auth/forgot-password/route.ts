// app/api/auth/forgot-password/route.ts
// ============================================================
// POST /api/auth/forgot-password
// Body: { username: string }
//
// 1. Look up user by username
// 2. If no telegram_chat_id → return { error: 'no_telegram' }
// 3. Generate 6-digit OTP, store in DB (15 min TTL)
// 4. Send OTP to their Telegram
// ============================================================

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { sendTelegram } from '@/lib/telegram'

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json()
    if (!username?.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    // --- Rate limit: 3 requests per 15 minutes per IP ---
    const rawIp = req.headers.get('x-forwarded-for') || 'unknown'
    const ip = rawIp.split(',')[0].trim()
    const admin = getAdminClient()

    if (ip !== 'unknown' && !ip.includes('127.0.0.1') && ip !== '::1') {
      const { data: allowed } = await admin.rpc('check_rate_limit', {
        p_ip: ip + '_forgot',
        p_max_requests: 3,
        p_window_seconds: 900,
      })
      if (allowed === false) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again in 15 minutes.' },
          { status: 429 }
        )
      }
    }

    // --- Look up user ---
    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('id, username, name_en, telegram_chat_id')
      .eq('username', username.trim().toUpperCase())
      .eq('is_active', true)
      .single()

    if (profileError || !profile) {
      // Generic message — don't reveal whether user exists
      return NextResponse.json({
        error: 'no_telegram',
        message: 'No Telegram linked to this account. Contact your administrator.',
      })
    }

    if (!(profile as any).telegram_chat_id) {
      return NextResponse.json({
        error: 'no_telegram',
        message: 'No Telegram linked to this account. Contact your administrator.',
      })
    }

    // --- Generate 6-digit OTP (cryptographically secure) ---
    // randomInt(100000, 1000000) yields a uniform integer in [100000, 999999].
    const otp = String(randomInt(100000, 1000000))
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const { error: updateError } = await admin
      .from('user_profiles')
      .update({
        reset_otp: otp,
        reset_otp_expires_at: expiresAt,
      } as any)
      .eq('id', (profile as any).id)

    if (updateError) {
      console.error('OTP save error:', updateError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // --- Send OTP via Telegram ---
    await sendTelegram(
      (profile as any).telegram_chat_id,
      `🔐 <b>Cappadocia Store System — Password Reset</b>\n\n` +
      `Your one-time password (OTP) is:\n\n` +
      `<b><code>${otp}</code></b>\n\n` +
      `⏱ This code expires in <b>15 minutes</b>.\n` +
      `If you did not request this, please ignore this message.`
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('forgot-password error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
