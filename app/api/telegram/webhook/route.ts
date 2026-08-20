import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function sendMessage(chatId: string | number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json()
    const message = update.message
    if (!message?.text) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    let text = message.text.trim()

    console.log(`[Webhook] From ${chatId}: ${text}`)

    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/)
      if (parts[1]?.startsWith('link_')) {
        text = `/link ${parts[1].replace('link_', '')}`
      } else {
        await sendMessage(chatId, `🏗️ <b>Cappadocia Store System</b>\n\nWelcome! Commands:\n• <code>/link USERNAME</code> — Link your account\n• <code>/unlink</code> — Unlink your account`)
        return NextResponse.json({ ok: true })
      }
    }

    const admin = getAdminClient()

    if (text.toLowerCase().startsWith('/link ')) {
      const username = (text.split(/\s+/)[1] || '').toUpperCase()
      if (!username) {
        await sendMessage(chatId, '❌ Please provide your username.\n\nExample: <code>/link SK1</code>')
        return NextResponse.json({ ok: true })
      }

      const { data: profile } = await admin.from('user_profiles').select('id, name_en, telegram_chat_id').eq('username', username).single()
      if (!profile) {
        await sendMessage(chatId, `❌ Username <b>${username}</b> not found. Check your username and try again.`)
        return NextResponse.json({ ok: true })
      }

      const { data: existing } = await admin.from('user_profiles').select('id, username').eq('telegram_chat_id', chatId.toString()).neq('id', profile.id).maybeSingle()
      if (existing) {
        await sendMessage(chatId, `⚠️ This Telegram is already linked to <b>${existing.username}</b>.`)
        return NextResponse.json({ ok: true })
      }

      const { error } = await admin.from('user_profiles').update({ telegram_chat_id: chatId.toString() }).eq('id', profile.id)
      if (error) {
        await sendMessage(chatId, '❌ Failed to link account. Please try again.')
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chatId, `✅ <b>Account Linked!</b>\n\nYour Telegram is now linked to:\n👤 <b>${username}</b> (${profile.name_en})\n\nYou will receive notifications and password reset codes here.`)
      return NextResponse.json({ ok: true })
    }

    if (text === '/unlink') {
      const { data: profile } = await admin.from('user_profiles').select('id, username, name_en').eq('telegram_chat_id', chatId.toString()).maybeSingle()
      if (!profile) {
        await sendMessage(chatId, '⚠️ No account is currently linked to this Telegram.')
        return NextResponse.json({ ok: true })
      }

      await admin.from('user_profiles').update({ telegram_chat_id: null }).eq('id', profile.id)
      await sendMessage(chatId, `🔓 Account <b>${profile.username}</b> has been unlinked.`)
      return NextResponse.json({ ok: true })
    }

    await sendMessage(chatId, `🤖 Commands:\n• <code>/link USERNAME</code>\n• <code>/unlink</code>\n• <code>/start</code>`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
