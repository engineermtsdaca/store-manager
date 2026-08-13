// lib/telegram.ts
// ============================================================
// Server-only Telegram helper.
// Import this ONLY in API routes (never in client components).
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

/** Send a single HTML-formatted message to one Telegram chat. */
export async function sendTelegram(
  chatId: string | number,
  text: string
): Promise<void> {
  if (!BOT_TOKEN || !chatId) return
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      console.warn('[Telegram] sendMessage failed:', res.status, body)
    }
  } catch (err) {
    console.error('[Telegram] network error:', err)
  }
}

/**
 * Send a Telegram notification to all users that match the given filters.
 * Silently skips users whose telegram_chat_id is null.
 *
 * @param adminClient  Supabase admin client (service-role key)
 * @param filters      Mirrors the system_messages recipient columns
 * @param text         HTML-formatted message body
 */
export async function sendTelegramToMatchingUsers(
  adminClient: any,
  filters: {
    recipient_role?: string | null
    recipient_company?: string | null
    recipient_site_id?: string | null
    recipient_user_id?: string | null
  },
  text: string
): Promise<void> {
  if (!BOT_TOKEN) return

  try {
    let query = adminClient
      .from('user_profiles')
      .select('telegram_chat_id')
      .not('telegram_chat_id', 'is', null)
      .eq('is_active', true)

    // If targeting a specific user, skip role/company/site filters
    if (filters.recipient_user_id) {
      query = query.eq('id', filters.recipient_user_id)
    } else {
      if (filters.recipient_role)    query = query.eq('role', filters.recipient_role)
      if (filters.recipient_company) query = query.eq('company', filters.recipient_company)
      if (filters.recipient_site_id) query = query.eq('site_id', filters.recipient_site_id)
    }

    const { data, error } = await query
    if (error || !data?.length) return

    // Send to each matched user (sequentially to avoid Telegram rate-limit)
    for (const row of data as { telegram_chat_id: string }[]) {
      await sendTelegram(row.telegram_chat_id, text)
    }
  } catch (err) {
    console.error('[Telegram] sendTelegramToMatchingUsers error:', err)
  }
}
