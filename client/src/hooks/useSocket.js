import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

let sharedSocket = null;
let activeConnectionCount = 0;
let lastKnownToken = null;

export function getSocketUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:5000';
}

export function useSocket() {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(Boolean(sharedSocket?.connected));
  const [isConnecting, setIsConnecting] = useState(Boolean(sharedSocket && !sharedSocket.connected));
  const [connectionError, setConnectionError] = useState(null);
  const reconnectListenersRef = useRef(new Set());

  useEffect(() => {
    activeConnectionCount++;
    const socketUrl = getSocketUrl();

    if (!sharedSocket || lastKnownToken !== token) {
      if (sharedSocket) {
        sharedSocket.disconnect();
      }

      lastKnownToken = token;
      setIsConnecting(true);

      sharedSocket = io(socketUrl, {
        auth: { token: token || null },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ['websocket', 'polling'],
      });
    }

    const s = sharedSocket;

    const handleConnect = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionError(null);
      for (const listener of reconnectListenersRef.current) {
        try {
          listener();
        } catch (e) {
          console.warn('[useSocket] Reconnect listener error:', e);
        }
      }
    };

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      setIsConnecting(reason === 'io client disconnect' ? false : true);
    };

    const handleConnectError = (err) => {
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionError(err?.message || 'Socket connection failed');
    };

    s.on('connect', handleConnect);
    s.on('disconnect', handleDisconnect);
    s.on('connect_error', handleConnectError);

    setIsConnected(Boolean(s.connected));

    return () => {
      activeConnectionCount--;
      s.off('connect', handleConnect);
      s.off('disconnect', handleDisconnect);
      s.off('connect_error', handleConnectError);

      if (activeConnectionCount <= 0) {
        activeConnectionCount = 0;
        setTimeout(() => {
          if (activeConnectionCount === 0 && sharedSocket) {
            sharedSocket.disconnect();
            sharedSocket = null;
          }
        }, 1000);
      }
    };
  }, [token]);

  const subscribe = useCallback((eventName, handler) => {
    if (!sharedSocket || !eventName || typeof handler !== 'function') {
      return () => {};
    }

    sharedSocket.on(eventName, handler);

    return () => {
      if (sharedSocket) {
        sharedSocket.off(eventName, handler);
      }
    };
  }, []);

  const onReconnect = useCallback((callback) => {
    if (typeof callback !== 'function') return () => {};
    reconnectListenersRef.current.add(callback);
    return () => {
      reconnectListenersRef.current.delete(callback);
    };
  }, []);

  return {
    socket: sharedSocket,
    isConnected,
    isConnecting,
    connectionError,
    subscribe,
    onReconnect,
  };
}

export default useSocket;
