import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { SystemMessage, UserRole, CompanyName } from '@/lib/database.types'

export function useSystemMessages(role?: string, company?: string | null, siteId?: string | null) {
  const supabase = createClient()
  const [messages, setMessages] = useState<SystemMessage[]>([])

  useEffect(() => {
    // Clear messages when role changes (e.g. on logout/login without full page reload)
    setMessages([])
    
    if (!role) return;

    const fetchMessages = async () => {
      let query = supabase
        .from('system_messages')
        .select('*')
        .eq('is_dismissed', false)
        .eq('recipient_role', role)
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (company) {
        query = query.or(`recipient_company.eq.${company},recipient_company.is.null`);
      }
      if (siteId) {
        query = query.or(`recipient_site_id.eq.${siteId},recipient_site_id.is.null`);
      }

      const { data } = await query;
      setMessages(data ?? [])
    }

    fetchMessages()

    const channel = supabase
      .channel('system_messages:mine')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_messages' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const msg = payload.new as SystemMessage;
            if (msg.recipient_role !== role) return;
            if (company && msg.recipient_company && msg.recipient_company !== company) return;
            if (siteId && msg.recipient_site_id && msg.recipient_site_id !== siteId) return;
            setMessages(prev => [msg, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            const msg = payload.new as SystemMessage;
            if ((msg as any).is_dismissed) {
              setMessages(prev => prev.filter(m => m.id !== msg.id));
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [role, company, siteId])

  const dismiss = async (messageId: string) => {
    await fetch('/api/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId }),
    })
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }

  const clearAll = () => {
    messages.forEach(m => dismiss(m.id))
  }

  const sendMessage = async (
    title: string,
    body: string,
    actionKey: string,
    recipient: { role: UserRole; company?: CompanyName; site_id?: string }
  ) => {
    const payload = {
        title,
        body,
        action_key: actionKey,
        recipient_role: recipient.role,
        recipient_company: recipient.company ?? null,
        recipient_site_id: recipient.site_id ?? null,
    };
    
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
       const { syncQueue } = require('@/lib/syncQueue');
       syncQueue.enqueue('/api/messages', 'POST', payload);
       return;
    }
    
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('API failed');
    } catch (err) {
       const { syncQueue } = require('@/lib/syncQueue');
       syncQueue.enqueue('/api/messages', 'POST', payload);
    }
  }

  return { messages, unreadCount: messages.length, dismiss, clearAll, sendMessage }
}
