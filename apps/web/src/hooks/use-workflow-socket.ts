'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useNotificationStore } from '@/stores/notification-store';
import { useOrgStore } from '@/stores/org-store';
import { useAuthStore } from '@/stores/auth-store';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Connect to the workflow / notification WebSocket gateway.
 *
 * Lifecycle:
 *  - Opens a single socket per authenticated session.
 *  - Re-opens on login (isAuthenticated flip) so the auth payload reflects the
 *    fresh access token.
 *  - Closes on logout / unmount.
 *  - When the active org changes, emits `switch-org` so the server can rebind
 *    the per-org event room without rebuilding the whole connection.
 */
export function useWorkflowSocket() {
  const socketRef = useRef<Socket | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const pushIncoming = useNotificationStore((s) => s.pushIncoming);
  const loadUnreadCount = useNotificationStore((s) => s.loadUnreadCount);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = getAccessToken();
    if (!token) return;

    const socket = io(API_URL, {
      path: '/api/ws',
      auth: { token, orgId: currentOrgId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      void loadUnreadCount();
    });
    socket.on('notification:created', (n: any) => {
      try {
        pushIncoming(n);
      } catch (e) {
        console.error('pushIncoming failed', e);
      }
    });
    socket.on('inbox:new', () => {
      void loadUnreadCount();
    });
    socket.on('inbox:done', () => {
      void loadUnreadCount();
    });
    socket.on('workflow:state-changed', () => {
      void loadUnreadCount();
    });
    socket.on('connect_error', (err) => {
      console.warn('[workflow-socket] connect_error', err.message);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // Intentionally exclude currentOrgId — org switches go through the next
    // effect via `switch-org`, not by tearing down the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    const socket = socketRef.current;
    if (socket && socket.connected && currentOrgId) {
      socket.emit('switch-org', { orgId: currentOrgId });
    }
  }, [currentOrgId]);
}
