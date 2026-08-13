import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { WastageReport } from '@/lib/database.types'

export function useWastage(siteId?: string | null) {
  const supabase = createClient()
  const [wastageReports, setWastageReports] = useState<WastageReport[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWastage = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('wastage_reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (siteId) query = query.eq('site_id', siteId)

    const { data } = await query
    setWastageReports((data as WastageReport[]) ?? [])
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    fetchWastage()

    const channel = supabase
      .channel('wastage_reports:all')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wastage_reports' },
        () => fetchWastage()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchWastage])

  // logWastage now sends item_id + quantity to match the API route's rpc call
  const logWastage = async (data: {
    item_id: string; item_name: string; qty: number; reason: string;
    photo_name?: string; reporter_role: string
  }) => {
    const res = await fetch('/api/wastage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: siteId,
        item_id: data.item_id,
        quantity: data.qty,
        reason: data.reason,
        photo_url: data.photo_name,
        reporter_role: data.reporter_role,
      }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    return await res.json()
  }

  const reviewWastage = async (reportId: string) => {
    const res = await fetch('/api/wastage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
  }

  return { wastageReports, loading, logWastage, reviewWastage, refresh: fetchWastage }
}
