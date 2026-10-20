import { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, CheckCircle2, QrCode, CreditCard, Banknote, 
  Clock, Store, Maximize2, Minimize2, Sparkles, Tag, ShieldCheck,
  Receipt, User
} from 'lucide-react';
import QRCode from 'qrcode';
import type { CfdState } from '../types/cfd';
import { subscribeCfd, requestCfdState } from '../utils/cfdSync';
import { useSettingsStore } from '../store/useSettingsStore';

export default function CustomerFacingDisplay() {
  const { appName: defaultAppName, appLogo: defaultAppLogo } = useSettingsStore();

  const [state, setState] = useState<CfdState>({
    tenantId: 'TID-DEMO-123',
    storeName: defaultAppName || 'VOC PRO SHOP',
    storeLogo: defaultAppLogo || null,
    cashierName: 'Kasir',
    orderNumber: '001',
    orderType: 'REGULER',
    customerName: null,
    items: [],
    itemCount: 0,
    totalQty: 0,
    subtotal: 0,
    tax: 0,
    taxRate: 11,
    taxEnabled: false,
    rounding: 0,
    total: 0,
    paymentState: {
      isOpen: false,
      method: 'TUNAI',
      tendered: 0,
      change: 0,
      isCompleted: false,
    },
    lastUpdated: Date.now(),
  });

  const [isConnected, setIsConnected] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [qrisDataUrl, setQrisDataUrl] = useState<string>('');
  const [completionCountdown, setCompletionCountdown] = useState<number>(0);
  const itemsEndRef = useRef<HTMLDivElement>(null);

  // Digital live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to CFD events
  useEffect(() => {
    setIsConnected(true);

    const unsubscribe = subscribeCfd(
      (newState) => {
        setIsConnected(true);
        setState(prev => ({
          ...prev,
          ...newState,
          storeName: newState.storeName || defaultAppName || prev.storeName,
          storeLogo: newState.storeLogo || defaultAppLogo || prev.storeLogo,
        }));
      },
      () => {
        // State requested by peer
      }
    );

    // Initial state request
    requestCfdState();

    return () => {
      unsubscribe();
    };
  }, [defaultAppName, defaultAppLogo]);

  // Handle QR Code generation when QRIS payment method is active
  useEffect(() => {
    if (state.paymentState.isOpen && state.paymentState.method === 'QRIS' && state.total > 0) {
      // Create standard QRIS payload simulation / static URL
      const qrisPayload = `00020101021226670016ID.CO.VOCPOS.WWW011893600999000001234552045411530336054${String(state.total).padStart(10, '0')}5802ID59${String(state.storeName).substring(0, 20)}6007JAKARTA62070703A016304`;
      
      QRCode.toDataURL(qrisPayload, {
        width: 280,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      }).then(url => {
        setQrisDataUrl(url);
      }).catch(err => {
        console.error('Failed to generate QRIS code:', err);
      });
    } else {
      setQrisDataUrl('');
    }
  }, [state.paymentState.isOpen, state.paymentState.method, state.total, state.storeName]);

  // Auto-scroll to bottom of items when new items arrive
  useEffect(() => {
    if (itemsEndRef.current && state.items.length > 0) {
      itemsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.items.length]);

  // Countdown timer for completion screen
  useEffect(() => {
    if (state.paymentState.isCompleted) {
      setCompletionCountdown(7);
      const interval = setInterval(() => {
        setCompletionCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Reset to idle screen after countdown
            setState(current => ({
              ...current,
              items: [],
              subtotal: 0,
              tax: 0,
              rounding: 0,
              total: 0,
              paymentState: {
                isOpen: false,
                method: 'TUNAI',
                tendered: 0,
                change: 0,
                isCompleted: false,
              }
            }));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [state.paymentState.isCompleted, state.paymentState.completedAt]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const formatIDR = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + ' WIB';
  };

  const activeStoreName = state.storeName || defaultAppName || 'VOC PRO SHOP';
  const hasItems = state.items && state.items.length > 0;
  const isCompleted = state.paymentState.isCompleted;
  const isPaymentOpen = state.paymentState.isOpen;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e293b 100%)',
      color: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* TOP HEADER: Store Branding, Cashier Badge, Clock, Fullscreen */}
      <header style={{
        height: '74px',
        padding: '0 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 50,
      }}>
        {/* Brand & Store Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {state.storeLogo || defaultAppLogo ? (
            <img 
              src={state.storeLogo || defaultAppLogo || ''} 
              alt={activeStoreName} 
              style={{ width: '46px', height: '46px', objectFit: 'contain', borderRadius: '10px', background: '#ffffff', padding: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
            />
          ) : (
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #da291c 0%, #991b1b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(218, 41, 28, 0.35)',
            }}>
              <Store size={24} color="#ffffff" />
            </div>
          )}
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{activeStoreName}</span>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                letterSpacing: '0.05em'
              }}>
                Customer Display
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '12px', marginTop: '2px' }}>
              <span>Counter Kasir Utama</span>
              <span>•</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1' }}>
                <User size={12} color="#94a3b8" /> Kasir: <strong style={{ color: '#ffffff' }}>{state.cashierName || 'Kasir'}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Status, Clock & Fullscreen Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Real-time Connection Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '20px',
            background: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            fontSize: '12px',
            fontWeight: 600,
            color: isConnected ? '#34d399' : '#f87171'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10b981' : '#ef4444',
              boxShadow: isConnected ? '0 0 10px #10b981' : '0 0 10px #ef4444',
              animation: isConnected ? 'pulse 2s infinite' : 'none'
            }} />
            {isConnected ? 'Layar Terhubung' : 'Terputus'}
          </div>

          {/* Clock & Date */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              <Clock size={15} color="#38bdf8" />
              <span>{formatTime(currentTime)}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {formatDate(currentTime)}
            </div>
          </div>

          {/* Fullscreen Button */}
          <button 
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              borderRadius: '10px',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.16)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{
        flex: 1,
        display: 'flex',
        padding: '24px',
        gap: '24px',
        overflow: 'hidden',
        position: 'relative',
      }}>

        {/* 1. TRANSACTION COMPLETED CELEBRATION OVERLAY */}
        {isCompleted && (
          <div style={{
            position: 'absolute',
            inset: '24px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(2, 6, 23, 0.98) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '2px solid rgba(16, 185, 129, 0.4)',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(16, 185, 129, 0.2)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '40px',
            animation: 'fadeIn 0.4s ease-out'
          }}>
            {/* Success Icon */}
            <div style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0.05) 70%)',
              border: '2px solid rgba(16, 185, 129, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              boxShadow: '0 0 35px rgba(16, 185, 129, 0.4)'
            }}>
              <CheckCircle2 size={54} color="#10b981" />
            </div>

            <div style={{
              fontSize: '13px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#34d399',
              marginBottom: '8px'
            }}>
              Pembayaran Berhasil
            </div>

            <h1 style={{
              fontSize: '36px',
              fontWeight: 900,
              color: '#ffffff',
              margin: '0 0 12px 0',
              letterSpacing: '-0.02em'
            }}>
              Terima Kasih Telah Berbelanja!
            </h1>

            <p style={{
              fontSize: '16px',
              color: '#94a3b8',
              maxWidth: '520px',
              margin: '0 0 32px 0',
              lineHeight: 1.5
            }}>
              Semoga Anda puas dengan layanan kasir kami. Struk bukti pembayaran telah tercetak otomatis.
            </p>

            {/* Total & Kembalian Highlight Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: state.paymentState.change > 0 ? 'repeat(2, 260px)' : '320px',
              gap: '16px',
              marginBottom: '36px'
            }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '20px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>Total Tagihan</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc' }}>{formatIDR(state.total)}</div>
              </div>

              {state.paymentState.change > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.25) 100%)',
                  border: '1px solid rgba(52, 211, 153, 0.5)',
                  borderRadius: '16px',
                  padding: '20px',
                  textAlign: 'center',
                  boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)'
                }}>
                  <div style={{ fontSize: '13px', color: '#a7f3d0', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Kembalian Anda
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#34d399' }}>
                    {formatIDR(state.paymentState.change)}
                  </div>
                </div>
              )}
            </div>

            {/* Countdown Auto Return */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: '#64748b'
            }}>
              <span>Kembali ke layar utama dalam {completionCountdown} detik</span>
            </div>
          </div>
        )}

        {/* LEFT COLUMN: ITEM LIST OR WELCOME HERO */}
        <section style={{
          flex: '1 1 62%',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* Top Bar of Left Column */}
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(30, 41, 59, 0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(218, 41, 28, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(239, 68, 68, 0.25)'
              }}>
                <ShoppingBag size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  {hasItems ? 'Rincian Belanjaan Anda' : 'Selamat Datang di Kasir Kami'}
                </h2>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {hasItems ? 'Semua produk yang dipindai kasir tampil otomatis' : 'Layanan belanja transparan, cepat, & akurat'}
                </div>
              </div>
            </div>

            {hasItems && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '13px',
                fontWeight: 700,
                color: '#cbd5e1'
              }}>
                <span>{state.items.length} Item</span>
                <span style={{ color: '#475569' }}>•</span>
                <span style={{ color: '#38bdf8' }}>{state.totalQty || state.items.reduce((s, i) => s + (i.qty || 1), 0)} Qty</span>
              </div>
            )}
          </div>

          {/* CONTENT: Either Welcome Screen (if empty) or Items Table (if active) */}
          {!hasItems ? (
            /* WELCOME / IDLE SCREEN */
            <div style={{
              flex: 1,
              padding: '40px 32px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              gap: '24px',
              background: 'radial-gradient(circle at 50% 40%, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.2) 70%)'
            }}>
              {/* Animated Welcome Hero Icon */}
              <div style={{
                width: '84px',
                height: '84px',
                borderRadius: '24px',
                background: 'linear-gradient(135deg, rgba(218, 41, 28, 0.2) 0%, rgba(185, 28, 28, 0.08) 100%)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 32px rgba(218, 41, 28, 0.2)',
                position: 'relative'
              }}>
                <Sparkles size={42} color="#ef4444" />
                <div style={{
                  position: 'absolute',
                  inset: '-4px',
                  borderRadius: '28px',
                  border: '1px dashed rgba(239, 68, 68, 0.4)',
                  animation: 'spin 20s linear infinite'
                }} />
              </div>

              <div>
                <h1 style={{
                  fontSize: '30px',
                  fontWeight: 900,
                  color: '#ffffff',
                  margin: '0 0 10px 0',
                  letterSpacing: '-0.02em'
                }}>
                  Selamat Datang di {activeStoreName}
                </h1>
                <p style={{
                  fontSize: '15px',
                  color: '#94a3b8',
                  maxWidth: '520px',
                  margin: '0 auto',
                  lineHeight: 1.6
                }}>
                  Silakan letakkan barang belanjaan Anda di meja kasir. Rincian harga, varian, dan total tagihan akan tampil transparan secara langsung di layar ini.
                </p>
              </div>

              {/* 3 Transparency Feature Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                width: '100%',
                maxWidth: '680px',
                marginTop: '12px'
              }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '18px 14px',
                  textAlign: 'center'
                }}>
                  <ShieldCheck size={26} color="#38bdf8" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>Transparansi Penuh</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>Harga dan diskon langsung terverifikasi tanpa biaya tersembunyi</div>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '18px 14px',
                  textAlign: 'center'
                }}>
                  <QrCode size={26} color="#34d399" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>QRIS & Multi Payment</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>Mendukung QRIS semua e-wallet, Debit, Kredit, & Tunai</div>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '18px 14px',
                  textAlign: 'center'
                }}>
                  <Tag size={26} color="#fbbf24" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>Harga Grosir & Partai</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>Penyesuaian harga khusus otomatis untuk pembelian banyak</div>
                </div>
              </div>

              {/* Waiting status pill */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '24px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                fontSize: '12px',
                fontWeight: 600,
                color: '#7dd3fc',
                marginTop: '10px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#38bdf8', animation: 'pulse 1.5s infinite' }} />
                <span>Menunggu pemindaian item oleh kasir...</span>
              </div>
            </div>
          ) : (
            /* ACTIVE SCANNED ITEMS LIST */
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              {state.items.map((item, index) => {
                const isSpecialPrice = item.isCustomPrice || (item.originalPrice != null && item.originalPrice !== item.price);
                const isLastItem = index === state.items.length - 1;

                return (
                  <div 
                    key={item.cartId || `${item.id}-${index}`}
                    style={{
                      background: isLastItem 
                        ? 'linear-gradient(90deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.6) 100%)' 
                        : 'rgba(30, 41, 59, 0.45)',
                      border: isLastItem 
                        ? '1px solid rgba(56, 189, 248, 0.4)' 
                        : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '14px',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      transition: 'all 0.25s ease-out',
                      boxShadow: isLastItem ? '0 4px 16px rgba(56, 189, 248, 0.12)' : 'none'
                    }}
                  >
                    {/* Item Thumbnail & Details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                      {/* Product Thumbnail or Box Icon */}
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '10px',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {item.img ? (
                          <img src={item.img} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <ShoppingBag size={22} color="#64748b" />
                        )}
                      </div>

                      {/* Name, Variant & Badges */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.name}
                          </span>
                          {item.variantName && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: 'rgba(168, 85, 247, 0.15)',
                              color: '#c084fc',
                              border: '1px solid rgba(168, 85, 247, 0.3)'
                            }}>
                              {item.variantName}
                            </span>
                          )}
                          {isSpecialPrice && (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.3)'
                            }}>
                              {item.customPriceNote || 'Harga Khusus'}
                            </span>
                          )}
                        </div>

                        {/* Price Details */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '13px', color: '#94a3b8' }}>
                          <span style={{ fontWeight: 600, color: '#cbd5e1' }}>
                            {formatIDR(item.price)}
                          </span>
                          {isSpecialPrice && item.originalPrice && item.originalPrice !== item.price && (
                            <span style={{ textDecoration: 'line-through', fontSize: '11px', color: '#64748b' }}>
                              {formatIDR(item.originalPrice)}
                            </span>
                          )}
                          <span style={{ color: '#475569' }}>/ {item.unit || 'Pcs'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quantity Badge */}
                    <div style={{
                      padding: '6px 14px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#38bdf8',
                      minWidth: '60px',
                      textAlign: 'center'
                    }}>
                      × {item.qty}
                    </div>

                    {/* Line Subtotal */}
                    <div style={{ textAlign: 'right', minWidth: '120px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                        {formatIDR(Math.round(item.price * item.qty))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={itemsEndRef} />
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: FINANCIAL SUMMARY, BILLING TRANSPARENCY & PAYMENT STATUS */}
        <section style={{
          flex: '1 1 38%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>

          {/* Transparency Summary Card */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            {/* Order Info Pills */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                  Nomor Nota
                </span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
                  Nota #{state.orderNumber || '001'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: '8px',
                  background: state.orderType === 'WHOLESALE' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: state.orderType === 'WHOLESALE' ? '#fbbf24' : '#34d399',
                  border: `1px solid ${state.orderType === 'WHOLESALE' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                }}>
                  {state.orderType === 'WHOLESALE' ? 'GROSIR / PARTAI' : 'REGULER'}
                </span>
                {state.customerName && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>
                    {state.customerName}
                  </div>
                )}
              </div>
            </div>

            {/* Price Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#94a3b8' }}>
                <span>Subtotal ({state.items.length} item)</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatIDR(state.subtotal)}</span>
              </div>

              {state.taxEnabled && state.tax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#94a3b8' }}>
                  <span>PPN ({state.taxRate}%)</span>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatIDR(state.tax)}</span>
                </div>
              )}

              {state.rounding !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#94a3b8' }}>
                  <span>Pembulatan Nilai</span>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>{formatIDR(state.rounding)}</span>
                </div>
              )}
            </div>

            {/* GRAND TOTAL BOX */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(218, 41, 28, 0.15) 0%, rgba(153, 27, 27, 0.25) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '16px',
              padding: '20px 24px',
              boxShadow: '0 8px 30px rgba(218, 41, 28, 0.2)',
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#fca5a5',
                marginBottom: '4px'
              }}>
                Total Tagihan Anda
              </div>
              <div style={{
                fontSize: '38px',
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {formatIDR(state.total)}
              </div>
            </div>
          </div>

          {/* BOTTOM DYNAMIC PAYMENT / INSTRUCTION CARD */}
          <div style={{
            flex: 1,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>

            {/* Dynamic Status Display */}
            {isPaymentOpen ? (
              state.paymentState.method === 'QRIS' ? (
                /* QRIS DISPLAY WITH DYNAMIC QR CODE */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{
                      padding: '3px 10px',
                      background: '#da291c',
                      color: '#ffffff',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 900,
                      letterSpacing: '0.05em'
                    }}>
                      QRIS
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                      Pindai untuk Membayar
                    </span>
                  </div>

                  {/* QRIS Image Canvas */}
                  <div style={{
                    padding: '12px',
                    background: '#ffffff',
                    borderRadius: '16px',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.4)',
                    marginBottom: '14px'
                  }}>
                    {qrisDataUrl ? (
                      <img src={qrisDataUrl} alt="QRIS Code" style={{ width: '170px', height: '170px', display: 'block' }} />
                    ) : (
                      <div style={{ width: '170px', height: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <QrCode size={140} color="#0f172a" />
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '280px', lineHeight: 1.4 }}>
                    Mendukung <strong style={{ color: '#ffffff' }}>BCA, Mandiri, GoPay, OVO, ShopeePay, Dana, LinkAja</strong> & semua aplikasi perbankan.
                  </div>
                </div>
              ) : state.paymentState.method === 'TUNAI' ? (
                /* CASH PAYMENT PROGRESS */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '14px' }}>
                  <div style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Banknote size={28} color="#22c55e" />
                  </div>

                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                      Pembayaran Tunai Sedang Diproses
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      Silakan serahkan uang tunai kepada kasir
                    </div>
                  </div>

                  {state.paymentState.tendered > 0 && (
                    <div style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#94a3b8' }}>
                        <span>Uang Diterima:</span>
                        <span style={{ fontWeight: 700, color: '#f8fafc' }}>{formatIDR(state.paymentState.tendered)}</span>
                      </div>
                      {state.paymentState.change >= 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#34d399', fontWeight: 800 }}>
                          <span>Kembalian:</span>
                          <span>{formatIDR(state.paymentState.change)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : state.paymentState.method === 'EDC' ? (
                /* EDC / CARD PAYMENT */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <CreditCard size={28} color="#38bdf8" />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                      Pembayaran Kartu EDC / Debit
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      Silakan tap atau masukkan kartu ATM / Kredit Anda pada mesin EDC kasir
                    </div>
                  </div>
                </div>
              ) : (
                /* OTHER METHODS (TEMPO / KUPON) */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <Receipt size={32} color="#fbbf24" />
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                    Metode: {state.paymentState.method}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Transaksi sedang disiapkan oleh kasir
                  </div>
                </div>
              )
            ) : (
              /* IDLE PAYMENT STATUS - PROMO OR SUPPORT BANNER */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#94a3b8',
                  fontSize: '13px'
                }}>
                  <CreditCard size={18} color="#38bdf8" />
                  <Banknote size={18} color="#34d399" />
                  <QrCode size={18} color="#da291c" />
                  <span>Menerima QRIS, Kartu & Tunai</span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '300px', lineHeight: 1.4 }}>
                  Setelah kasir selesai memindai semua item, rincian pembayaran dan kode QRIS akan tampil di sini.
                </div>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* FOOTER TICKER: Guarantee & Transparency Note */}
      <footer style={{
        height: '42px',
        padding: '0 28px',
        background: 'rgba(15, 23, 42, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#64748b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={14} color="#10b981" />
          <span>Sistem Kasir Terverifikasi · Jaminan Transparansi Harga & Perhitungan Tepat</span>
        </div>
        <div>
          <span>{activeStoreName} Powered by VOC POS PRO</span>
        </div>
      </footer>

    </div>
  );
}
