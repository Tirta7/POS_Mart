import { useState } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { useSalesStore } from '../store/useSalesStore';
import { useAuthStore } from '../store/useAuthStore';
import type { SalesTransaction } from '../types';

interface VoidTransactionModalProps {
  sale: SalesTransaction;
  onClose: () => void;
  onSuccess?: () => void;
}

const formatIDR = (num: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num || 0);
};

export default function VoidTransactionModal({ sale, onClose, onSuccess }: VoidTransactionModalProps) {
  const { voidSale } = useSalesStore();
  const { currentUser } = useAuthStore();

  const [reason, setReason] = useState<string>('Salah input item / kasir keliru');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleVoid = async () => {
    if (!reason.trim()) {
      alert("Masukkan alasan pembatalan transaksi.");
      return;
    }

    if (!confirm(`APAKAH ANDA YAKIN membatalkan (VOID) nota ${sale.id} senilai ${formatIDR(sale.total)}? Seluruh stok barang akan otomatis dikembalikan ke gudang/rak.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await voidSale(sale.id, {
        reason,
        employee_id: currentUser?.id,
        employee_name: currentUser?.name || 'Admin'
      });
      if (ok) {
        alert("Transaksi berhasil dibatalkan (VOID) dan seluruh stok telah dikembalikan ke inventaris!");
        if (onSuccess) onSuccess();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '520px',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(15, 23, 42, 0.4)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px', background: '#fee2e2',
              color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                Batalkan (VOID) Transaksi
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Nota: <strong style={{ fontFamily: 'monospace' }}>{sale.id}</strong> ({formatIDR(sale.total)})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: '10px',
              width: '34px', height: '34px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#64748b'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '12px',
            padding: '12px', fontSize: '12.5px', color: '#be123c', lineHeight: 1.4
          }}>
            <strong>Peringatan Pembatalan Transaksi:</strong>
            <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
              <li>Status nota akan ditandai sebagai <strong>VOID</strong>.</li>
              <li>Semua item produk pada nota ini akan <strong>secara otomatis dikembalikan ke stok fisik</strong>.</li>
              <li>Tindakan ini tidak dapat dibatalkan.</li>
            </ul>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
              Alasan Pembatalan:
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '12.5px', background: '#ffffff', marginBottom: '8px', fontWeight: 600
              }}
            >
              <option value="Salah input item / kasir keliru">Salah input item / kasir keliru</option>
              <option value="Pelanggan membatalkan seluruh pesanan">Pelanggan membatalkan seluruh pesanan</option>
              <option value="Duplikasi transaksi kasir">Duplikasi transaksi kasir</option>
              <option value="Kesalahan metode pembayaran">Kesalahan metode pembayaran</option>
              <option value="Lainnya">Alasan lainnya</option>
            </select>

            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Jelaskan alasan pembatalan..."
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '12px'
              }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #f1f5f9', background: '#fafbfc',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '10px',
              padding: '9px 18px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer'
            }}
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleVoid}
            disabled={isSubmitting}
            style={{
              background: '#dc2626', border: 'none', borderRadius: '10px',
              padding: '10px 20px', fontSize: '13px', fontWeight: 800, color: '#ffffff',
              display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)'
            }}
          >
            <Trash2 size={15} /> {isSubmitting ? 'Membatalkan...' : 'Ya, Batalkan Transaksi (VOID)'}
          </button>
        </div>
      </div>
    </div>
  );
}
