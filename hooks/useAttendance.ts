import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Worker, AttendanceRecord } from '@/lib/database.types'

export interface WorkerWithAttendance extends Worker {
  present: boolean
}

export function useAttendance(siteId?: string | null) {
  const supabase = createClient()
  const [workers, setWorkers] = useState<WorkerWithAttendance[]>([])
  const [attendanceSubmitted, setAttendanceSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)

  const todayStr = new Date().toISOString().slice(0, 10)

  const fetchWorkers = useCallback(async () => {
    if (!siteId) { setLoading(false); return }
    setLoading(true)

    // Get workers for this site
    const { data: workerData } = await supabase
      .from('workers')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('worker_type')

    // Get today's attendance if it exists
    const { data: attendanceData } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('site_id', siteId)
      .eq('record_date', todayStr)

    const attendanceMap: Record<string, boolean> = {}
    if (attendanceData) {
      attendanceData.forEach((rec: AttendanceRecord) => {
        attendanceMap[rec.worker_id] = rec.is_present
      })
    }

    const workersWithAttendance: WorkerWithAttendance[] = (workerData ?? []).map((w: Worker) => ({
      ...w,
      present: attendanceMap[w.id] ?? false,
    }))

    setWorkers(workersWithAttendance)
    setAttendanceSubmitted(attendanceData ? attendanceData.length > 0 : false)
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    fetchWorkers()
  }, [fetchWorkers])

  const toggleWorker = (workerId: string) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, present: !w.present } : w))
  }

  const submitAttendance = async () => {
    if (!siteId) return

    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: siteId,
        date: todayStr,
        records: workers.map(w => ({ worker_id: w.id, is_present: w.present })),
      }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    setAttendanceSubmitted(true)
  }

  return { workers, loading, attendanceSubmitted, toggleWorker, submitAttendance, refresh: fetchWorkers }
}
