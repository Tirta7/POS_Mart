import { useState, useMemo } from 'react';
import { X, RotateCcw, AlertTriangle } from 'lucide-react';
import { useSalesStore } from '../store/useSalesStore';
import { useAuthStore } from '../store/useAuthStore';
import type { SalesTransaction } from '../types';

interface SalesReturnModalProps {
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

export default function SalesReturnModal({ sale, onClose, onSuccess }: SalesReturnModalProps) {
  const { recordReturn } = useSalesStore();
  const { currentUser } = useAuthStore();

  // State untuk item yang dipilih retur
  const [returnItems, setReturnItems] = useState<{
    [productId: string]: {
      selected: boolean;
      qty: number;
      returnToStock: boolean;
      refundPrice: number;
    }
  }>(() => {
    const init: any = {};
    (sale.items || []).forEach(it => {
      const key = `${it.productId}_${it.variantId || 'none'}`;
      init[key] = {
        selected: false,
        qty: 1,
        returnToStock: true,
        refundPrice: it.price
      };
    });
    return init;
  });

  const [refundMethod, setRefundMethod] = useState<'CASH' | 'POTONG_PIUTANG'>(
    sale.paymentStatus === 'PARTIAL' || sale.paymentStatus === 'UNPAID' ? 'POTONG_PIUTANG' : 'CASH'
  );
  const [reasonCategory, setReasonCategory] = useState<string>('Barang Rusak / Cacat');
  const [reasonDetail, setReasonDetail] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Hitung total refund
  const totalRefund = useMemo(() => {
    let sum = 0;
    (sale.items || []).forEach(it => {
      const key = `${it.productId}_${it.variantId || 'none'}`;
      const state = returnItems[key];
      if (state && state.selected) {
        sum += (state.qty * state.refundPrice);
      }
    });
    return sum;
  }, [returnItems, sale.items]);

  const selectedCount = useMemo(() => {
    return Object.values(returnItems).filter(i => i.selected).length;
  }, [returnItems]);

  const handleToggleSelect = (key: string) => {
    setReturnItems(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        selected: !prev[key].selected
      }
    }));
  };

  const handleQtyChange = (key: string, maxQty: number, val: number) => {
    const clamped = Math.max(1, Math.min(maxQty, val));
    setReturnItems(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        qty: clamped
      }
    }));
  };

  const handleStockActionChange = (key: string, returnToStock: boolean) => {
    setReturnItems(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        returnToStock
      }
    }));
  };

  const handleSubmit = async () => {
    const itemsToReturn: any[] = [];
    (sale.items || []).forEach(it => {
      const key = `${it.productId}_${it.variantId || 'none'}`;
      const state = returnItems[key];
      if (state && state.selected && state.qty > 0) {
        itemsToReturn.push({
          product_id: it.productId,
          variant_id: it.variantId || null,
          variant_name: it.variantName || null,
          quantity: state.qty,
          refund_price: state.refundPrice,
          return_to_stock: state.returnToStock
        });
      }
    });

    if (itemsToReturn.length === 0) {
      alert("Pilih minimal 1 item yang ingin diretur.");
      return;
    }

    const fullReason = `${reasonCategory}${reasonDetail.trim() ? `: ${reasonDetail.trim()}` : ''}`;

    setIsSubmitting(true);
    try {
      const payload = {
        items: itemsToReturn,
        refund_method: refundMethod,
        reason: fullReason,
        employee_id: currentUser?.id,
        employee_name: currentUser?.name || 'Kasir'
      };

      const ok = await recordReturn(sale.id, payload);
      if (ok) {
        alert("Retur penjualan berhasil diproses! Stok barang dan catatan keuangan telah disesuaikan.");
        if (onSuccess) onSuccess();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '780px',
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
              width: '38px', height: '38px', borderRadius: '10px', background: '#fef2f2',
              color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <RotateCcw size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Form Retur Barang Penjualan
                </h3>
                <span style={{
                  fontFamily: 'monospace', fontSize: '12px', fontWeight: 800,
                  background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px'
                }}>
                  {sale.id}
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Pelanggan: <strong>{sale.customerName || 'Retail'}</strong> • Total Belanja Asal: <strong>{formatIDR(sale.total)}</strong>
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
          {/* Petunjuk */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px',
            padding: '12px 14px', fontSize: '12.5px', color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: '10px'
          }}>
            <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              Pilih item yang ingin dikembalikan pelanggan. Anda dapat menentukan apakah barang tersebut layak masuk kembali ke stok jual toko atau dicatat sebagai barang rusak/afkir.
            </div>
          </div>

          {/* List Items Penjualan */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>
              Pilih Item Yang Diretur:
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px', width: '40px', textAlign: 'center' }}>Pilih</th>
                    <th style={{ padding: '10px 14px' }}>Produk</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', width: '140px' }}>Qty Retur</th>
                    <th style={{ padding: '10px 14px', width: '190px' }}>Kondisi Fisik</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px' }}>Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {(sale.items || []).map((it, idx) => {
                    const key = `${it.productId}_${it.variantId || 'none'}`;
                    const itemState = returnItems[key] || { selected: false, qty: 1, returnToStock: true, refundPrice: it.price };

                    return (
                      <tr key={idx} style={{
                        borderBottom: idx < (sale.items || []).length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: itemState.selected ? '#fffdf7' : 'transparent'
                      }}>
                        {/* Checkbox */}
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={itemState.selected}
                            onChange={() => handleToggleSelect(key)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#dc2626' }}
                          />
                        </td>

                        {/* Nama Produk */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.name}</div>
                          {it.variantName && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Varian: {it.variantName}</div>
                          )}
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            Dibeli: {it.qty} unit • {formatIDR(it.price)}/unit
                          </div>
                        </td>

                        {/* Qty Retur Input */}
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="number"
                              min="1"
                              max={it.qty}
                              disabled={!itemState.selected}
                              value={itemState.qty}
                              onChange={e => handleQtyChange(key, it.qty, parseInt(e.target.value) || 1)}
                              style={{
                                width: '60px', padding: '5px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                textAlign: 'center', fontWeight: 800, fontSize: '13px',
                                opacity: itemState.selected ? 1 : 0.5
                              }}
                            />
                            <span style={{ fontSize: '11px', color: '#64748b' }}>/ {it.qty}</span>
                          </div>
                        </td>

                        {/* Kondisi Barang */}
                        <td style={{ padding: '10px 14px' }}>
                          <select
                            disabled={!itemState.selected}
                            value={itemState.returnToStock ? 'true' : 'false'}
                            onChange={e => handleStockActionChange(key, e.target.value === 'true')}
                            style={{
                              width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                              fontSize: '11.5px', background: '#ffffff', color: itemState.returnToStock ? '#166534' : '#991b1b',
                              fontWeight: 700, opacity: itemState.selected ? 1 : 0.5
                            }}
                          >
                            <option value="true">✅ Masuk Kembali ke Stok</option>
                            <option value="false">❌ Rusak/Afkir (Jangan Masuk Stok)</option>
                          </select>
                        </td>

                        {/* Refund Subtotal */}
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: itemState.selected ? '#dc2626' : '#94a3b8' }}>
                          {formatIDR(itemState.selected ? itemState.qty * itemState.refundPrice : 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Opsi Alasan & Metode Pengembalian */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px',
            background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                Kategori Alasan Retur
              </label>
              <select
                value={reasonCategory}
                onChange={e => setReasonCategory(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '12.5px', background: '#ffffff', fontWeight: 600
                }}
              >
                <option value="Barang Rusak / Cacat">Barang Rusak / Cacat Fisik</option>
                <option value="Salah Beli Ukuran / Model">Salah Beli Ukuran / Model</option>
                <option value="Barang Kedaluwarsa">Barang Kedaluwarsa</option>
                <option value="Tidak Sesuai Permintaan Pelanggan">Tidak Sesuai Permintaan Pelanggan</option>
                <option value="Pelanggan Batal Beli">Pelanggan Batal Beli</option>
                <option value="Lainnya">Alasan Lainnya</option>
              </select>

              <input
                type="text"
                value={reasonDetail}
                onChange={e => setReasonDetail(e.target.value)}
                placeholder="Rincian alasan (opsional)..."
                style={{
                  width: '100%', marginTop: '6px', padding: '7px 10px', borderRadius: '8px',
                  border: '1px solid #cbd5e1', fontSize: '12px', background: '#ffffff'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                Solusi Pengembalian Dana (Refund)
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                  borderRadius: '8px', border: refundMethod === 'CASH' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: refundMethod === 'CASH' ? '#eff6ff' : '#ffffff', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700
                }}>
                  <input
                    type="radio"
                    name="refundMethod"
                    checked={refundMethod === 'CASH'}
                    onChange={() => setRefundMethod('CASH')}
                    style={{ accentColor: '#2563eb' }}
                  />
                  <span>Kembalikan Uang Tunai (Cash Refund)</span>
                </label>

                <label style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                  borderRadius: '8px', border: refundMethod === 'POTONG_PIUTANG' ? '2px solid #059669' : '1px solid #cbd5e1',
                  background: refundMethod === 'POTONG_PIUTANG' ? '#ecfdf5' : '#ffffff', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700
                }}>
                  <input
                    type="radio"
                    name="refundMethod"
                    checked={refundMethod === 'POTONG_PIUTANG'}
                    onChange={() => setRefundMethod('POTONG_PIUTANG')}
                    style={{ accentColor: '#059669' }}
                  />
                  <span>Potong Sisa Piutang / Tagihan Tempo</span>
                </label>
              </div>
            </div>
          </div>

          {/* Ringkasan Retur Box */}
          <div style={{
            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            borderRadius: '14px', padding: '16px 20px', border: '1.5px solid #fecaca',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#991b1b' }}>
                Total Nilai Pengembalian ({selectedCount} item dipilih):
              </div>
              <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>
                Metode: {refundMethod === 'CASH' ? 'Pengembalian Uang Tunai Kasir' : 'Pengurangan Saldo Hutang/Tempo'}
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#dc2626' }}>
              {formatIDR(totalRefund)}
            </div>
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
            onClick={handleSubmit}
            disabled={isSubmitting || selectedCount === 0}
            style={{
              background: selectedCount > 0 ? '#dc2626' : '#cbd5e1', border: 'none', borderRadius: '10px',
              padding: '10px 22px', fontSize: '13.5px', fontWeight: 800, color: '#ffffff',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
              boxShadow: selectedCount > 0 ? '0 2px 4px rgba(220, 38, 38, 0.25)' : 'none'
            }}
          >
            <RotateCcw size={16} /> {isSubmitting ? 'Memproses Retur...' : 'Konfirmasi Retur Barang'}
          </button>
        </div>
      </div>
    </div>
  );
}
