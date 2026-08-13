export interface QueuedAction {
  id: string;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  payload: any;
  timestamp: string;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
  retryCount?: number;
}

const QUEUE_KEY = 'store_manager_sync_queue';

export const syncQueue = {
  getQueue: (): QueuedAction[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      let parsed = stored ? JSON.parse(stored) : [];
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      parsed = parsed.filter((item: any) => new Date(item.timestamp).getTime() > oneDayAgo);
      return parsed;
    } catch (err) {
      console.error('Failed to parse sync queue', err);
      return [];
    }
  },

  saveQueue: (queue: QueuedAction[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    // Dispatch custom event for UI updates
    window.dispatchEvent(new Event('sync-queue-updated'));
  },

  enqueue: (endpoint: string, method: QueuedAction['method'], payload: any): QueuedAction => {
    const queue = syncQueue.getQueue();
    const newAction: QueuedAction = {
      id: `sq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      endpoint,
      method,
      payload,
      timestamp: new Date().toISOString(),
      status: 'pending',
      retryCount: 0
    };
    queue.push(newAction);
    syncQueue.saveQueue(queue);
    return newAction;
  },

  remove: (id: string) => {
    const queue = syncQueue.getQueue();
    const updated = queue.filter(q => q.id !== id);
    syncQueue.saveQueue(updated);
  },

  updateStatus: (id: string, status: QueuedAction['status'], error?: string, incrementRetry: boolean = false) => {
    const queue = syncQueue.getQueue();
    const itemIndex = queue.findIndex(q => q.id === id);
    if (itemIndex > -1) {
      queue[itemIndex].status = status;
      if (error) queue[itemIndex].error = error;
      if (incrementRetry) queue[itemIndex].retryCount = (queue[itemIndex].retryCount || 0) + 1;
      syncQueue.saveQueue(queue);
    }
  },

  processQueue: async (): Promise<boolean> => {
    if (typeof window === 'undefined') return true;
    if (!navigator.onLine) return false;

    const queue = syncQueue.getQueue();
    // Only process items that haven't failed twice
    const pendingItems = queue.filter(q => 
      (q.status === 'pending' || q.status === 'failed') && 
      (q.retryCount || 0) < 2
    );
    
    if (pendingItems.length === 0) return true;

    let allSuccessful = true;

    for (const item of pendingItems) {
      syncQueue.updateStatus(item.id, 'syncing');
      try {
        const response = await fetch(item.endpoint, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });

        if (response.ok) {
          syncQueue.remove(item.id);
        } else {
          allSuccessful = false;
          const errorData = await response.json().catch(() => ({}));
          syncQueue.updateStatus(item.id, 'failed', errorData.error || `HTTP ${response.status}`, true);
        }
      } catch (err: any) {
        allSuccessful = false;
        syncQueue.updateStatus(item.id, 'failed', err.message || 'Network error', true);
      }
    }
    return allSuccessful;
  },
  
  manualRetry: async (id: string): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    
    const queue = syncQueue.getQueue();
    const item = queue.find(q => q.id === id);
    if (!item) return false;
    
    syncQueue.updateStatus(item.id, 'syncing');
    try {
      const response = await fetch(item.endpoint, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });

      if (response.ok) {
        syncQueue.remove(item.id);
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        syncQueue.updateStatus(item.id, 'failed', errorData.error || `HTTP ${response.status}`);
        return false;
      }
    } catch (err: any) {
      syncQueue.updateStatus(item.id, 'failed', err.message || 'Network error');
      return false;
    }
  },
  
  safeSyncFetch: async (
    endpoint: string, 
    method: QueuedAction['method'], 
    payload: any,
    onAuthError?: () => void,
    onFallback?: (err: Error) => void
  ): Promise<{ ok: true } | { ok: false, fallback: true } | { ok: false, authError: true } | { ok: false, clientError: true }> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      syncQueue.enqueue(endpoint, method, payload);
      return { ok: false, fallback: true };
    }
    
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.status === 401) {
        if (onAuthError) onAuthError();
        return { ok: false, authError: true };
      }
      
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, clientError: true };
      }
      
            if (!res.ok) return { ok: false, clientError: true };
      
      return { ok: true };
    } catch (err: any) {
      // API request failed (e.g., 500, network error)
      syncQueue.enqueue(endpoint, method, payload);
      if (onFallback) onFallback(err);
      return { ok: false, fallback: true };
    }
  },
  
  initSyncQueue: () => {
    if (typeof window === 'undefined' || (window as any)._syncQueueInitialized) return;
    (window as any)._syncQueueInitialized = true;
    
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      // Only intercept POST, PATCH, PUT, DELETE to /api/
      if (typeof input === 'string' && input.startsWith('/api/') && init && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(init.method?.toUpperCase() || '')) {
        const method = init.method!.toUpperCase() as any;

        const payload = init.body ? JSON.parse(init.body as string) : {};
        
        // 1. If Offline
        if (!navigator.onLine) {
           syncQueue.enqueue(input, method, payload);
           return new Response(JSON.stringify({ error: "Offline: Your action is saved locally and will sync when you are back online." }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. If Online
        try {
           const res = await originalFetch(input, init);
           
           if (res.status === 401) {
              alert('Session expired. Please log in again.');
              window.location.href = '/login';
              return res; // let it propagate
           }
           
           // If it's a client error (400-499), DO NOT enqueue it. Let it propagate.
           if (res.status >= 400 && res.status < 500) {
               return res;
           }

                      if (!res.ok) {
               // Server error (500+). We DO NOT enqueue this for retry anymore to prevent data inconsistency.
               return res;
           }
           return res;
           
        } catch (err: any) {
           // Failed while online (server error or network error)
           syncQueue.enqueue(input, method, payload);
           
           // Return 503 so the UI correctly aborts its optimistic update, while informing the user
           return new Response(JSON.stringify({ error: "Network error: You appear to be offline. Your action is saved locally and will sync when you are back online." }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return originalFetch(input, init);
    };
    
    // Also try to process queue when coming online
    window.addEventListener('online', () => {
      syncQueue.processQueue();
    });
  }
};
