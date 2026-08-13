import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { MaterialTransfer } from '@/lib/database.types'

export function useTransfers(siteId?: string | null) {
  const supabase = createClient()
  const [transfers, setTransfers] = useState<MaterialTransfer[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTransfers = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('material_transfers')
      .select('*')
      .order('created_at', { ascending: false })

    if (siteId) query = query.eq('source_site_id', siteId)

    const { data } = await query
    setTransfers((data as MaterialTransfer[]) ?? [])
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    fetchTransfers()

    const channel = supabase
      .channel('material_transfers:all')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_transfers' },
        () => fetchTransfers()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchTransfers])

  const requestTransfer = async (data: {
    item_id: string; item_name: string; qty: number; unit: string;
    dest_site_id: string; transfer_type: 'intra' | 'inter'
  }) => {
    const res = await fetch('/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_site_id: siteId, ...data }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    return await res.json()
  }

  const managerDecision = async (transferId: string, decision: 'approve' | 'reject') => {
    const res = await fetch('/api/transfers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transfer_id: transferId, action: 'manager_decision', decision }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  const financeVerify = async (transferId: string) => {
    const res = await fetch('/api/transfers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transfer_id: transferId, action: 'finance_verify' }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  return { transfers, loading, requestTransfer, managerDecision, financeVerify, refresh: fetchTransfers }
}
