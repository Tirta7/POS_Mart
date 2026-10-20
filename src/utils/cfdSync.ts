import type { CfdState } from '../types/cfd';
import { getSocket, DEFAULT_TENANT_ID } from './socket';

const CHANNEL_NAME = 'vocpos_cfd_channel';
const STORAGE_KEY = 'vocpos_cfd_state';

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch (e) {
  console.warn('[CFD Sync] BroadcastChannel not supported:', e);
}

/**
 * Emit current POS state to CFD screen across all channels:
 * 1. BroadcastChannel (instant local dual-screen)
 * 2. Socket.IO (remote tablet over Wi-Fi / LAN)
 * 3. LocalStorage (fallback for older browsers / isolated windows)
 */
export const sendCfdUpdate = (state: CfdState) => {
  try {
    const payload = { ...state, lastUpdated: Date.now() };

    // 1. LocalStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}

    // 2. BroadcastChannel
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(payload);
      } catch (err) {
        console.warn('[CFD Sync] BroadcastChannel error:', err);
      }
    }

    // 3. Socket.IO
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('cfd_update', payload);
    }
  } catch (err) {
    console.error('[CFD Sync] sendCfdUpdate error:', err);
  }
};

/**
 * Request latest state from cashier POS (called when CFD screen starts up or reconnects)
 */
export const requestCfdState = (tenantId: string = DEFAULT_TENANT_ID) => {
  // BroadcastChannel request
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'REQUEST_STATE', tenantId });
    } catch {}
  }

  // Socket.IO request
  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit('cfd_request_state', { tenantId });
  }
};

/**
 * Subscribe to CFD state updates on the customer display tablet/screen
 */
export const subscribeCfd = (
  onStateChange: (state: CfdState) => void,
  onRequestState?: () => void
): (() => void) => {
  // 1. Check existing state in localStorage
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.items)) {
        onStateChange(parsed);
      }
    }
  } catch {}

  // 2. BroadcastChannel listener
  const handleBroadcast = (event: MessageEvent) => {
    if (!event.data) return;
    if (event.data.type === 'REQUEST_STATE') {
      if (onRequestState) onRequestState();
      return;
    }
    if (event.data.items !== undefined) {
      onStateChange(event.data as CfdState);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcast);
  }

  // 3. LocalStorage storage event listener
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed && Array.isArray(parsed.items)) {
          onStateChange(parsed);
        }
      } catch {}
    }
  };
  window.addEventListener('storage', handleStorage);

  // 4. Socket.IO listener
  const socket = getSocket();
  const handleSocketUpdate = (payload: CfdState) => {
    if (payload && Array.isArray(payload.items)) {
      onStateChange(payload);
    }
  };

  const handleSocketStateRequest = () => {
    if (onRequestState) onRequestState();
  };

  socket.on('cfd_cart_update', handleSocketUpdate);
  socket.on('cfd_send_current_state', handleSocketStateRequest);

  // Return unsubscribe cleanup function
  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('storage', handleStorage);
    socket.off('cfd_cart_update', handleSocketUpdate);
    socket.off('cfd_send_current_state', handleSocketStateRequest);
  };
};
