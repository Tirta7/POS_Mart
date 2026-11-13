/**
 * Singleton SSE client untuk /api/license/stream dengan leader-election lintas tab.
 * Memastikan seluruh browser hanya membuka MAKSIMAL 1 koneksi SSE HTTP/1.1 ke server
 * (agar pool 6 koneksi per origin Chrome tidak pernah habis dan navigasi tetap lancar).
 */

type Listener = (data: any) => void;

const licenseListeners = new Set<Listener>();
const messagesListeners = new Set<Listener>();

let started = false;
let stopTimer: number | null = null;
let lastLicense: any = null;
let lastMessages: any = null;
let channel: BroadcastChannel | null = null;
let activeEventSource: EventSource | null = null;
let reconnectTimer: number | null = null;
let releaseLeader: (() => void) | null = null;
let lockAbort: AbortController | null = null;
let isLeader = false;

function notifyLicense(data: any) {
  if (!data) return;
  lastLicense = data;
  licenseListeners.forEach((fn) => {
    try { fn(data); } catch {}
  });
}

function notifyMessages(data: any) {
  if (!data) return;
  lastMessages = data;
  messagesListeners.forEach((fn) => {
    try { fn(data); } catch {}
  });
}

function closeEventSource() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
}

function openEventSource(shouldStayOpen: () => boolean) {
  closeEventSource();
  if (!shouldStayOpen()) return;

  const es = new EventSource('/api/license/stream');
  activeEventSource = es;

  es.addEventListener('license', (event: MessageEvent) => {
    if (!event.data) return;
    try {
      const parsed = JSON.parse(event.data);
      notifyLicense(parsed);
      channel?.postMessage({ type: 'license', data: parsed });
    } catch {}
  });

  es.addEventListener('renew', (event: MessageEvent) => {
    if (!event.data) return;
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.license) notifyLicense(parsed.license);
      channel?.postMessage({ type: 'renew', data: parsed });
    } catch {}
  });

  es.addEventListener('unlock', (event: MessageEvent) => {
    if (!event.data) return;
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.license) notifyLicense(parsed.license);
      channel?.postMessage({ type: 'unlock', data: parsed });
    } catch {}
  });

  es.addEventListener('lock', (event: MessageEvent) => {
    if (!event.data) return;
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.license) notifyLicense(parsed.license);
      channel?.postMessage({ type: 'lock', data: parsed });
    } catch {}
  });

  es.addEventListener('messages', (event: MessageEvent) => {
    if (!event.data) return;
    try {
      const parsed = JSON.parse(event.data);
      notifyMessages(parsed);
      channel?.postMessage({ type: 'messages', data: parsed });
    } catch {}
  });

  es.onmessage = (event: MessageEvent) => {
    if (!event.data) return;
    try {
      const parsed = JSON.parse(event.data);
      if (Array.isArray(parsed) || parsed?.messages) {
        notifyMessages(parsed);
        channel?.postMessage({ type: 'messages', data: parsed });
      }
    } catch {}
  };

  es.onerror = () => {
    if (activeEventSource === es) {
      es.close();
      activeEventSource = null;
    }
    if (shouldStayOpen()) {
      reconnectTimer = window.setTimeout(() => openEventSource(shouldStayOpen), 3000);
    }
  };
}

function startStream() {
  if (started) return;
  started = true;

  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('voc-license-stream');
    channel.onmessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'license') notifyLicense(msg.data);
      else if ((msg.type === 'renew' || msg.type === 'unlock' || msg.type === 'lock') && msg.data?.license) {
        notifyLicense(msg.data.license);
      }
      else if (msg.type === 'messages') notifyMessages(msg.data);
      else if (msg.type === 'hello' && isLeader) {
        if (lastLicense) channel?.postMessage({ type: 'license', data: lastLicense });
        if (lastMessages) channel?.postMessage({ type: 'messages', data: lastMessages });
      }
    };
  }

  channel?.postMessage({ type: 'hello' });

  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks && typeof locks.request === 'function') {
    lockAbort = new AbortController();
    locks
      .request(
        'voc-license-sse-leader',
        { signal: lockAbort.signal },
        () =>
          new Promise<void>((resolve) => {
            if (!started) {
              resolve();
              return;
            }
            isLeader = true;
            releaseLeader = () => {
              isLeader = false;
              closeEventSource();
              resolve();
            };
            openEventSource(() => started && isLeader);
          })
      )
      .catch(() => {
        // Dibatalkan saat stopStream() atau fallback jika lock ditolak
      });
  } else {
    isLeader = true;
    openEventSource(() => started);
  }
}

function stopStream() {
  if (!started) return;
  started = false;
  isLeader = false;
  closeEventSource();
  try { lockAbort?.abort(); } catch {}
  lockAbort = null;
  try { releaseLeader?.(); } catch {}
  releaseLeader = null;
}

function scheduleStopIfIdle() {
  if (licenseListeners.size > 0 || messagesListeners.size > 0) return;
  if (stopTimer !== null) window.clearTimeout(stopTimer);
  // Tunggu sebentar agar React StrictMode remount tidak menutup & membuka ulang SSE
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    if (licenseListeners.size === 0 && messagesListeners.size === 0) {
      stopStream();
    }
  }, 400);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopStream);
  window.addEventListener('beforeunload', stopStream);
}

export function subscribeLicenseStream(onLicense: Listener): () => void {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
  licenseListeners.add(onLicense);
  if (lastLicense) {
    try { onLicense(lastLicense); } catch {}
  }
  startStream();

  return () => {
    licenseListeners.delete(onLicense);
    scheduleStopIfIdle();
  };
}

export function subscribeMessagesStream(onMessages: Listener): () => void {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
  messagesListeners.add(onMessages);
  if (lastMessages) {
    try { onMessages(lastMessages); } catch {}
  }
  startStream();

  return () => {
    messagesListeners.delete(onMessages);
    scheduleStopIfIdle();
  };
}

