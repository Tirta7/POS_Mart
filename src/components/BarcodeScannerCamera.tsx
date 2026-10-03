import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, CheckCircle, AlertCircle } from 'lucide-react';

interface BarcodeScannerCameraProps {
  onScan: (decodedText: string) => string | null | undefined;
  onClose: () => void;
}

const BarcodeScannerCamera: React.FC<BarcodeScannerCameraProps> = ({ onScan, onClose }) => {
  const [error, setError] = useState<string>('Meminta izin akses kamera...');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ text: string, time: number }>({ text: '', time: 0 });
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Simpan onScan dalam ref agar useEffect tidak perlu depend pada prop ini
  // (mencegah scanner restart setiap kali cart berubah)
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    let isMounted = true;
    let isInitializing = false;

    // Start scanner using the raw Html5Qrcode API for a cleaner UI
    const startScanner = async () => {
      if (isInitializing) return;
      isInitializing = true;
      
      try {
        // Bersihkan DOM dari sisa strict mode
        const container = document.getElementById("barcode-scanner-reader");
        if (container) container.innerHTML = '';
        
        const html5QrCode = new Html5Qrcode("barcode-scanner-reader", {
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true // Gunakan native hardware acceleration jika ada
          },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        } as any);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 30, // Tingkatkan FPS agar sangat responsif
            qrbox: { width: 300, height: 150 }, // Pertahankan kotak bidik agar fokus
            aspectRatio: 1.0
          },
          (decodedText) => {
            // Cegah event ganda
            if (lastScanRef.current.text === 'PROCESSING') return;
            lastScanRef.current = { text: 'PROCESSING', time: Date.now() };
            
            // Pause sementara agar tidak deteksi ulang barcode yang sama
            if (scannerRef.current && scannerRef.current.getState() === 2) {
              scannerRef.current.pause(true);
            }

            // Bunyi beep
            try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const oscillator = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              oscillator.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              oscillator.type = 'sine';
              oscillator.frequency.value = 800;
              gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
              oscillator.start(audioCtx.currentTime);
              oscillator.stop(audioCtx.currentTime + 0.1);
            } catch(e) {}

            // Panggil callback — mengembalikan nama produk jika ditemukan, null jika tidak
            const productName = onScanRef.current(decodedText);

            // Tampilkan feedback toast
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
            setFeedback(
              productName
                ? { type: 'success', message: `${productName} ditambahkan!` }
                : { type: 'error', message: `Barcode tidak ditemukan` }
            );

            // Setelah 1.5 detik: sembunyikan feedback & resume scanner untuk scan berikutnya
            feedbackTimerRef.current = setTimeout(() => {
              setFeedback(null);
              lastScanRef.current = { text: '', time: 0 };
              try {
                if (scannerRef.current && scannerRef.current.getState() === 3) {
                  scannerRef.current.resume();
                }
              } catch(e) {}
            }, 1500);
          },
          () => {
            // Ignore scan failures (happens every frame when no barcode is found)
          }
        );

        if (isMounted) {
          setError(''); // Clear error when successfully started
        } else {
          // Komponen sudah keburu ditutup oleh user saat kamera sedang booting!
          // Matikan kembali kamera agar tidak tertinggal di background.
          try { html5QrCode.stop(); } catch(e){}
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Camera access error:", err);
          const errString = err?.toString() || '';
          if (errString.includes('NotReadableError') || errString.includes('Device in use')) {
            setError('Kamera sedang digunakan oleh aplikasi lain (seperti Zoom, Google Meet, atau tab browser lain). Mohon tutup aplikasi tersebut lalu coba lagi.');
          } else {
            setError('Gagal mengakses kamera. Pastikan Anda memberikan izin akses kamera pada browser.');
          }
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (state === 2 || state === 3) {
            scannerRef.current.stop().then(() => {
              scannerRef.current?.clear();
            }).catch(err => console.error("Failed to stop scanner async", err));
          } else {
             scannerRef.current.clear();
          }
        } catch (err) {
          console.error("Failed to stop scanner sync", err);
          try { scannerRef.current.clear(); } catch(e){}
        }
        scannerRef.current = null;
      }
      
      // Keamanan Ekstra: Matikan semua track video secara paksa agar lampu indikator kamera mati!
      try {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(mediaStream => {
            mediaStream.getTracks().forEach(track => {
              track.stop();
            });
          }).catch(e => console.log("Stream release err", e));
      } catch (e) {}
    };
  }, []); // Hanya run sekali saat mount — onScan diakses via ref

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(10,10,20,0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999,
      animation: 'fadeInOverlay 0.2s ease'
    }}>
      <div style={{
        width: '90%', maxWidth: '460px',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(218,41,28,0.2)',
        animation: 'slideUpModal 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        display: 'flex', flexDirection: 'column'
      }}>

        {/* === HEADER === */}
        <div style={{
          background: 'linear-gradient(135deg, #1a0a09 0%, #2d0f0b 50%, #1a0a09 100%)',
          padding: '20px 24px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(218,41,28,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Pulsing camera icon */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #da291c, #b91c1c)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(218,41,28,0.5)',
                animation: 'pulseGlow 2s infinite'
              }}>
                <Camera size={20} color="white" />
              </div>
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '16px', letterSpacing: '-0.3px' }}>
                Kamera Scanner
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e', animation: 'pulseDot 1.5s infinite' }}></span>
                Aktif — siap scan multi-barang
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', borderRadius: '10px',
              width: '36px', height: '36px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
              color: 'rgba(255,255,255,0.7)'
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(218,41,28,0.3)'; e.currentTarget.style.color = 'white'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* === BODY === */}
        <div style={{ background: '#111318', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Feedback / Idle status bar */}
          <div style={{
            height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {feedback ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 20px', borderRadius: '999px',
                fontWeight: 700, fontSize: '14px',
                backgroundColor: feedback.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(218,41,28,0.15)',
                color: feedback.type === 'success' ? '#4ade80' : '#f87171',
                border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.35)' : 'rgba(218,41,28,0.35)'}`,
                boxShadow: feedback.type === 'success' ? '0 0 16px rgba(34,197,94,0.15)' : '0 0 16px rgba(218,41,28,0.2)',
                animation: 'fadeInUp 0.2s ease'
              }}>
                {feedback.type === 'success'
                  ? <CheckCircle size={16} />
                  : <AlertCircle size={16} />
                }
                {feedback.message}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#da291c', display: 'inline-block', animation: 'pulseDot 1s infinite' }}></span>
                Arahkan barcode ke area bidik di bawah
              </div>
            )}
          </div>

          {/* Camera viewport */}
          <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(218,41,28,0.25)', boxShadow: '0 0 0 4px rgba(218,41,28,0.06)' }}>
            <div
              id="barcode-scanner-reader"
              style={{ width: '100%', minHeight: '220px', backgroundColor: '#0d0d0d' }}
            ></div>

            {/* Scan frame overlay */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: '280px', height: '140px' }}>
                {/* Corner brackets — merah sesuai tema */}
                {[
                  { top: 0, left: 0, borderTop: '3px solid #da291c', borderLeft: '3px solid #da291c' },
                  { top: 0, right: 0, borderTop: '3px solid #da291c', borderRight: '3px solid #da291c' },
                  { bottom: 0, left: 0, borderBottom: '3px solid #da291c', borderLeft: '3px solid #da291c' },
                  { bottom: 0, right: 0, borderBottom: '3px solid #da291c', borderRight: '3px solid #da291c' },
                ].map((s, i) => (
                  <div key={i} style={{ position: 'absolute', width: '22px', height: '22px', borderRadius: '2px', ...s }} />
                ))}

                {/* Laser line — merah terang */}
                <div style={{
                  width: '100%', height: '2px',
                  background: 'linear-gradient(90deg, transparent, #da291c, #ff4433, #da291c, transparent)',
                  boxShadow: '0 0 10px #da291c, 0 0 20px rgba(218,41,28,0.5)',
                  position: 'absolute', left: 0,
                  animation: 'scanLaser 2s infinite alternate ease-in-out'
                }} />
              </div>
            </div>

            {/* Error overlay */}
            {error && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(13,13,13,0.95)',
                color: '#f87171', fontSize: '13px', textAlign: 'center',
                fontWeight: 600, padding: '24px', gap: '10px', zIndex: 10
              }}>
                <AlertCircle size={32} color="#da291c" />
                {error}
              </div>
            )}
          </div>

          {/* Bottom hint */}
          <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2px' }}>
            Scan berulang kali tanpa tutup kamera &nbsp;•&nbsp; Tekan&nbsp;<strong style={{ color: 'rgba(255,255,255,0.4)' }}>✕</strong>&nbsp;untuk menutup
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInOverlay {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpModal {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes scanLaser {
          0%   { top: 4%;  opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 96%; opacity: 0; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 4px 16px rgba(218,41,28,0.5); }
          50%       { box-shadow: 0 4px 28px rgba(218,41,28,0.85); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.7); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default BarcodeScannerCamera;
