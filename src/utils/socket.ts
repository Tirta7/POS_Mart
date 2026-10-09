import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
export const DEFAULT_TENANT_ID = 'TID-DEMO-123';

/**
 * Singleton Socket.IO client instance.
 * Automatically joins tenant room on initial connection and upon every reconnection.
 */
export const getSocket = (): Socket => {
  if (!socket) {
    socket = io('/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    (window as any).socketInstance = socket;

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected, socket ID:', socket?.id);
      socket?.emit('join_tenant', DEFAULT_TENANT_ID);
    });

    socket.on('reconnect', (attempt) => {
      console.log(`[Socket.IO] Reconnected after ${attempt} attempts, re-joining tenant room...`);
      socket?.emit('join_tenant', DEFAULT_TENANT_ID);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });
  }

  // If already connected when called, ensure room is joined
  if (socket.connected) {
    socket.emit('join_tenant', DEFAULT_TENANT_ID);
  }

  return socket;
};
