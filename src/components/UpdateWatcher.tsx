import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

declare const __APP_VERSION__: string;

const CHECK_INTERVAL_MS = 30_000;   // cek versi tiap 30 detik
const COUNTDOWN_SECONDS = 10;       // jeda sebelum reload otomatis
const SNOOZE_MS = 5 * 60_000;       // "Nanti" menunda 5 menit

/**
 * Memantau /version.json (ditulis saat `npm run build`). Jika ID build di server berbeda dengan
 * ID bundle yang sedang berjalan, aplikasi sudah diperbarui -> tampilkan notifikasi lalu reload otomatis.
 * Pada mode dev (tanpa version.json) komponen ini tidak melakukan apa-apa.
 */
const UpdateWatcher: React.FC = () => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const snoozedUntil = useRef(0);
  const updateFound = useRef(false);

  useEffect(() => {
    const current = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
    if (!current) return;

    const check = async () => {
      if (updateFound.current || Date.now() < snoozedUntil.current) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.id && String(data.id) !== current) {
          updateFound.current = true;
          setCountdown(COUNTDOWN_SECONDS);
        }
      } catch {
        // server mungkin sedang restart / offline -> coba lagi pada pengecekan berikutnya
      }
    };

    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      window.location.reload();
      return;
    }
    const t = window.setTimeout(() => setCountdown(c => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  if (countdown === null) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 100000,
        background: '#111827', color: '#fff', padding: '12px 16px', borderRadius: '14px',
        display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        fontSize: '13px', maxWidth: 'calc(100vw - 24px)', flexWrap: 'wrap'
      }}
    >
      <RefreshCw size={18} color="#4ade80" />
      <div>
        <div style={{ fontWeight: 800 }}>Pembaruan aplikasi tersedia</div>
        <div style={{ opacity: 0.8, fontSize: '12px' }}>Halaman dimuat ulang otomatis dalam {countdown} detik…</div>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ background: '#da291c', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px', fontWeight: 700, cursor: 'pointer' }}
      >
        Muat ulang sekarang
      </button>
      <button
        type="button"
        onClick={() => { snoozedUntil.current = Date.now() + SNOOZE_MS; updateFound.current = false; setCountdown(null); }}
        style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '8px', padding: '7px 12px', fontWeight: 600, cursor: 'pointer' }}
      >
        Nanti
      </button>
    </div>
  );
};

export default UpdateWatcher;
