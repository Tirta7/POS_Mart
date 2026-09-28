import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

interface BarcodeScannerCameraProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

const BarcodeScannerCamera: React.FC<BarcodeScannerCameraProps> = ({ onScan, onClose }) => {
  const [error, setError] = useState<string>('Meminta izin akses kamera...');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ text: string, time: number }>({ text: '', time: 0 });

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
            // Cegah event ganda dengan flag boolean mutlak
            if (lastScanRef.current.text === 'PROCESSING') return;
            
            // Tandai bahwa komponen ini sedang memproses barcode, JANGAN eksekusi onScan lagi
            lastScanRef.current = { text: 'PROCESSING', time: Date.now() };
            
            // Hentikan pemrosesan frame kamera seketika
            if (scannerRef.current && scannerRef.current.getState() === 2) {
              scannerRef.current.pause(true);
            }

            // Play a tiny beep (optional, but nice)
            try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const oscillator = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              oscillator.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              oscillator.type = 'sine';
              oscillator.frequency.value = 800; // Hz
              gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
              oscillator.start(audioCtx.currentTime);
              oscillator.stop(audioCtx.currentTime + 0.1);
            } catch(e) {}

            onScan(decodedText);
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
  }, [onScan]);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
      <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '450px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={20} color="#10b981" /> Kamera Scanner Aktif
          </h3>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', cursor: 'pointer', borderRadius: '50%', padding: '6px', display: 'flex' }}>
            <X size={20} color="#374151" />
          </button>
        </div>

        <div style={{ marginBottom: '16px', fontSize: '13px', color: '#4b5563', lineHeight: 1.5, textAlign: 'center' }}>
          Arahkan barcode produk ke kamera. Scanner akan otomatis mendeteksi dan memasukkan barang.
        </div>

        {/* The video stream will render inside this div */}
        <div style={{ position: 'relative' }}>
          <div 
            id="barcode-scanner-reader" 
            style={{ width: '100%', minHeight: '200px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f9fafb' }}
          ></div>
          
          {/* Laser Scanning Animation Overlay */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '300px', height: '150px', pointerEvents: 'none' }}>
            {/* Corner brackets */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '20px', height: '20px', borderTop: '3px solid #10b981', borderLeft: '3px solid #10b981' }}></div>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '20px', height: '20px', borderTop: '3px solid #10b981', borderRight: '3px solid #10b981' }}></div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '20px', height: '20px', borderBottom: '3px solid #10b981', borderLeft: '3px solid #10b981' }}></div>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '20px', height: '20px', borderBottom: '3px solid #10b981', borderRight: '3px solid #10b981' }}></div>
            
            {/* Animated Laser Line */}
            <div 
              style={{
                width: '100%',
                height: '2px',
                backgroundColor: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
                position: 'absolute',
                top: '0',
                left: '0',
                animation: 'scanLaser 2s infinite alternate ease-in-out'
              }}
            ></div>
            <style>
              {`
                @keyframes scanLaser {
                  0% { top: 5%; opacity: 0; }
                  10% { opacity: 1; }
                  90% { opacity: 1; }
                  100% { top: 95%; opacity: 0; }
                }
              `}
            </style>
          </div>

          {error && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', color: '#ef4444', fontSize: '13px', textAlign: 'center', fontWeight: 'bold', padding: '20px', zIndex: 10 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodeScannerCamera;
