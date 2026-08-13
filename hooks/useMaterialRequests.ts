import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export interface MaterialRequest {
  id: string
  req_number?: string
  site: string
  site_id: string
  item: string
  qty: number
  status: 'pending_engineer' | 'delivered' | 'approved_instock' | 'ordered' | 'cancelled' | 'ordered_pending' | 'storekeeper_approved'

  requestedBy: string
  created_at: string
}

export function useMaterialRequests(siteId?: string) {
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([])
  const supabase = createClient()

  const fetchRequests = async () => {
    try {
      const url = siteId ? `/api/material-requests?site_id=${siteId}` : '/api/material-requests'
      const res = await fetch(url)
      const data = await res.json()
      
      if (!res.ok) {
        console.error('Error fetching material requests:', data.error)
        return
      }

      // Map DB shape to UI shape
      const mapped = data.map((d: any) => ({
        id: d.id,
        site_id: d.site_id,
        site: d.sites?.name || d.site_id,
        item: d.item,
        qty: d.qty,
        status: d.status,
        req_number: d.req_number,
        requestedBy: d.user_profiles?.name_en || d.user_profiles?.username || d.requested_by,
        created_at: d.created_at
      }))
      setMaterialRequests(mapped as MaterialRequest[])
    } catch (err) {
      console.error('Failed to fetch requests', err)
    }
  }

  useEffect(() => {
    fetchRequests()

    const channel = supabase
      .channel('realtime_material_requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_requests' },
        (payload) => {
          fetchRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [siteId])

  return { materialRequests, refresh: fetchRequests }
}
