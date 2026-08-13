import { useState, useCallback } from 'react';

export interface Receipt {
  id: string;
  receipt_number: string;
  action_type: string;
  details: any;
  site_id: string | null;
  user_id: string;
  created_at: string;
  user_profiles?: { name_en: string; role: string; signature_url?: string | null };

  sites?: { name: string };
}

export function useReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pendingReceipt, setPendingReceipt] = useState<Receipt | null>(null);

  const fetchReceipts = useCallback(async (siteId?: string | null, userId?: string | null) => {
    let url = '/api/receipts?';
    if (siteId) url += `site_id=${siteId}&`;
    if (userId) url += `user_id=${userId}&`;

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setReceipts(data);
    }
  }, []);

  const generateReceipt = async (action_type: string, details: any, site_id?: string | null) => {
    const payload = { action_type, details, site_id };
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const receipt = await res.json();
        setPendingReceipt(receipt);
        setReceipts(prev => [receipt, ...prev]);
      } else {
        throw new Error('API failed');
      }
    } catch (err) {
      console.warn("Receipt API failed (likely missing table). Queuing offline action.");
      import('@/lib/syncQueue').then(({ syncQueue }) => {
        syncQueue.enqueue('/api/receipts', 'POST', payload);
      });

      const offlineReceipt: Receipt = {
        id: 'offline-' + Date.now(),
        receipt_number: 'REC-' + Date.now().toString().slice(-6) + '-OFFLINE',
        action_type,
        details,
        site_id: site_id || null,
        user_id: 'unknown',
        created_at: new Date().toISOString()
      };
      setPendingReceipt(offlineReceipt);
    }
  };

  const openReceiptModal = (receipt: Receipt) => setPendingReceipt(receipt);
  const closeReceiptModal = () => setPendingReceipt(null);

  return { receipts, fetchReceipts, generateReceipt, pendingReceipt, openReceiptModal, closeReceiptModal };
}
