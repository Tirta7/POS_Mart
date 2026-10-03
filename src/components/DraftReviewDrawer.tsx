import React, { useState } from 'react';
import { CheckCircle, X, Package, AlertTriangle, Trash2, Edit2, Save } from 'lucide-react';

export interface ReviewItem {
  id: string;
  barcode?: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  purchasePrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  minStock?: number;
  image?: string;
  pending?: boolean;
  grNumber?: string;
}

interface Props {
  items: ReviewItem[];
  mode: 'single' | 'multi';
  categories: string[];
  onClose: () => void;
  onRemoveItem: (id: string) => void;
  /** Simpan perubahan satu item draf (ID/barcode tidak bisa diubah) */
  onSaveItem: (item: ReviewItem) => void;
  /** Mengembalikan nomor referensi GR hasil posting */
  onPost: (items: ReviewItem[]) => string;
}

const idr = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const UNITS = ['Pcs', 'Kg', 'Gram', 'Liter', 'Pack', 'Dus'];

const inputStyle: React.CSSProperties = { backgroundColor: 'white', height: '30px', fontSize: '12px', padding: '4px 8px' };
const labelStyle: React.CSSProperties = { fontSize: '9px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '2px', display: 'block' };

const DraftReviewDrawer: React.FC<Props> = ({ items, mode, categories, onClose, onRemoveItem, onSaveItem, onPost }) => {
  const [closing, setClosing] = useState(false);
  const [posted, setPosted] = useState<{ ref: string; count: number; value: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 250);
  };

  const startEdit = (item: ReviewItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit,
      qty: item.qty,
      minStock: item.minStock ?? 0,
      purchasePrice: item.purchasePrice,
      sellingPrice: item.sellingPrice,
      wholesalePrice: item.wholesalePrice ?? 0,
      image: item.image || '',
    });
  };

  const setF = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));
  const setNum = (key: string, v: string) => setF(key, v === '' ? '' : Number(v));

  const saveEdit = (item: ReviewItem) => {
    if (!String(form.name).trim() || !String(form.sku).trim() || Number(form.qty) <= 0 || Number(form.sellingPrice) <= 0) {
      alert('Nama, SKU, Qty (> 0) dan Harga Jual (> 0) wajib diisi.');
      return;
    }
    onSaveItem({
      ...item,
      name: String(form.name).trim(),
      sku: String(form.sku).trim(),
      category: form.category,
      unit: form.unit,
      qty: Number(form.qty),
      minStock: Number(form.minStock || 0),
      purchasePrice: Number(form.purchasePrice || 0),
      sellingPrice: Number(form.sellingPrice),
      wholesalePrice: Number(form.wholesalePrice || 0),
      image: form.image,
    });
    setEditingId(null);
  };

  const postable = items.filter(i => i.pending);
  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
  const totalValue = items.reduce((s, i) => s + Number(i.purchasePrice) * Number(i.qty), 0);

  const handlePost = () => {
    const value = postable.reduce((s, i) => s + Number(i.purchasePrice) * Number(i.qty), 0);
    const ref = onPost(postable);
    setPosted({ ref, count: postable.length, value });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(1px)',
      display: 'flex', justifyContent: 'flex-end', zIndex: 10002,
      animation: `${closing ? 'fadeOut' : 'fadeIn'} 0.25s ease forwards`
    }}>
      <div style={{
        backgroundColor: 'white', width: '100%', maxWidth: '460px', height: '100%',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
        animation: `${closing ? 'slideOutRight' : 'slideInRight'} 0.3s cubic-bezier(0.22,1,0.36,1) forwards`
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1a0505 0%, #2d0a08 50%, #1a0505 100%)',
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(218,41,28,0.3)', flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #da291c, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(218,41,28,0.4)' }}>
              <Package size={17} color="white" />
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '15px' }}>
                {mode === 'single' ? 'Detail Item Draf' : `Review Penerimaan (${items.length} Item)`}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px' }}>
                {mode === 'single' ? (items[0]?.grNumber ? `Ref: ${items[0].grNumber}` : 'Belum masuk stok / POS') : 'Periksa & edit dulu sebelum Konfirmasi & Posting'}
              </div>
            </div>
          </div>
          <button
            type="button" onClick={close}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.7)' }}
          >
            <X size={16} />
          </button>
        </div>

        {posted ? (
          /* ===== SUKSES ===== */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: '0 8px 24px rgba(34,197,94,0.4)', animation: 'scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
              <CheckCircle size={36} color="white" />
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#111827', marginBottom: '6px' }}>Posting Berhasil!</div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Nomor GR: <strong style={{ color: '#1e40af' }}>{posted.ref}</strong></div>
            <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>
              {posted.count} produk &bull; {idr(posted.value)} &bull; {new Date().toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '13px', color: '#065f46', marginBottom: '24px' }}>Stok sudah bertambah dan produk tampil di Kasir POS.</div>
            <button className="bo-btn bo-btn-primary" onClick={close}>Selesai</button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mode === 'multi' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { label: 'Item', value: items.length + ' produk', color: '#1e40af', bg: '#eff6ff' },
                    { label: 'Total Qty', value: totalQty + ' unit', color: '#065f46', bg: '#ecfdf5' },
                    { label: 'Nilai Beli', value: idr(totalValue), color: '#92400e', bg: '#fffbeb' },
                  ].map(c => (
                    <div key={c.label} style={{ flex: 1, padding: '7px 6px', backgroundColor: c.bg, borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {items.map(item => {
                const profit = item.sellingPrice - item.purchasePrice;
                const margin = item.sellingPrice > 0 ? (profit / item.sellingPrice) * 100 : 0;
                const marginColor = margin < 0 ? '#ef4444' : margin < 15 ? '#f59e0b' : '#10b981';
                const isEditing = editingId === item.id;

                return (
                  <div key={item.id} style={{ background: 'white', border: '1px solid ' + (isEditing ? 'var(--primary)' : '#e5e7eb'), borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Baris atas: foto + info + aksi */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div style={{ width: '46px', height: '46px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.image ? (
                          <img
                            src={item.image} alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Package size={20} color="#9ca3af" />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.sku} &bull; <span style={{ fontFamily: 'monospace' }}>{item.barcode || item.id}</span>
                        </div>
                        <div style={{ marginTop: '2px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span className="bo-badge bo-badge-gray" style={{ fontSize: '10px', padding: '1px 6px' }}>{item.category}</span>
                          {!item.pending && <span className="bo-badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', padding: '1px 6px' }}>Sudah masuk stok</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                        {item.pending && !isEditing && (
                          <button type="button" className="bo-action-btn" title="Edit item (mis. salah harga)" onClick={() => startEdit(item)} style={{ color: '#2563eb' }}>
                            <Edit2 size={15} />
                          </button>
                        )}
                        {mode === 'multi' && (
                          <button type="button" className="bo-action-btn" title="Keluarkan dari daftar review" onClick={() => onRemoveItem(item.id)} style={{ color: '#9ca3af' }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      /* ===== FORM EDIT INLINE ===== */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px', borderTop: '1px dashed #e5e7eb' }}>
                        <div>
                          <label style={labelStyle}>Nama Produk</label>
                          <input className="bo-input" style={inputStyle} value={form.name} onChange={e => setF('name', e.target.value)} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div>
                            <label style={labelStyle}>SKU</label>
                            <input className="bo-input" style={inputStyle} value={form.sku} onChange={e => setF('sku', e.target.value)} />
                          </div>
                          <div>
                            <label style={labelStyle}>Kategori</label>
                            <select className="bo-input" style={inputStyle} value={form.category} onChange={e => setF('category', e.target.value)}>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                              {!categories.includes(form.category) && <option value={form.category}>{form.category}</option>}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                          <div>
                            <label style={labelStyle}>Qty</label>
                            <input type="number" min="0" step="any" className="bo-input" style={inputStyle} value={form.qty} onChange={e => setNum('qty', e.target.value)} />
                          </div>
                          <div>
                            <label style={labelStyle}>Satuan</label>
                            <select className="bo-input" style={inputStyle} value={form.unit} onChange={e => setF('unit', e.target.value)}>
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>Min Stok</label>
                            <input type="number" min="0" className="bo-input" style={inputStyle} value={form.minStock} onChange={e => setNum('minStock', e.target.value)} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                          <div>
                            <label style={labelStyle}>Harga Beli</label>
                            <input type="number" min="0" className="bo-input" style={inputStyle} value={form.purchasePrice} onChange={e => setNum('purchasePrice', e.target.value)} />
                          </div>
                          <div>
                            <label style={labelStyle}>Harga Jual</label>
                            <input type="number" min="0" className="bo-input" style={inputStyle} value={form.sellingPrice} onChange={e => setNum('sellingPrice', e.target.value)} />
                          </div>
                          <div>
                            <label style={labelStyle}>Harga Grosir</label>
                            <input type="number" min="0" className="bo-input" style={inputStyle} value={form.wholesalePrice} onChange={e => setNum('wholesalePrice', e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>URL Gambar</label>
                          <input className="bo-input" style={inputStyle} value={form.image} onChange={e => setF('image', e.target.value)} placeholder="https://..." />
                        </div>
                        <div style={{ fontSize: '10px', color: '#9ca3af' }}>Barcode/ID <strong style={{ fontFamily: 'monospace' }}>{item.barcode || item.id}</strong> tidak dapat diubah.</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button type="button" className="bo-btn bo-btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setEditingId(null)}>Batal</button>
                          <button type="button" className="bo-btn bo-btn-primary" style={{ padding: '4px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => saveEdit(item)}>
                            <Save size={13} /> Simpan Perubahan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Angka ringkas */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                          {[
                            ['Qty', `${item.qty} ${item.unit}`],
                            ['H. Beli', idr(item.purchasePrice)],
                            ['H. Jual', idr(item.sellingPrice)],
                            ['H. Grosir', item.wholesalePrice ? idr(item.wholesalePrice) : '-'],
                            ['Min Stok', String(item.minStock ?? 0)],
                            ['Subtotal', idr(item.purchasePrice * item.qty)],
                          ].map(([k, v]) => (
                            <div key={k} style={{ background: '#f9fafb', borderRadius: '6px', padding: '4px 8px' }}>
                              <div style={{ color: '#9ca3af', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                              <div style={{ fontWeight: 700, color: '#111827', fontSize: '11px', whiteSpace: 'nowrap' }}>{v}</div>
                            </div>
                          ))}
                        </div>

                        {/* Margin */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>Margin</span>
                          <div style={{ flex: 1, height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: Math.min(Math.max((margin / 50) * 100, 0), 100) + '%', height: '100%', background: marginColor }} />
                          </div>
                          <span style={{ fontSize: '10px', fontWeight: 800, color: marginColor, whiteSpace: 'nowrap' }}>
                            {margin > 0 ? '+' : ''}{margin.toFixed(1)}% ({idr(profit)}/{item.unit})
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {postable.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a' }}>
                  <AlertTriangle size={14} color="#92400e" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '11px', color: '#92400e' }}>
                    Setelah posting, stok bertambah dan produk baru langsung tampil di Kasir POS.
                  </span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '12px 16px', borderTop: '1px solid #e5e7eb', backgroundColor: 'white' }}>
              {editingId && <span style={{ fontSize: '11px', color: '#b45309', marginRight: 'auto' }}>Simpan / batalkan edit dulu</span>}
              <button type="button" className="bo-btn bo-btn-secondary" onClick={close}>Tutup</button>
              <button
                type="button" className="bo-btn bo-btn-primary"
                onClick={handlePost}
                disabled={postable.length === 0 || !!editingId}
                style={{ minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: postable.length === 0 || editingId ? 0.5 : 1 }}
              >
                <CheckCircle size={16} /> Konfirmasi &amp; Posting{postable.length > 1 ? ` (${postable.length})` : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DraftReviewDrawer;
