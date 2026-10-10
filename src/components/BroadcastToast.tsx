import { useCallback, useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Info, CheckCircle, AlertOctagon } from 'lucide-react';

/**
 * Notifikasi "Dynamic Island" untuk pesan yang dikirim dari VOCML dashboard.
 *
 * Alur: VOCML -> (backend POS_Mart poll /api/v1/messages tiap 1 menit) -> SSE /api/license/stream -> komponen ini.
 * - intervalMenit : pesan muncul lagi tiap N menit. 0 = sekali saja.
 * - durasiDetik   : lama tampil sebelum otomatis hilang. 0 = tetap tampil sampai ditutup.
 * - Pesan yang dinonaktifkan / dihapus di VOCML langsung hilang dari layar.
 */
export interface BroadcastMessage {
  id: string | number;
  judul?: string;
  pesan: string;
  tipe: 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS';
  intervalMenit?: number;
  durasiDetik?: number;
  versi?: string;
}

const TOAST_CONFIG = {
  INFO:    { color: '#3b82f6', icon: Info },
  SUCCESS: { color: '#22c55e', icon: CheckCircle },
  WARNING: { color: '#f59e0b', icon: AlertTriangle },
  DANGER:  { color: '#ef4444', icon: AlertOctagon },
};

const STORAGE_KEY = 'pos_broadcast_last_shown';

const msgKey = (m: BroadcastMessage) => `${m.id}:${m.versi || ''}`;

function loadLastShown(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveLastShown(map: Record<string, number>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export function BroadcastToast() {
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const messagesRef = useRef<BroadcastMessage[]>([]);
  const visibleRef = useRef<Set<string>>(new Set());
  const lastShownRef = useRef<Record<string, number>>({});
  const hideTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const syncVisible = () => setVisibleKeys(Array.from(visibleRef.current));

  const hide = useCallback((key: string) => {
    const wasVisible = visibleRef.current.delete(key);
    if (hideTimersRef.current[key]) {
      clearTimeout(hideTimersRef.current[key]);
      delete hideTimersRef.current[key];
    }
    // Interval dihitung sejak pesan MUNCUL (lihat show()), sehingga "tiap 1 menit"
    // benar-benar muncul tiap 60 detik. Pengecualian: pesan dengan lama tampil 0
    // (tampil sampai ditutup) -> interval dihitung sejak ditutup, agar tidak langsung muncul lagi.
    const m = messagesRef.current.find(x => msgKey(x) === key);
    if (wasVisible && m && Number(m.durasiDetik ?? 15) <= 0) {
      lastShownRef.current[key] = Date.now();
      saveLastShown(lastShownRef.current);
    }
    syncVisible();
  }, []);

  const show = useCallback((m: BroadcastMessage) => {
    const key = msgKey(m);
    if (visibleRef.current.has(key)) return;
    visibleRef.current.add(key);
    lastShownRef.current[key] = Date.now();
    saveLastShown(lastShownRef.current);
    const dur = Number(m.durasiDetik ?? 15);
    if (dur > 0) {
      hideTimersRef.current[key] = setTimeout(() => hide(key), dur * 1000);
    }
    syncVisible();
  }, [hide]);

  /** Cek pesan mana yang sudah waktunya tampil. */
  const evaluate = useCallback(() => {
    const now = Date.now();
    for (const m of messagesRef.current) {
      const key = msgKey(m);
      if (visibleRef.current.has(key)) continue;
      const last = lastShownRef.current[key];
      const interval = Number(m.intervalMenit ?? 0);
      if (last === undefined) { show(m); continue; }
      if (interval > 0 && now - last >= interval * 60_000) show(m);
    }
  }, [show]);

  /** Ganti seluruh daftar pesan (server selalu mengirim daftar lengkap). */
  const applyMessages = useCallback((list: any) => {
    const rawArr = Array.isArray(list) ? list : (Array.isArray(list?.messages) ? list.messages : []);
    const valid: BroadcastMessage[] = rawArr.filter((m: any) => m && m.id !== undefined && (m.pesan || m.message)).map((m: any) => ({
      id: m.id,
      judul: m.judul || m.title || '',
      pesan: m.pesan || m.message || '',
      tipe: (String(m.tipe || m.type || 'INFO').toUpperCase() as any) || 'INFO',
      intervalMenit: Number(m.intervalMenit ?? m.interval_minutes ?? 0),
      durasiDetik: Number(m.durasiDetik ?? m.display_seconds ?? 15),
      versi: m.versi || m.updated_at || '',
    }));
    const keys = new Set(valid.map(msgKey));

    // Pesan yang dihapus / dinonaktifkan di VOCML -> langsung hilang
    Array.from(visibleRef.current).forEach(k => { if (!keys.has(k)) hide(k); });
    // Bersihkan riwayat pesan yang sudah tidak ada
    Object.keys(lastShownRef.current).forEach(k => { if (!keys.has(k)) delete lastShownRef.current[k]; });
    saveLastShown(lastShownRef.current);

    messagesRef.current = valid;
    setMessages(valid);
    evaluate();
  }, [evaluate, hide]);

  // Init: riwayat + snapshot awal + SSE real-time
  useEffect(() => {
    lastShownRef.current = loadLastShown();
    fetch('/api/license/messages')
      .then(r => r.json())
      .then(applyMessages)
      .catch(() => {});

    let evtSource: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      evtSource = new EventSource('/api/license/stream');
      evtSource.addEventListener('messages', (event: MessageEvent) => {
        if (!event.data) return;
        try { applyMessages(JSON.parse(event.data)); } catch {}
      });
      evtSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data);
          if (Array.isArray(parsed) || parsed.messages) applyMessages(parsed);
        } catch {}
      };
      evtSource.onerror = () => {
        evtSource?.close();
        retry = setTimeout(connect, 15000); // reconnect
      };
    };
    connect();

    const tick = setInterval(evaluate, 1000);
    return () => {
      evtSource?.close();
      if (retry) clearTimeout(retry);
      clearInterval(tick);
      Object.values(hideTimersRef.current).forEach(clearTimeout);
    };
  }, [applyMessages, evaluate]);

  const visible = messages.filter(m => visibleKeys.includes(msgKey(m)));
  if (visible.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 'max(12px, calc(env(safe-area-inset-top) + 8px))',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 999999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {visible.map((m) => {
        const key = msgKey(m);
        const cfg = TOAST_CONFIG[m.tipe] || TOAST_CONFIG.INFO;
        const Icon = cfg.icon;
        const expanded = expandedKey === key;
        return (
          <div
            key={key}
            onClick={() => setExpandedKey(expanded ? null : key)}
            className="voc-island"
            style={{
              background: '#0a0a0c',
              border: `1px solid ${cfg.color}40`,
              borderRadius: expanded ? '20px' : '9999px',
              minHeight: '38px',
              padding: expanded ? '10px 14px 10px 10px' : '4px 12px 4px 5px',
              display: 'flex',
              gap: '10px',
              alignItems: expanded ? 'flex-start' : 'center',
              width: expanded ? 'min(480px, 92vw)' : 'max-content',
              maxWidth: '92vw',
              pointerEvents: 'auto',
              cursor: 'pointer',
              boxShadow: `0 10px 30px rgba(0,0,0,.6), 0 0 15px ${cfg.color}25`,
              transition: 'all .3s cubic-bezier(0.16, 1, 0.3, 1)',
              animation: 'vocIslandIn .4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{
              background: cfg.color,
              width: '28px', height: '28px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: `0 0 12px ${cfg.color}88`,
            }}>
              <Icon size={15} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '4px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {m.judul && (
                <p style={{ margin: 0, color: cfg.color, fontSize: '11px', fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase' }}>
                  {m.judul}
                </p>
              )}
              <p style={{
                margin: 0, color: '#f8fafc', fontSize: '13px', lineHeight: 1.4, fontWeight: 600,
                whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: expanded ? 'none' : 'min(520px, 68vw)',
                wordBreak: 'break-word',
              }}>
                {m.pesan}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); hide(key); if (expanded) setExpandedKey(null); }}
              style={{
                flexShrink: 0, background: 'rgba(255,255,255,0.1)', border: 'none',
                width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#cbd5e1', borderRadius: '50%',
              }}
              title={Number(m.intervalMenit) > 0 ? `Tutup (muncul lagi ${m.intervalMenit} menit)` : 'Tutup'}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes vocIslandIn {
          from { transform: translateY(-24px) scale(.75); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default BroadcastToast;
