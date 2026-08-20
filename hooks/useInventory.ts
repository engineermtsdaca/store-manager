import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { InventoryItem } from '@/lib/database.types'

export function useInventory(siteId: string | null) {
  const supabase = createClient()
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInventory = useCallback(async () => {
    if (!siteId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('site_id', siteId)
      .order('name')

    if (error) setError(error.message)
    else setInventory(data ?? [])
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    fetchInventory()

    // Real-time subscription
    const channel = supabase
      .channel(`inventory:${siteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `site_id=eq.${siteId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setInventory(prev =>
              prev.map(item => item.id === (payload.new as InventoryItem).id
                ? payload.new as InventoryItem
                : item)
            )
          }
          if (payload.eventType === 'INSERT') {
            setInventory(prev => [...prev, payload.new as InventoryItem])
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [siteId, fetchInventory])

  const addItem = async (name: string, unit: string, quantity: number, source: 'received' | 'bought', fromSite?: string) => {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, name, unit, quantity, source, from_site: fromSite }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  const logUsage = async (itemId: string, quantity: number, notes?: string) => {
    const res = await fetch('/api/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, item_id: itemId, quantity, notes }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  return { inventory, loading, error, addItem, logUsage, refresh: fetchInventory }
}
