import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

export const DEFAULT_FALLBACK_INTERVAL_MS = 12000;

export function useRealtimeSync({
  onSync,
  events = [],
  fallbackIntervalMs = DEFAULT_FALLBACK_INTERVAL_MS,
  enabled = true,
}) {
  const { isConnected, isConnecting, connectionError, subscribe, onReconnect } = useSocket();
  const [lastSyncTime, setLastSyncTime] = useState(() => new Date());
  const isSyncingRef = useRef(false);
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const triggerSync = useCallback(async (meta = {}) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      if (typeof onSyncRef.current === 'function') {
        await onSyncRef.current(meta);
      }
      setLastSyncTime(new Date());
    } catch (err) {
      console.warn('[useRealtimeSync] Sync error:', err?.message || err);
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !events || events.length === 0) return;

    const unsubscribers = events.map((eventName) => {
      return subscribe(eventName, (payload) => {
        triggerSync({ source: 'socket', event: eventName, payload });
      });
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [enabled, events, subscribe, triggerSync]);

  useEffect(() => {
    if (!enabled) return;
    const unsub = onReconnect(() => {
      triggerSync({ source: 'reconnect' });
    });
    return unsub;
  }, [enabled, onReconnect, triggerSync]);

  useEffect(() => {
    if (!enabled) return;

    if (isConnected) {
      return;
    }

    const intervalId = setInterval(() => {
      triggerSync({ source: 'poll' });
    }, fallbackIntervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, isConnected, fallbackIntervalMs, triggerSync]);

  return {
    isConnected,
    isConnecting,
    isPolling: !isConnected,
    connectionError,
    lastSyncTime,
    triggerSync,
  };
}

export default useRealtimeSync;
