'use client';

import React, { useState, useEffect } from 'react';
import { syncQueue, QueuedAction } from '@/lib/syncQueue';

export default function SyncQueueIndicator() {
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateQueueState = () => {
    setQueue(syncQueue.getQueue());
  };

  useEffect(() => {
    updateQueueState();
    window.addEventListener('sync-queue-updated', updateQueueState);
    window.addEventListener('online', handleAutoSync);

    return () => {
      window.removeEventListener('sync-queue-updated', updateQueueState);
      window.removeEventListener('online', handleAutoSync);
    };
  }, []);

  const handleAutoSync = async () => {
    setIsSyncing(true);
    await syncQueue.processQueue();
    setIsSyncing(false);
  };

  const pendingCount = queue.filter(q => q.status === 'pending' || q.status === 'failed').length;

  if (pendingCount === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 animate-bounce">
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
        </span>
        <span>{pendingCount} Offline {pendingCount === 1 ? 'Action' : 'Actions'} Saved</span>
      </div>

      <button
        onClick={handleAutoSync}
        disabled={isSyncing}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl transition-all shadow"
      >
        {isSyncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
}
