import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

// GET /api/telegram-webhook — health check / setup info
export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'Cappadocia Store System Telegram Webhook',
    setup: `To register webhook: POST https://api.telegram.org/bot${BOT_TOKEN}/setWebhook with {"url": "https://YOUR_DOMAIN/api/telegram-webhook"}`,
  })
}

// SECURITY: Verify the request genuinely came from Telegram.
// Telegram sends the secret token (configured when registering the webhook via
// setWebhook's `secret_token` param) in this header on every update. Without this
// check, anyone who knows the URL could POST fake updates (e.g. /link USERNAME to
// hijack another user's account and receive their reset OTP).
//
// Graceful rollout: if TELEGRAM_WEBHOOK_SECRET is not configured, we warn but still
// accept, so the currently-registered webhook is not broken. Set the secret in
// .env.local AND re-run setWebhook with the same secret_token to enforce it.
function isFromTelegram(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) {
    console.warn(
      'telegram-webhook: TELEGRAM_WEBHOOK_SECRET is not configured — webhook authenticity ' +
      'is NOT verified. Set it in .env.local and pass the same secret_token to setWebhook.'
    )
    return true
  }
  return req.headers.get('x-telegram-bot-api-secret-token') === expected
}

// POST /api/telegram-webhook — receives updates from Telegram
// Telegram calls this endpoint when someone messages the bot
export async function POST(req: NextRequest) {
  try {
    // Reject forged requests that don't carry Telegram's secret token.
    if (!isFromTelegram(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const message = body.message

    // Ignore non-message updates (edits, callbacks, etc.)
    if (!message?.text) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const fromId = message.from?.id
    let text = (message.text || '').trim()

    const admin = getAdminClient()

    // --- /start command ---
    if (text.startsWith('/start')) {
      // Check if it's a deep link (e.g. /start link_SK1)
      const parts = text.split(/\s+/)
      if (parts[1] && parts[1].startsWith('link_')) {
        // Rewrite text to act like a /link command and fall through to the /link handler below
        const deepLinkUsername = parts[1].replace('link_', '')
        text = `/link ${deepLinkUsername}`
      } else {
        await sendTelegramMessage(
          chatId,
          `🏗️ <b>Cappadocia Store System</b>\n\nWelcome! This bot is used for password reset OTP delivery.\n\nTo link your account, send:\n<code>/link YOUR_USERNAME</code>\n\nExample: <code>/link SK1</code>`
        )
        return NextResponse.json({ ok: true })
      }
    }

    // --- /link USERNAME command ---
    if (text.toLowerCase().startsWith('/link ')) {
      const usernameRaw = text.split(/\s+/)[1] || ''
      const username = usernameRaw.trim().toUpperCase()

      if (!username) {
        await sendTelegramMessage(chatId, '❌ Please provide your username.\n\nExample: <code>/link SK1</code>')
        return NextResponse.json({ ok: true })
      }

      // Find user profile by username
      const { data: profile } = await admin
        .from('user_profiles')
        .select('id, name_en, telegram_chat_id')
        .eq('username', username)
        .single()

      if (!profile) {
        await sendTelegramMessage(
          chatId,
          `❌ Username <b>${username}</b> not found.\n\nPlease check your username and try again.\nExample: <code>/link SK1</code>`
        )
        return NextResponse.json({ ok: true })
      }

      // Check if this Telegram account is already linked to a DIFFERENT user
      const { data: existing } = await admin
        .from('user_profiles')
        .select('id, username')
        .eq('telegram_chat_id', chatId.toString())
        .neq('id', profile.id)
        .single()

      if (existing) {
        await sendTelegramMessage(
          chatId,
          `⚠️ This Telegram account is already linked to user <b>${existing.username}</b>.\n\nIf this is incorrect, please contact your administrator.`
        )
        return NextResponse.json({ ok: true })
      }

      // Save the Telegram chat_id to the user profile
      const { error } = await admin
        .from('user_profiles')
        .update({ telegram_chat_id: chatId.toString() } as any)
        .eq('id', profile.id)

      if (error) {
        await sendTelegramMessage(chatId, '❌ Failed to link account. Please try again later or contact admin.')
        return NextResponse.json({ ok: true })
      }

      await sendTelegramMessage(
        chatId,
        `✅ <b>Account Linked Successfully!</b>\n\nYour Telegram is now linked to the Cappadocia Store System account:\n👤 <b>${username}</b> (${profile.name_en})\n\nYou will receive your password reset codes here.`
      )
      return NextResponse.json({ ok: true })
    }

    // --- /unlink command ---
    if (text === '/unlink') {
      // Find which account is linked to this chat
      const { data: profile } = await admin
        .from('user_profiles')
        .select('id, username, name_en')
        .eq('telegram_chat_id', chatId.toString())
        .single()

      if (!profile) {
        await sendTelegramMessage(chatId, '⚠️ No account is currently linked to this Telegram.')
        return NextResponse.json({ ok: true })
      }

      await admin
        .from('user_profiles')
        .update({ telegram_chat_id: null } as any)
        .eq('id', profile.id)

      await sendTelegramMessage(
        chatId,
        `🔓 Account <b>${profile.username}</b> (${profile.name_en}) has been unlinked from this Telegram.`
      )
      return NextResponse.json({ ok: true })
    }

    // --- Unknown command ---
    await sendTelegramMessage(
      chatId,
      `🤖 Cappadocia Store System Bot\n\nAvailable commands:\n• <code>/link USERNAME</code> — Link your account\n• <code>/unlink</code> — Unlink your account\n• <code>/start</code> — Show this help`
    )
  } catch (err: any) {
    console.error('Telegram webhook error:', err)
  }

  return NextResponse.json({ ok: true })
}
