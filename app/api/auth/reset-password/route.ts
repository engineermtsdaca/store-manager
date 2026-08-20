// app/api/auth/reset-password/route.ts
// ============================================================
// POST /api/auth/reset-password
// Body: { username: string, otp: string, new_password: string }
//
// 1. Look up user by username
// 2. Validate OTP + expiry
// 3. Reset password via admin client
// 4. Clear OTP fields
// ============================================================

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
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
    const { username, otp, new_password } = await req.json()

    if (!username?.trim() || !otp?.trim() || !new_password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
    if (new_password.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const admin = getAdminClient()

    // --- SECURITY: Brute-force protection on the OTP verify step ---
    // The OTP is only 6 digits (1,000,000 combinations), so without limits an
    // attacker could hammer it within the 15-min window. We use the existing
    // check_rate_limit RPC (same one used by login/forgot-password) to cap
    // verification attempts per IP AND per username. No schema change needed.
    const rawIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const ip = rawIp.split(',')[0].trim()
    const usernameKey = username.trim().toUpperCase()

    // Per-IP: max 10 verify attempts / 15 min (skip for localhost, matching other routes)
    if (ip !== 'unknown' && !ip.includes('127.0.0.1') && ip !== '::1') {
      const { data: ipAllowed } = await admin.rpc('check_rate_limit', {
        p_ip: ip + '_otp_verify',
        p_max_requests: 10,
        p_window_seconds: 900,
      })
      if (ipAllowed === false) {
        return NextResponse.json(
          { error: 'Too many attempts. Please try again in 15 minutes.' },
          { status: 429 }
        )
      }
    }

    // Per-username: max 5 verify attempts / 15 min, regardless of source IP
    const { data: userAllowed } = await admin.rpc('check_rate_limit', {
      p_ip: 'user_' + usernameKey + '_otp_verify',
      p_max_requests: 5,
      p_window_seconds: 900,
    })
    if (userAllowed === false) {
      // Too many failed attempts for this account — invalidate the OTP so it
      // cannot be brute-forced further. A fresh OTP must be requested (which is
      // itself rate-limited in forgot-password).
      await admin
        .from('user_profiles')
        .update({ reset_otp: null, reset_otp_expires_at: null } as any)
        .eq('username', usernameKey)
      return NextResponse.json(
        { error: 'Too many attempts. Please request a new code.' },
        { status: 429 }
      )
    }

    // --- Look up user with OTP fields ---
    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('id, username, telegram_chat_id, reset_otp, reset_otp_expires_at')
      .eq('username', username.trim().toUpperCase())
      .eq('is_active', true)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    const p = profile as any

    // --- Validate OTP ---
    if (!p.reset_otp || p.reset_otp !== otp.trim()) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }
    if (!p.reset_otp_expires_at || new Date(p.reset_otp_expires_at) < new Date()) {
      // Clear expired OTP
      await admin
        .from('user_profiles')
        .update({ reset_otp: null, reset_otp_expires_at: null } as any)
        .eq('id', p.id)
      return NextResponse.json({ error: 'OTP has expired. Please request a new one.' }, { status: 400 })
    }

    // --- Get the Supabase auth user ID from the email pattern ---
    const email = `${p.username.toLowerCase()}@cappadocia.internal`
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const authUser = userList?.users?.find((u: any) => u.email === email)

    if (!authUser) {
      return NextResponse.json({ error: 'User authentication record not found' }, { status: 400 })
    }

    // --- Update password ---
    const { error: pwError } = await admin.auth.admin.updateUserById(authUser.id, {
      password: new_password,
    })
    if (pwError) {
      console.error('Password update error:', pwError)
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
    }

    // --- Clear OTP fields ---
    await admin
      .from('user_profiles')
      .update({ reset_otp: null, reset_otp_expires_at: null } as any)
      .eq('id', p.id)

    // --- Notify via Telegram ---
    if (p.telegram_chat_id) {
      await sendTelegram(
        p.telegram_chat_id,
        `✅ <b>Password Reset Successful</b>\n\n` +
        `Your Cappadocia Store System password has been reset successfully.\n` +
        `If this wasn't you, contact your administrator immediately.`
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
