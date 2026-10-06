import React, { useEffect, useState } from 'react';
import { BellRing, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface NotificationData {
  id: string;
  type: 'sale' | 'stock';
  title: string;
  message: string;
}

const GlobalNotification: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  useEffect(() => {
    const socket = (window as any).socketInstance;
    if (!socket) return;

    const handleSale = (data: any) => {
      const id = Date.now().toString() + Math.random().toString();
      const amountFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(data.amount);
      
      const notif: NotificationData = {
        id,
        type: 'sale',
        title: 'Uang Masuk',
        message: `${data.paymentMethod} ${amountFormatted} (Kasir: ${data.cashier})`
      };
      
      setNotifications(prev => [...prev, notif]);
      setTimeout(() => removeNotification(id), 5000);
      playChime('sale');
    };

    const handleStock = (data: any) => {
      const id = Date.now().toString() + Math.random().toString();
      
      const notif: NotificationData = {
        id,
        type: 'stock',
        title: 'Peringatan Stok',
        message: `Stok ${data.productName} telah habis!`
      };
      
      setNotifications(prev => [...prev, notif]);
      setTimeout(() => removeNotification(id), 7000);
      playChime('stock');
    };

    socket.on('sale_completed', handleSale);
    socket.on('stock_depleted', handleStock);

    return () => {
      socket.off('sale_completed', handleSale);
      socket.off('stock_depleted', handleStock);
    };
  }, []);

  const playChime = (type: 'sale' | 'stock') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'sale') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.6, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {
      // Audio might be blocked if no user interaction
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 'env(safe-area-inset-top, 20px)',
      right: '20px',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none'
    }}>
      {notifications.map(notif => (
        <div key={notif.id} style={{
          width: '320px',
          background: notif.type === 'sale' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${notif.type === 'sale' ? '#10b981' : '#ef4444'}`,
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          gap: '12px',
          pointerEvents: 'auto',
          animation: 'slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          <style>{`
            @keyframes slideInRight {
              from { transform: translateX(120%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
          
          <div style={{ color: notif.type === 'sale' ? '#10b981' : '#ef4444', flexShrink: 0 }}>
            {notif.type === 'sale' ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600, color: '#111827' }}>
              {notif.title}
            </h4>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#4b5563', lineHeight: 1.4 }}>
              {notif.message}
            </p>
          </div>
          
          <button 
            onClick={() => removeNotification(notif.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px', height: 'fit-content' }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default GlobalNotification;
