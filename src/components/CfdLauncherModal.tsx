import { useState, useEffect } from 'react';
import { Monitor, X, ExternalLink, Copy, Check, QrCode, Tablet } from 'lucide-react';
import QRCode from 'qrcode';

interface CfdLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CfdLauncherModal({ isOpen, onClose }: CfdLauncherModalProps) {
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  // Calculate CFD URL based on current origin
  const cfdUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/cfd` 
    : 'https://srikandi.vocpos.id/cfd';

  useEffect(() => {
    if (isOpen && cfdUrl) {
      QRCode.toDataURL(cfdUrl, {
        width: 220,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        }
      }).then(url => {
        setQrCodeUrl(url);
      }).catch(err => {
        console.error('Failed to generate QR for CFD link:', err);
      });
    }
  }, [isOpen, cfdUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(cfdUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenNewWindow = () => {
    window.open('/cfd', 'CustomerFacingDisplay', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '560px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <Monitor size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Layar Pelanggan (CFD)</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>Hubungkan tablet customer untuk tampilan belanja real-time</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Option 1: Scan via Tablet Camera */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              padding: '8px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              flexShrink: 0
            }}>
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR CFD Link" style={{ width: '130px', height: '130px', display: 'block' }} />
              ) : (
                <div style={{ width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <QrCode size={40} color="#94a3b8" />
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#da291c', textTransform: 'uppercase', marginBottom: '4px' }}>
                <Tablet size={15} /> Hubungkan Tablet / iPad
              </div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                Scan QR dari Kamera Tablet
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                Buka kamera pada tablet pelanggan, arahkan ke QR ini, lalu buka link untuk langsung terhubung dengan kasir Anda.
              </p>
            </div>
          </div>

          {/* URL Box */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              Link Khusus Layar Pelanggan (CFD)
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '6px 12px',
              gap: '8px'
            }}>
              <input 
                type="text" 
                readOnly 
                value={cfdUrl} 
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0f172a',
                  fontFamily: 'monospace'
                }} 
              />
              <button 
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: copied ? '#10b981' : '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Tersalin' : 'Salin'}
              </button>
            </div>
          </div>

          {/* Option 2: Dual Monitor on Same PC */}
          <div style={{
            borderTop: '1px solid #f1f5f9',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
              💡 <strong>Menggunakan Layar Kedua (HDMI / Monitor Tambahan)?</strong> Klik tombol di bawah untuk membuka CFD di jendela baru dan geser ke layar kedua Anda.
            </div>

            <button 
              onClick={handleOpenNewWindow}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #da291c 0%, #b91c1c 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(218, 41, 28, 0.25)'
              }}
            >
              <ExternalLink size={16} /> Buka Layar Pelanggan di Tab / Jendela Baru
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
