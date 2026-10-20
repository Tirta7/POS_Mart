import { useState } from 'react';
import { X, CheckCircle, Clock, Calendar, DollarSign } from 'lucide-react';
import { useSalesStore } from '../store/useSalesStore';
import { useAuthStore } from '../store/useAuthStore';
import type { SalesTransaction } from '../types';

interface InstallmentPaymentModalProps {
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

export default function InstallmentPaymentModal({ sale, onClose, onSuccess }: InstallmentPaymentModalProps) {
  const { recordPayment } = useSalesStore();
  const { currentUser } = useAuthStore();

  const total = Number(sale.total || 0);
  const paid = Number(sale.paidAmount || 0);
  const remaining = Math.max(0, total - paid);

  const [amountStr, setAmountStr] = useState<string>(remaining.toString());
  const [paymentMethod, setPaymentMethod] = useState<string>('TUNAI');
  const [note, setNote] = useState<string>('Pelunasan saat barang sampai');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const inputAmount = parseFloat(amountStr) || 0;
  const isFullPayment = inputAmount >= remaining;
  const newRemaining = Math.max(0, remaining - inputAmount);

  const handleQuickPercent = (pct: number) => {
    const val = Math.round(remaining * (pct / 100));
    setAmountStr(val.toString());
  };

  const handleSubmit = async () => {
    if (inputAmount <= 0) {
      alert("Masukkan nominal pembayaran yang valid (lebih dari 0).");
      return;
    }

    if (inputAmount > remaining) {
      if (!confirm(`Nominal pembayaran (${formatIDR(inputAmount)}) melebihi sisa tagihan (${formatIDR(remaining)}). Lanjutkan?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        amount: inputAmount,
        payment_method: paymentMethod,
        cashier_id: currentUser?.id,
        cashier_name: currentUser?.name || 'Kasir',
        note: note || (isFullPayment ? 'Pelunasan Transaksi' : 'Pembayaran Cicilan')
      };

      const ok = await recordPayment(sale.id, payload);
      if (ok) {
        alert(isFullPayment ? "Pembayaran berhasil! Status nota kini LUNAS." : "Pembayaran cicilan berhasil dicatat!");
        if (onSuccess) onSuccess();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentsHistory = sale.payments || [];

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '640px',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(15, 23, 42, 0.35)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px', background: '#ecfdf5',
              color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <DollarSign size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Pembayaran Cicilan / Pelunasan
                </h3>
                <span style={{
                  fontFamily: 'monospace', fontSize: '12px', fontWeight: 800,
                  background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px'
                }}>
                  {sale.id}
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Pelanggan: <strong>{sale.customerName || 'Retail'}</strong> • Sisa Tagihan: <strong style={{ color: '#dc2626' }}>{formatIDR(remaining)}</strong>
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
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Progress Card */}
          <div style={{
            background: '#f8fafc', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}>
              <span>Total Nota: <strong>{formatIDR(total)}</strong></span>
              <span>Sudah Dibayar: <strong style={{ color: '#16a34a' }}>{formatIDR(paid)} ({total ? Math.round((paid / total) * 100) : 0}%)</strong></span>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                width: `${total ? Math.min(100, Math.round((paid / total) * 100)) : 0}%`,
                height: '100%', background: '#10b981', borderRadius: '999px', transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {sale.dueDate && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={12} /> Jatuh Tempo: {new Date(sale.dueDate).toLocaleDateString('id-ID')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#dc2626' }}>
                Sisa Tagihan: {formatIDR(remaining)}
              </div>
            </div>
          </div>

          {/* Form Input Pembayaran */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                  Nominal Pembayaran Sekarang (Rp):
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleQuickPercent(100)}
                    style={{
                      background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0',
                      padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, cursor: 'pointer'
                    }}
                  >
                    LUNASI SEMUA
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPercent(50)}
                    style={{
                      background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                      padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    50%
                  </button>
                </div>
              </div>

              <input
                type="number"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder="Masukkan nominal..."
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #2563eb',
                  fontSize: '18px', fontWeight: 900, color: '#0f172a', background: '#ffffff'
                }}
              />

              {/* Status Pasca Bayar Preview */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '6px' }}>
                <span style={{ color: '#64748b' }}>
                  Sisa Setelah Pembayaran: <strong style={{ color: newRemaining === 0 ? '#16a34a' : '#b45309' }}>{formatIDR(newRemaining)}</strong>
                </span>
                <span style={{ fontWeight: 800, color: isFullPayment ? '#16a34a' : '#2563eb' }}>
                  {isFullPayment ? '🎉 Status Menjadi: LUNAS' : '📝 Status Tetap: CICILAN'}
                </span>
              </div>
            </div>

            {/* Metode Bayar */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Metode Pembayaran
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {['TUNAI', 'TRANSFER', 'QRIS', 'EDC'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    style={{
                      padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 800,
                      border: paymentMethod === m ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: paymentMethod === m ? '#eff6ff' : '#ffffff',
                      color: paymentMethod === m ? '#2563eb' : '#475569',
                      cursor: 'pointer', textAlign: 'center'
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Catatan */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Catatan Pembayaran (Opsional)
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Contoh: Transfer BCA an Toko, Pelunasan barang tiba di tempat..."
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '12.5px', color: '#0f172a'
                }}
              />
            </div>
          </div>

          {/* Riwayat Pembayaran Sebelumnya */}
          {paymentsHistory.length > 0 && (
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} /> Riwayat Pembayaran ({paymentsHistory.length} kali)
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 800 }}>
                      <th style={{ padding: '8px 12px' }}>Tanggal & Jam</th>
                      <th style={{ padding: '8px 12px' }}>Metode</th>
                      <th style={{ padding: '8px 12px' }}>Kasir</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsHistory.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: idx < paymentsHistory.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '8px 12px', color: '#334155' }}>
                          {new Date(p.payment_date).toLocaleDateString('id-ID')} {new Date(p.payment_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          {p.note && <div style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic' }}>"{p.note}"</div>}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{p.payment_method}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{p.cashier_name || '-'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>
                          +{formatIDR(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
            onClick={handleSubmit}
            disabled={isSubmitting || inputAmount <= 0}
            style={{
              background: '#059669', border: 'none', borderRadius: '10px',
              padding: '10px 22px', fontSize: '13.5px', fontWeight: 800, color: '#ffffff',
              display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)', opacity: isSubmitting ? 0.7 : 1
            }}
          >
            <CheckCircle size={16} /> {isSubmitting ? 'Menyimpan...' : 'Simpan Pembayaran'}
          </button>
        </div>
      </div>
    </div>
  );
}
