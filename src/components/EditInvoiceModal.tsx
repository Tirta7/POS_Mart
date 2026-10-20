import React, { useState, useMemo } from 'react';
import { X, Plus, Minus, Trash2, Search, Save, AlertCircle, ShoppingCart, User, Calendar, CreditCard } from 'lucide-react';
import { useCustomerStore } from '../store/useCustomerStore';
import { useInventoryStore } from '../store/useInventoryStore';
import { useSalesStore } from '../store/useSalesStore';
import type { SalesTransaction } from '../types';

interface EditInvoiceModalProps {
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

export default function EditInvoiceModal({ sale, onClose, onSuccess }: EditInvoiceModalProps) {
  const { customers } = useCustomerStore();
  const { products } = useInventoryStore();
  const { updateSale } = useSalesStore();

  const [customerId, setCustomerId] = useState<string>(sale.customerId || '');
  const [customerName, setCustomerName] = useState<string>(sale.customerName || 'Retail');
  const [paymentMethod, setPaymentMethod] = useState<string>(sale.paymentMethod || 'TUNAI');
  const [dueDate, setDueDate] = useState<string>(sale.dueDate ? sale.dueDate.split('T')[0] : '');
  const [notes, setNotes] = useState<string>(sale.notes || '');

  // Copy items
  const [items, setItems] = useState<any[]>(() => {
    return (sale.items || []).map(it => ({
      productId: it.productId,
      variantId: it.variantId || null,
      variantName: it.variantName || null,
      name: it.name,
      qty: it.qty,
      price: it.price,
      subtotal: it.subtotal || it.price * it.qty,
      originalPrice: it.originalPrice != null ? it.originalPrice : it.price,
      isCustomPrice: Boolean(it.isCustomPrice),
      customPriceNote: it.customPriceNote || ''
    }));
  });

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Recalculate total
  const calculatedTotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.qty || 0)), 0);
  }, [items]);

  const handleQtyChange = (index: number, delta: number) => {
    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[index] };
      const newQty = Math.max(1, (target.qty || 1) + delta);
      target.qty = newQty;
      target.subtotal = newQty * target.price;
      copy[index] = target;
      return copy;
    });
  };

  const handlePriceChange = (index: number, newPrice: number) => {
    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[index] };
      target.price = Math.max(0, newPrice);
      target.isCustomPrice = target.originalPrice ? target.price !== target.originalPrice : false;
      target.subtotal = target.qty * target.price;
      copy[index] = target;
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      alert("Invoice harus memiliki minimal 1 item produk. Jika ingin membatalkan transaksi seutuhnya, gunakan fitur Batalkan (VOID).");
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddProduct = (prod: any) => {
    const existingIndex = items.findIndex(it => it.productId === prod.id && !it.variantId);
    if (existingIndex >= 0) {
      handleQtyChange(existingIndex, 1);
    } else {
      setItems(prev => [
        ...prev,
        {
          productId: prod.id,
          variantId: null,
          variantName: null,
          name: prod.name,
          qty: 1,
          price: prod.sellingPrice || 0,
          subtotal: prod.sellingPrice || 0,
          originalPrice: prod.sellingPrice || 0,
          isCustomPrice: false,
          customPriceNote: ''
        }
      ]);
    }
    setShowAddProduct(false);
    setProductSearch('');
  };

  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cid = e.target.value;
    setCustomerId(cid);
    if (!cid) {
      setCustomerName('Retail');
    } else {
      const found = customers.find(c => c.id === cid);
      setCustomerName(found ? found.name : 'Retail');
    }
  };

  const handleSave = async () => {
    if (items.length === 0) {
      alert("Keranjang tidak boleh kosong.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        customer_id: customerId || null,
        customer_name: customerName || null,
        payment_method: paymentMethod,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes || null,
        items: items.map(it => ({
          product_id: it.productId,
          variant_id: it.variantId || null,
          variant_name: it.variantName || null,
          quantity: it.qty,
          price: it.price,
          subtotal: it.qty * it.price,
          original_price: it.originalPrice,
          is_custom_price: it.isCustomPrice,
          custom_price_note: it.customPriceNote
        }))
      };

      const ok = await updateSale(sale.id, payload);
      if (ok) {
        alert("Invoice berhasil diperbarui dan penyesuaian stok telah dicatat!");
        if (onSuccess) onSuccess();
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 15);
    const q = productSearch.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [products, productSearch]);

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '820px',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(15, 23, 42, 0.35)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                Edit & Koreksi Invoice
              </h3>
              <span style={{
                fontFamily: 'monospace', fontSize: '12px', fontWeight: 800,
                background: '#e2e8f0', color: '#1e293b', padding: '2px 8px', borderRadius: '6px'
              }}>
                {sale.id}
              </span>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Koreksi data pelanggan, item pesanan, dan penyesuaian harga. Stok fisik akan dihitung ulang secara otomatis.
            </p>
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
          {/* Info Banner */}
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#166534'
          }}>
            <AlertCircle size={16} color="#16a34a" style={{ flexShrink: 0 }} />
            <span>
              <strong>Koreksi Stok Otomatis:</strong> Penambahan atau pengurangan jumlah item pada invoice ini akan otomatis mencatat mutasi stok selisih (ADJUSTMENT) di database.
            </span>
          </div>

          {/* Form Header Info (Pelanggan, Metode Bayar, Jatuh Tempo) */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px',
            background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0'
          }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                <User size={13} /> Pelanggan
              </label>
              <select
                value={customerId}
                onChange={handleCustomerChange}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '13px', background: '#ffffff', color: '#0f172a', fontWeight: 600
                }}
              >
                <option value="">Retail / Umum (Guest)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                <CreditCard size={13} /> Metode Pembayaran
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '13px', background: '#ffffff', color: '#0f172a', fontWeight: 600
                }}
              >
                <option value="TUNAI">TUNAI</option>
                <option value="QRIS">QRIS</option>
                <option value="EDC">DEBIT / EDC</option>
                <option value="TEMPO">TEMPO / CICILAN (GROSIR)</option>
                <option value="KUPON">KUPON</option>
              </select>
            </div>

            {paymentMethod === 'TEMPO' && (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 700, color: '#b45309', marginBottom: '5px' }}>
                  <Calendar size={13} /> Jatuh Tempo Pembayaran
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #fde68a',
                    fontSize: '13px', background: '#fffbeb', color: '#92400e', fontWeight: 600
                  }}
                />
              </div>
            )}
          </div>

          {/* Rincian Item */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShoppingCart size={15} />
                <span>Rincian Item Produk ({items.length})</span>
              </div>

              <button
                type="button"
                onClick={() => setShowAddProduct(true)}
                style={{
                  background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                  padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer'
                }}
              >
                <Plus size={14} /> Tambah Item ke Nota
              </button>
            </div>

            {/* Selector Popover Tambah Produk */}
            {showAddProduct && (
              <div style={{
                background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px',
                padding: '12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Pilih Produk Tambahan:</span>
                  <button
                    type="button"
                    onClick={() => setShowAddProduct(false)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="Cari nama barang atau barcode..."
                    autoFocus
                    style={{
                      width: '100%', padding: '7px 10px 7px 32px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      fontSize: '12.5px', background: '#ffffff'
                    }}
                  />
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filteredProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      style={{
                        padding: '8px 10px', borderRadius: '8px', background: '#ffffff', border: '1px solid #e2e8f0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
                    >
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Stok saat ini: {p.stock} {p.unit}</div>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>
                        {formatIDR(p.sellingPrice)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Table Items */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px' }}>Nama Produk</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', width: '130px' }}>Jumlah (Qty)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', width: '140px' }}>Harga Satuan</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', width: '140px' }}>Subtotal</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center', width: '50px' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.name}</div>
                        {it.variantName && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Varian: {it.variantName}</div>
                        )}
                        {it.isCustomPrice && (
                          <span style={{
                            fontSize: '10px', background: '#fef3c7', color: '#b45309',
                            padding: '1px 6px', borderRadius: '4px', fontWeight: 700, display: 'inline-block', marginTop: '2px'
                          }}>
                            Harga Khusus
                          </span>
                        )}
                      </td>

                      {/* Qty Counter */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(idx, -1)}
                            style={{
                              background: '#f8fafc', border: 'none', borderRight: '1px solid #cbd5e1',
                              padding: '5px 8px', cursor: 'pointer', color: '#475569'
                            }}
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={it.qty}
                            onChange={e => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setItems(prev => {
                                const c = [...prev];
                                c[idx] = { ...c[idx], qty: val, subtotal: val * c[idx].price };
                                return c;
                              });
                            }}
                            style={{
                              width: '44px', textAlign: 'center', border: 'none', fontSize: '12.5px',
                              fontWeight: 800, color: '#0f172a', padding: '4px 0'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(idx, 1)}
                            style={{
                              background: '#f8fafc', border: 'none', borderLeft: '1px solid #cbd5e1',
                              padding: '5px 8px', cursor: 'pointer', color: '#475569'
                            }}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>

                      {/* Harga Satuan */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <input
                          type="number"
                          value={it.price}
                          onChange={e => handlePriceChange(idx, parseFloat(e.target.value) || 0)}
                          style={{
                            width: '110px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                            fontSize: '12.5px', fontWeight: 700, textAlign: 'right', color: '#0f172a'
                          }}
                        />
                      </td>

                      {/* Subtotal */}
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        {formatIDR(it.qty * it.price)}
                      </td>

                      {/* Delete */}
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          title="Hapus item dari invoice"
                          style={{
                            background: '#fee2e2', border: 'none', borderRadius: '6px',
                            width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center',
                            justifyContent: 'center', color: '#dc2626', cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catatan Tambahan */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              Catatan Transaksi / Pengiriman
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Contoh: Barang dikirim ke toko cabang, pelunasan via transfer bank..."
              rows={2}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '12.5px', color: '#0f172a', resize: 'vertical'
              }}
            />
          </div>

          {/* Ringkasan Perubahan Total */}
          <div style={{
            background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Total Sebelum Edit: <strong>{formatIDR(sale.total)}</strong></div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                Total Setelah Koreksi:
              </div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#16a34a' }}>
              {formatIDR(calculatedTotal)}
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
            onClick={handleSave}
            disabled={isSaving}
            style={{
              background: '#2563eb', border: 'none', borderRadius: '10px',
              padding: '10px 22px', fontSize: '13.5px', fontWeight: 800, color: '#ffffff',
              display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)', opacity: isSaving ? 0.7 : 1
            }}
          >
            <Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan Perubahan Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}
