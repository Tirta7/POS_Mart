import React, { useState, useEffect, useCallback } from 'react';
import {
  Copy,
  CheckCircle,
  RefreshCw,
  QrCode,
  MessageCircle,
  WifiOff,
  KeyRound,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';

export interface LicenseBilling {
  reason: 'locked' | 'expired';
  amount: number;
  amount_text: string;
  currency: string;
  merchant_name: string;
  merchant_city?: string;
  qris: string;
  qris_image_url: string;
  note: string;
  contact: string;
}

export interface LicenseState {
  allowed: boolean;
  status: 'active' | 'expiring' | 'expired' | 'locked' | 'pending' | 'offline';
  reason?: string;
  lockReason?: string;
  machineId?: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
  licenseKey?: string | null;
  billing?: LicenseBilling | null;
  offline?: boolean;
}

const toWaNumber = (contact: string) => {
  const d = (contact || '').replace(/\D/g, '');
  return d.startsWith('0') ? `62${d.slice(1)}` : d;
};

export const LicenseLockScreen: React.FC = () => {
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const isLocked =
    license !== null &&
    (!license.allowed || license.status === 'locked' || license.status === 'expired' || license.status === 'pending');

  const billing: LicenseBilling | null =
    isLocked && (license?.status === 'locked' || license?.status === 'expired')
      ? (license?.billing || null)
      : null;

  // Reset QR state bila nominal atau data tagihan berubah
  useEffect(() => {
    setQrFailed(false);
    setQrLoaded(false);
  }, [billing?.amount, billing?.qris]);

  const applyState = useCallback((data: any) => {
    if (!data) return;
    setLicense(data);
  }, []);

  useEffect(() => {
    // 1. Fetch initial status
    fetch('/api/license/status')
      .then(r => r.json())
      .then(applyState)
      .catch(() => {});

    // 2. Setup SSE connection
    let evtSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connectSSE = () => {
      evtSource = new EventSource('/api/license/stream');
      evtSource.addEventListener('license', (event: MessageEvent) => {
        if (!event.data) return;
        try {
          applyState(JSON.parse(event.data));
        } catch {}
      });
      evtSource.onerror = () => {
        evtSource?.close();
        retryTimer = setTimeout(connectSSE, 10000);
      };
    };

    connectSSE();

    // 3. Cadangan polling setiap 5 detik saat terkunci
    const pollInterval = setInterval(() => {
      fetch('/api/license/status')
        .then(r => r.json())
        .then(applyState)
        .catch(() => {});
    }, 5000);

    return () => {
      evtSource?.close();
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(pollInterval);
    };
  }, [applyState]);

  const handleCopyMachineId = () => {
    const id = license?.machineId || '';
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleActivateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKey.trim()) return;

    setActivating(true);
    setActivateMsg(null);

    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: manualKey.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.allowed) {
        setActivateMsg({ text: 'Aktivasi berhasil! Membuka aplikasi...', isError: false });
        setLicense(data);
      } else {
        setActivateMsg({ text: data.error || 'Aktivasi gagal. Periksa format license key.', isError: true });
      }
    } catch {
      setActivateMsg({ text: 'Gagal terhubung ke server lisensi', isError: true });
    } finally {
      setActivating(false);
    }
  };

  // Jangan render apa pun jika lisensi aktif / diizinkan
  if (!isLocked) return null;

  const title =
    billing?.reason === 'expired' || license?.status === 'expired'
      ? 'Lisensi telah berakhir'
      : license?.status === 'pending'
      ? 'Menunggu Aktivasi Lisensi'
      : 'Aplikasi dikunci';

  const subtitle =
    license?.lockReason ||
    license?.reason ||
    (license?.status === 'pending'
      ? 'Aplikasi baru dipasang dan belum diaktifkan oleh admin.'
      : 'Akses dinonaktifkan sementara.');

  return (
    <div
      id="pos-license-lockscreen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999998,
        background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #09090b 60%, #030712 100%)',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: billing ? '860px' : '480px',
          display: 'flex',
          flexDirection: billing ? 'row' : 'column',
          flexWrap: 'wrap',
          gap: '24px',
          alignItems: 'stretch',
          justifyContent: 'center',
          animation: 'lockFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* PANEL KIRI: TAGIHAN QRIS DARI VOCML (B2) */}
        {billing && (
          <section
            id="billing-panel"
            aria-label="Tagihan QRIS"
            style={{
              flex: '1 1 340px',
              background: 'rgba(17, 24, 39, 0.75)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '24px',
              padding: '28px 24px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px rgba(34, 197, 94, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.12)',
                color: '#4ade80',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <QrCode size={15} /> Tagihan Perpanjangan Lisensi
            </div>

            <h2 style={{ color: '#ffffff', fontSize: '22px', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              {title}
            </h2>

            {subtitle && (
              <p style={{ color: '#fca5a5', fontSize: '13px', fontWeight: 500, margin: '0 0 18px', lineHeight: 1.45 }}>
                {subtitle}
              </p>
            )}

            {/* Gambar QR besar (min 240x240, latar putih, image-rendering: pixelated) */}
            {!qrFailed ? (
              <div
                style={{
                  background: '#ffffff',
                  padding: '12px',
                  borderRadius: '16px',
                  width: '264px',
                  height: '264px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  position: 'relative',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                }}
              >
                {!qrLoaded && (
                  <RefreshCw
                    size={28}
                    color="#94a3b8"
                    style={{ position: 'absolute', animation: 'spin 1.2s linear infinite' }}
                  />
                )}
                <img
                  id="billing-qris-image"
                  src={`/api/license/billing/qris.png?t=${billing.amount}`}
                  alt={`QRIS ${billing.merchant_name} ${billing.amount_text}`}
                  width={240}
                  height={240}
                  onLoad={() => setQrLoaded(true)}
                  onError={() => setQrFailed(true)}
                  style={{
                    width: '240px',
                    height: '240px',
                    display: 'block',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                    opacity: qrLoaded ? 1 : 0,
                    transition: 'opacity 0.2s',
                  }}
                />
              </div>
            ) : (
              <div
                id="billing-qris-offline"
                style={{
                  width: '264px',
                  minHeight: '180px',
                  margin: '0 auto',
                  padding: '24px 16px',
                  borderRadius: '16px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#fca5a5',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <WifiOff size={32} />
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Hubungkan internet untuk menampilkan QRIS</div>
                <button
                  id="billing-qris-retry"
                  type="button"
                  onClick={() => {
                    setQrFailed(false);
                    setQrLoaded(false);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Coba lagi
                </button>
              </div>
            )}

            {/* Total tagihan */}
            <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginTop: '16px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Total tagihan
            </div>
            <div
              id="billing-amount"
              style={{ color: '#ffffff', fontSize: '32px', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2 }}
            >
              {billing.amount_text}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px', fontWeight: 600 }}>
              QRIS · {billing.merchant_name}
            </div>

            {billing.note && (
              <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '10px', lineHeight: 1.45, maxWidth: '320px' }}>
                {billing.note}
              </div>
            )}

            {/* WhatsApp Contact */}
            {billing.contact && billing.contact.trim() !== '' && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                <div style={{ color: '#cbd5e1', fontSize: '12.5px' }}>
                  Kontak admin: <strong style={{ color: '#fff' }}>{billing.contact}</strong>
                </div>
                <a
                  id="billing-whatsapp"
                  href={`https://wa.me/${toWaNumber(billing.contact)}?text=${encodeURIComponent(
                    `Halo admin, saya ingin konfirmasi pembayaran perpanjangan lisensi POS_Mart.\nMachine ID: ${license?.machineId || '-'}\nTotal Tagihan: ${billing.amount_text}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    textDecoration: 'none',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    boxShadow: '0 6px 20px rgba(34, 197, 94, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <MessageCircle size={16} /> Chat WhatsApp
                </a>
              </div>
            )}
          </section>
        )}

        {/* PANEL KANAN / UTAMA: INFORMASI KOMPUTER & AKTIVASI MANUAL */}
        <section
          style={{
            flex: '1 1 340px',
            background: 'rgba(17, 24, 39, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '28px 24px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            {!billing && (
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '16px',
                    background: license?.status === 'pending' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: license?.status === 'pending' ? '#fbbf24' : '#f87171',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '12px',
                  }}
                >
                  {license?.status === 'pending' ? <AlertTriangle size={28} /> : <ShieldAlert size={28} />}
                </div>
                <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 6px' }}>
                  {title}
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '13.5px', margin: 0, lineHeight: 1.5 }}>
                  {subtitle}
                </p>
              </div>
            )}

            {/* Identitas Komputer (Machine ID) */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Machine ID Komputer Ini
              </label>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#38bdf8', fontWeight: 700, wordBreak: 'break-all' }}>
                  {license?.machineId || 'MEMUAT...'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyMachineId}
                  title="Salin Machine ID"
                  style={{
                    background: copied ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0,
                    transition: 'background 0.2s',
                  }}
                >
                  {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                  {copied ? 'Tersalin' : 'Salin'}
                </button>
              </div>
              <p style={{ color: '#64748b', fontSize: '11.5px', margin: '6px 0 0', lineHeight: 1.4 }}>
                Berikan Machine ID ini ke admin jika Anda mendaftarkan lisensi baru.
              </p>
            </div>

            {/* Form Aktivasi Kunci Manual */}
            <form onSubmit={handleActivateManual} style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Punya License Key Baru?
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="VOCML-XXXXX-XXXXX-..."
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    color: '#fff',
                    fontSize: '12.5px',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={activating || !manualKey.trim()}
                  style={{
                    background: activating ? '#475569' : '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: activating || !manualKey.trim() ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                >
                  <KeyRound size={14} />
                  {activating ? 'Mengaktifkan...' : 'Aktivasi'}
                </button>
              </div>

              {activateMsg && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: activateMsg.isError ? '#f87171' : '#4ade80',
                    fontWeight: 600,
                  }}
                >
                  {activateMsg.text}
                </div>
              )}
            </form>
          </div>

          {/* Indikator Status & Auto-Check */}
          <div
            style={{
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
              color: '#64748b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: license?.offline ? '#ef4444' : '#10b981',
                  boxShadow: `0 0 8px ${license?.offline ? '#ef4444' : '#10b981'}`,
                }}
              />
              <span>{license?.offline ? 'Offline Mode' : 'Terhubung ke VOCML'}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <RefreshCw size={11} style={{ animation: 'spin 2s linear infinite' }} />
              <span>Otomatis refresh saat aktif</span>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        @keyframes lockFadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LicenseLockScreen;
