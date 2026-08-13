import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PettyCashAccount, PettyCashLog } from '@/lib/database.types'

export function usePettyCash(siteId: string | null) {
  const supabase = createClient()
  const [account, setAccount] = useState<PettyCashAccount | null>(null)
  const [logs, setLogs] = useState<PettyCashLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!siteId) return
    const fetch_ = async () => {
      const [accRes, logsRes] = await Promise.all([
        supabase.from('petty_cash_accounts').select('*').eq('site_id', siteId).single(),
        supabase.from('petty_cash_logs').select('*').eq('site_id', siteId).order('created_at', { ascending: false }),
      ])
      setAccount(accRes.data)
      setLogs(logsRes.data ?? [])
      setLoading(false)
    }
    fetch_()

    const channel = supabase
      .channel(`petty_cash:${siteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'petty_cash_accounts', filter: `site_id=eq.${siteId}` },
        (p) => setAccount(p.new as PettyCashAccount))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'petty_cash_logs', filter: `site_id=eq.${siteId}` },
        (p) => setLogs(prev => [p.new as PettyCashLog, ...prev]))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [siteId])

  const logExpense = async (description: string, amount: number, itemName?: string, receiptUrl?: string) => {
    const res = await fetch('/api/petty-cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, description, amount, item_name: itemName, receipt_url: receiptUrl }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  const replenish = async () => {
    await fetch('/api/petty-cash', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId }),
    })
  }

  const auditLog = async (logId: string) => {
    await supabase.from('petty_cash_logs').update({ is_audited: true } as any).eq('id', logId)
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, is_audited: true } : l))
  }

  return { account, logs, loading, logExpense, replenish, auditLog }
}
