import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { PurchaseOrder } from '@/lib/database.types'

export function usePurchaseOrders(siteId?: string | null, status?: string) {
  const supabase = createClient()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('purchase_orders')
      .select('*, sites(name, company)')
      .order('created_at', { ascending: false })

    if (siteId) query = query.eq('site_id', siteId)
    if (status) query = query.eq('status', status)

    const { data } = await query
    setOrders((data as PurchaseOrder[]) ?? [])
    setLoading(false)
  }, [siteId, status])

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel('purchase_orders:all')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => fetchOrders()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

  const updateStatus = async (poId: string, newStatus: string, extra?: Record<string, unknown>) => {
    const res = await fetch('/api/purchase-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ po_id: poId, new_status: newStatus, ...extra }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  const createOrder = async (data: {
    site_id: string; company: string; item: string; qty: number; estimated_price?: number
  }) => {
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    return await res.json()
  }

  return { orders, loading, updateStatus, createOrder, refresh: fetchOrders }
}
