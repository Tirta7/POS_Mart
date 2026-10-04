import React, { useEffect, useState } from 'react';
import { BellRing, Smartphone, Send, Share, PlusSquare, ShieldAlert, CheckCircle2 } from 'lucide-react';
import {
  getPushSupport, isSubscribed, enablePush, disablePush, sendTestNotification,
  permissionState, isIOS, buildSaleNotification,
} from '../../utils/pushNotification';
import { useAuthStore } from '../../store/useAuthStore';

const ERROR_TEXT: Record<string, string> = {
  insecure: 'Notifikasi membutuhkan koneksi HTTPS yang valid. Buka aplikasi melalui URL tunnel (ngrok / Cloudflare).',
  'ios-not-installed': 'Di iPhone/iPad, buka aplikasi dari Home Screen terlebih dahulu (Share → Add to Home Screen).',
  unsupported: 'Browser / perangkat ini belum mendukung Web Push Notification.',
  denied: 'Izin notifikasi ditolak. Aktifkan kembali lewat pengaturan browser / iOS Settings → Notifications.',
  server: 'Tidak dapat terhubung ke server notifikasi.',
};

const Toggle: React.FC<{ checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }> = ({ checked, disabled, onChange }) => (
  <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0 }}>
    <input id="toggle-push-notification" type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
    <span style={{ position: 'absolute', inset: 0, backgroundColor: checked ? 'var(--primary)' : '#d1d5db', borderRadius: '13px', transition: 'background 0.2s' }} />
    <span style={{ position: 'absolute', top: '3px', left: checked ? '25px' : '3px', width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
  </label>
);

const NotificationSettings: React.FC = () => {
  const { currentUser } = useAuthStore();
  const support = getPushSupport();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { isSubscribed().then(setEnabled); }, []);

  const handleToggle = async (next: boolean) => {
    setBusy(true); setError(null); setInfo(null);
    try {
      if (next) {
        await enablePush();
        setEnabled(true);
        setInfo('Device ini akan menerima notifikasi setiap ada uang masuk.');
      } else {
        await disablePush();
        setEnabled(false);
        setInfo('Notifikasi dimatikan untuk device ini.');
      }
    } catch (err) {
      const key = err instanceof Error ? err.message : 'server';
      setError(ERROR_TEXT[key] || ERROR_TEXT.server);
      setEnabled(await isSubscribed());
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true); setError(null); setInfo(null);
    try {
      const r = await sendTestNotification(currentUser?.name);
      setInfo(`Notifikasi tes dikirim ke ${r.sent} dari ${r.total} device terdaftar.`);
    } catch {
      setError(ERROR_TEXT.server);
    } finally {
      setBusy(false);
    }
  };

  const preview = buildSaleNotification({ paymentMethod: 'TUNAI', total: 180000 }, 'Andi', 'Bagas');
  const perm = permissionState();

  return (
    <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, maxWidth: '520px' }}>
        {/* Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111' }}>Notifikasi Uang Masuk</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Tampilkan notifikasi di <b>device ini</b> setiap kali kasir menyelesaikan transaksi.
            </div>
          </div>
          <Toggle checked={enabled} disabled={busy || !support.ok} onChange={handleToggle} />
        </div>

        {/* Status device */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '8px 12px', borderRadius: '8px', background: enabled ? '#ecfdf5' : '#f9fafb', color: enabled ? '#047857' : '#6b7280', border: `1px solid ${enabled ? '#a7f3d0' : '#e5e7eb'}` }}>
          {enabled ? <CheckCircle2 size={16} /> : <Smartphone size={16} />}
          {enabled ? 'Aktif di device ini' : 'Belum aktif di device ini'}
          <span style={{ marginLeft: 'auto', opacity: 0.8 }}>Izin: {perm === 'granted' ? 'Diizinkan' : perm === 'denied' ? 'Ditolak' : perm === 'default' ? 'Belum diminta' : 'Tidak didukung'}</span>
        </div>

        {!support.ok && (
          <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '12.5px', lineHeight: 1.5 }}>
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{ERROR_TEXT[support.reason ?? 'unsupported']}</span>
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12.5px' }}>{error}</div>
        )}
        {info && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '12.5px' }}>{info}</div>
        )}

        <div>
          <button id="btn-test-push" type="button" className="bo-btn" onClick={handleTest} disabled={busy} style={{ fontSize: '13px' }}>
            <Send size={16} /> Kirim Notifikasi Tes
          </button>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Mengirim contoh notifikasi ke semua device yang sudah mengaktifkan fitur ini.
          </p>
        </div>

        {/* Panduan iOS */}
        {isIOS() && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '12.5px', color: '#374151', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Cara aktifkan di iPhone / iPad (iOS 16.4+)</div>
            <div>1. Buka aplikasi di Safari, ketuk <Share size={13} style={{ verticalAlign: '-2px' }} /> <b>Share</b></div>
            <div>2. Pilih <PlusSquare size={13} style={{ verticalAlign: '-2px' }} /> <b>Add to Home Screen</b></div>
            <div>3. Buka aplikasi dari ikon di Home Screen</div>
            <div>4. Masuk ke Pengaturan → Notifikasi, aktifkan toggle & izinkan</div>
          </div>
        )}
      </div>

      {/* Pratinjau notifikasi */}
      <div style={{ flex: '0 0 300px', maxWidth: '100%' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', marginBottom: '6px' }}>PRATINJAU</div>
        <div style={{ background: 'linear-gradient(135deg, #1f2937, #374151)', borderRadius: '18px', padding: '16px 12px' }}>
          <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderRadius: '14px', padding: '10px 12px', boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
            <img src="/icons/icon-192.png" alt="" style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <b style={{ color: '#111' }}>{preview.title}</b>
                <span style={{ color: '#6b7280' }}>now</span>
              </div>
              {preview.body.split('\n').map((l, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#1f2937', lineHeight: 1.35 }}>{l}</div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginTop: '10px' }}>
            <BellRing size={12} /> Contoh tampilan di lock screen
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;
