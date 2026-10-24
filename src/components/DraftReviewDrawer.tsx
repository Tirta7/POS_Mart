import React, { useState } from 'react';
import { 
  CheckCircle, X, Package, Trash2, Edit2, Save, Camera, ArrowLeft 
} from 'lucide-react';
import VariantEditor, { sumVariantQty, findDuplicateVariant } from './VariantEditor';
import type { VariantDraft } from '../types';
import { compressImageFile } from '../utils/defaultProductImage';
import { generateAutoSKU } from '../utils/barcode';

export interface ReviewVariant {
  id: string;
  name: string;
  barcode?: string;
  sku?: string;
  image?: string;
  qty: number;
  sellingPrice?: number;
  wholesalePrice?: number;
}

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
  minWholesaleQty?: number;
  image?: string;
  pending?: boolean;
  grNumber?: string;
  variants?: ReviewVariant[];

  // 3-Tier Packaging & Pricing
  boxBarcode?: string;
  boxCapacity?: number;
  boxPrice?: number;
  midUnitName?: string;
  midBarcode?: string;
  midCapacity?: number;
  midPrice?: number;
  retailBarcode?: string;
}

interface Props {
  items: ReviewItem[];
  mode: 'single' | 'multi';
  categories: string[];
  onClose: () => void;
  onOpenDraftList?: () => void;
  onRemoveItem: (id: string) => void;
  /** Simpan perubahan satu item draf (ID/barcode tidak bisa diubah) */
  onSaveItem: (item: ReviewItem) => void;
  /** Mengembalikan nomor referensi GR hasil posting (bisa async) */
  onPost: (items: ReviewItem[]) => Promise<string> | string;
}

const idr = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const UNITS = ['Pcs', 'Bungkus', 'Renceng', 'Renteng', 'Sachet', 'Batang', 'Pack', 'Box', 'Pouch', 'Botol', 'Kaleng', 'Cup', 'Lusin', 'Slop', 'Sak', 'Butir', 'Kg', 'Gram', 'Liter', 'Dus'];
const PRESET_MID_UNITS = ['Sak', 'Karung', 'Bal', 'Slop', 'Pack', 'Lusin', 'Renceng', 'Karton', 'Ikat'];

const DraftReviewDrawer: React.FC<Props> = ({ 
  items, 
  mode, 
  categories, 
  onClose, 
  onOpenDraftList,
  onRemoveItem, 
  onSaveItem, 
  onPost 
}) => {
  const [closing, setClosing] = useState(false);
  const [posted, setPosted] = useState<{ ref: string; count: number; value: number } | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 250);
  };

  const startEdit = (item: ReviewItem) => {
    setEditingId(item.id);
    const boxCap = item.boxCapacity && item.boxCapacity > 0 ? item.boxCapacity : 1;
    const boxP = item.boxPrice && Number(item.boxPrice) > 0 ? item.boxPrice : (item.wholesalePrice || (item.sellingPrice * boxCap));
    const isMidActive = Boolean(
      (item.midPrice && Number(item.midPrice) > 0 && item.midCapacity && Number(item.midCapacity) > 1) ||
      (item.midUnitName && item.midCapacity && Number(item.midCapacity) > 1 && (Number(item.midPrice) > 0 || item.midBarcode))
    );
    const fallbackMidUnit = item.unit?.toLowerCase() === 'kg' || item.category?.toUpperCase()?.includes('BERAS')
      ? 'Sak'
      : (item.category?.toUpperCase()?.includes('ROKOK') ? 'Slop' : 'Pack');

    setForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit || 'Pcs',
      qty: item.qty,
      minStock: item.minStock ?? 0,
      purchasePrice: item.purchasePrice,
      sellingPrice: item.sellingPrice,
      
      // Kemasan Dus / Karton
      boxBarcode: item.boxBarcode || '',
      boxCapacity: boxCap,
      boxPrice: boxP,
      
      // Kemasan Menengah
      hasMidTier: isMidActive,
      midUnitName: item.midUnitName || fallbackMidUnit,
      midBarcode: item.midBarcode || '',
      midCapacity: item.midCapacity && Number(item.midCapacity) > 0 ? item.midCapacity : (item.unit?.toLowerCase() === 'kg' ? 5 : 10),
      midPrice: item.midPrice || '',

      // Eceran
      retailBarcode: item.retailBarcode || '',
      image: item.image || '',
      variants: (item.variants || []).map(v => ({
        id: v.id,
        name: v.name,
        barcode: v.barcode || '',
        sku: v.sku || '',
        image: v.image || '',
        qty: v.qty,
        sellingPrice: v.sellingPrice || '',
        wholesalePrice: v.wholesalePrice || '',
      })) as VariantDraft[],
    });
  };

  const setF = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));
  const setNum = (key: string, v: string) => setF(key, v === '' ? '' : Number(v));

  const saveEdit = (item: ReviewItem) => {
    const named: VariantDraft[] = ((form.variants || []) as VariantDraft[]).filter(v => v.name.trim());
    const hasVariants = named.length > 0;
    const qty = hasVariants ? sumVariantQty(named) : Number(form.qty);
    const finalSku = String(form.sku || '').trim() || generateAutoSKU(form.name, item.barcode || item.id);
    if (!String(form.name).trim() || qty <= 0 || Number(form.sellingPrice) <= 0) {
      alert('Nama, Qty (> 0) dan Harga Jual (> 0) wajib diisi.');
      return;
    }
    const dup = findDuplicateVariant(named);
    if (dup) {
      alert(`Nama varian "${dup}" ganda.`);
      return;
    }

    const finalBoxCap = Math.max(1, Number(form.boxCapacity) || 1);
    const finalBoxPrice = Number(form.boxPrice) > 0 ? Number(form.boxPrice) : (Number(form.sellingPrice) * finalBoxCap);
    const finalMidCap = form.hasMidTier ? Math.max(1, Number(form.midCapacity) || 1) : 0;
    const finalMidPrice = form.hasMidTier ? (Number(form.midPrice) || 0) : 0;
    const finalMidUnit = form.hasMidTier && form.midUnitName?.trim() ? form.midUnitName.trim() : undefined;
    const finalMidBarcode = form.hasMidTier && form.midBarcode?.trim() ? form.midBarcode.trim() : undefined;

    onSaveItem({
      ...item,
      name: String(form.name).trim(),
      sku: finalSku,
      category: form.category,
      unit: form.unit,
      qty,
      minStock: Number(form.minStock || 0),
      purchasePrice: Number(form.purchasePrice || 0),
      sellingPrice: Number(form.sellingPrice),
      wholesalePrice: finalBoxPrice,
      minWholesaleQty: finalBoxCap,
      boxBarcode: form.boxBarcode?.trim() || undefined,
      boxCapacity: finalBoxCap,
      boxPrice: finalBoxPrice,
      midUnitName: finalMidUnit,
      midBarcode: finalMidBarcode,
      midCapacity: finalMidCap,
      midPrice: finalMidPrice,
      retailBarcode: form.retailBarcode?.trim() || undefined,
      image: form.image,
      variants: hasVariants
        ? named.map((v, idx) => ({
            id: v.id,
            name: v.name.trim(),
            barcode: v.barcode ? v.barcode.trim() : (item.barcode ? `${item.barcode}-${idx + 1}` : undefined),
            sku: v.sku ? v.sku.trim() : undefined,
            image: v.image ? v.image.trim() : undefined,
            qty: Number(v.qty) || 0,
            sellingPrice: Number(v.sellingPrice) || 0,
            wholesalePrice: Number(v.wholesalePrice) || 0,
            minWholesaleQty: Number((v as any).minWholesaleQty) || 0,
          }))
        : undefined,
    });
    setEditingId(null);
  };

  const postable = items.filter(i => i.pending);
  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
  const totalValue = items.reduce((s, i) => s + Number(i.purchasePrice) * Number(i.qty), 0);

  const handlePost = async () => {
    if (isPosting || postable.length === 0 || editingId) return;
    setIsPosting(true);
    setPostError(null);
    try {
      const value = postable.reduce((s, i) => s + Number(i.purchasePrice) * Number(i.qty), 0);
      const ref = await onPost(postable);
      setPosted({ ref, count: postable.length, value });
    } catch (err: any) {
      console.error('Error posting draft items:', err);
      setPostError(err?.message || 'Gagal memposting item draf ke stok. Silakan periksa data produk atau coba lagi.');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', justifyContent: 'flex-end', zIndex: 10002,
      animation: `${closing ? 'fadeOut' : 'fadeIn'} 0.25s ease forwards`
    }}>
      <div style={{
        backgroundColor: '#f8fafc', width: '100%', maxWidth: '580px', height: '100%',
        boxShadow: '-16px 0 45px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
        animation: `${closing ? 'slideOutRight' : 'slideInRight'} 0.3s cubic-bezier(0.22,1,0.36,1) forwards`
      }}>
        {/* Header */}
        <div style={{
          background: '#ffffff',
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0', flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {mode === 'multi' && onOpenDraftList && (
              <button
                type="button"
                onClick={() => { close(); onOpenDraftList(); }}
                title="Kembali ke Daftar Draf"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: '#f1f5f9', border: '1px solid #e2e8f0',
                  color: '#475569', fontSize: '11.5px', fontWeight: 700,
                  padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <ArrowLeft size={14} /> Draf
              </button>
            )}
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fee2e2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Package size={18} color="#dc2626" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '15px' }}>
                  {mode === 'single' ? 'Detail Item Draf' : 'Review Penerimaan (GR)'}
                </span>
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #dbeafe', padding: '1px 7px', borderRadius: '999px' }}>
                  {items.length} Item
                </span>
              </div>
              <div style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {mode === 'single' ? (items[0]?.grNumber ? `Dokumen: ${items[0].grNumber}` : 'Draf belum masuk stok / POS') : 'Periksa kemasan & harga sebelum posting ke stok toko'}
              </div>
            </div>
          </div>
          <button
            type="button" onClick={close}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', flexShrink: 0 }}
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
            <div style={{ fontSize: '13px', color: '#065f46', marginBottom: '24px' }}>Stok fisik bertambah dan produk aktif di Kasir POS.</div>
            <button className="bo-btn bo-btn-primary" onClick={close}>Selesai</button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {mode === 'multi' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { label: 'Total Produk', value: items.length + ' item', color: '#0f172a', bg: '#ffffff', border: '#e2e8f0' },
                    { label: 'Total Fisik', value: totalQty.toLocaleString('id-ID') + ' unit', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
                    { label: 'Nilai Modal GR', value: idr(totalValue), color: '#b91c1c', bg: '#fff1f2', border: '#fecdd3' },
                  ].map(c => (
                    <div key={c.label} style={{ padding: '8px 10px', backgroundColor: c.bg, border: `1px solid ${c.border}`, borderRadius: '10px' }}>
                      <div style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{c.label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: c.color, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {items.map(item => {
                const profit = item.sellingPrice - item.purchasePrice;
                const margin = item.sellingPrice > 0 ? (profit / item.sellingPrice) * 100 : 0;
                const marginColor = margin < 0 ? '#ef4444' : margin < 15 ? '#f59e0b' : '#10b981';
                const isEditing = editingId === item.id;

                const boxCap = Number(item.boxCapacity) || 1;
                const boxPriceVal = Number(item.boxPrice) > 0 ? Number(item.boxPrice) : (boxCap > 1 ? Number(item.sellingPrice) * boxCap : 0);
                const midCap = Number(item.midCapacity) || 0;
                const midUnit = (item.midUnitName || '').trim();
                const midPriceVal = Number(item.midPrice) || 0;
                const hasMid = Boolean(midCap > 1 && midUnit && (midPriceVal > 0 || item.midBarcode));

                const dusBarcode = item.boxBarcode || item.barcode || item.id;
                const retailBarcode = item.retailBarcode || '';
                const midBarcode = item.midBarcode || '';

                return (
                  <div 
                    key={item.id} 
                    style={{ 
                      background: 'white', 
                      border: isEditing ? '1.5px solid #da291c' : '1px solid #e2e8f0', 
                      borderRadius: '12px', 
                      padding: '14px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '10px',
                      boxShadow: isEditing ? '0 8px 24px rgba(218,41,28,0.08)' : '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Header Item: Foto + Judul + Barcode + Badges + Aksi */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '10px', overflow: 'hidden', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.image ? (
                          <img
                            src={item.image} alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Package size={22} color="#94a3b8" />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a', lineHeight: 1.3 }}>{item.name}</div>
                        
                        {/* Barcode & SKU Row */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>SKU: {item.sku || '-'}</span>
                          {dusBarcode && (
                            <span style={{ fontFamily: 'monospace', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '0 4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700 }}>
                              [DUS] {dusBarcode}
                            </span>
                          )}
                          {retailBarcode && retailBarcode !== dusBarcode && (
                            <span style={{ fontFamily: 'monospace', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '0 4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 600 }}>
                              [ECER] {retailBarcode}
                            </span>
                          )}
                          {hasMid && midBarcode && (
                            <span style={{ fontFamily: 'monospace', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', padding: '0 4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700 }}>
                              [{midUnit.toUpperCase()}] {midBarcode}
                            </span>
                          )}
                        </div>

                        {/* Specification & Category Badges */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '5px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                            {item.category}
                          </span>
                          {boxCap > 1 && (
                            <span style={{ fontSize: '10px', fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: '4px' }}>
                              📦 1 Dus = {boxCap} {item.unit}
                            </span>
                          )}
                          {hasMid && (
                            <span style={{ fontSize: '10px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 5px', borderRadius: '4px' }}>
                              🗂️ 1 {midUnit} = {midCap} {item.unit}
                            </span>
                          )}
                          {!item.pending && (
                            <span style={{ fontSize: '10px', fontWeight: 700, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '1px 5px', borderRadius: '4px' }}>
                              Sudah masuk stok
                            </span>
                          )}
                        </div>

                        {/* Varian jika ada */}
                        {item.variants && item.variants.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                            {item.variants.map((v, vIdx) => {
                              const vCode = v.barcode || (item.barcode ? `${item.barcode}-${vIdx + 1}` : '');
                              return (
                                <span key={v.id || vIdx} style={{ fontSize: '10px', fontWeight: 700, background: '#ede9fe', color: '#5b21b6', padding: '1px 6px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span>{v.name}: {v.qty}</span>
                                  {vCode && (
                                    <span style={{ fontFamily: 'monospace', fontSize: '9px', background: '#fff', color: '#4338ca', padding: '0 3px', borderRadius: '3px', border: '1px solid #c4b5fd' }}>
                                      {vCode}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Aksi Baris */}
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {item.pending && !isEditing && (
                          <button 
                            type="button" 
                            title="Edit Data Item" 
                            onClick={() => startEdit(item)} 
                            style={{ 
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', 
                              padding: '5px 10px', borderRadius: '7px', fontSize: '11.5px', fontWeight: 700,
                              cursor: 'pointer' 
                            }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                        )}
                        {mode === 'multi' && (
                          <button 
                            type="button" 
                            title="Keluarkan dari daftar review" 
                            onClick={() => onRemoveItem(item.id)} 
                            style={{ 
                              background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', 
                              padding: '5px 8px', borderRadius: '7px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' 
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      /* ===== FORM EDIT INLINE TERSTRUKTUR & RAPI ===== */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '10px', borderTop: '1px dashed #fca5a5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#da291c' }}>
                          <Edit2 size={14} /> Edit Item Penerimaan &amp; Struktur Kemasan
                        </div>

                        {/* 1. Nama & Kategori */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Nama Produk</label>
                          <input 
                            className="bo-input" 
                            style={{ background: '#ffffff', height: '34px', fontSize: '13px', fontWeight: 600 }} 
                            value={form.name} 
                            onChange={e => setF('name', e.target.value)} 
                            required
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>SKU</label>
                              <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>{String(form.sku || '').trim() ? 'Kustom' : 'Otomatis'}</span>
                            </div>
                            <input
                              className="bo-input"
                              style={{ background: '#ffffff', height: '34px', fontSize: '12px' }}
                              value={form.sku}
                              onChange={e => setF('sku', e.target.value)}
                              placeholder={form.name ? generateAutoSKU(form.name, item.barcode || item.id) : 'Otomatis'}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Kategori</label>
                            <select 
                              className="bo-input" 
                              style={{ background: '#ffffff', height: '34px', fontSize: '12px' }} 
                              value={form.category} 
                              onChange={e => setF('category', e.target.value)}
                            >
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                              {!categories.includes(form.category) && <option value={form.category}>{form.category}</option>}
                            </select>
                          </div>
                        </div>

                        {/* 2. Kuantitas Fisik & Satuan Eceran */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                            📦 STOK FISIK PENERIMAAN (GR)
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Qty Diterima</label>
                              {((form.variants || []) as VariantDraft[]).some(v => v.name.trim()) ? (
                                <div className="bo-input" style={{ height: '34px', display: 'flex', alignItems: 'center', fontWeight: 800, color: '#065f46', background: '#ecfdf5' }}>
                                  {sumVariantQty(form.variants || [])}
                                </div>
                              ) : (
                                <input 
                                  type="number" 
                                  min="0" 
                                  step="any" 
                                  className="bo-input" 
                                  style={{ background: '#ffffff', height: '34px', fontSize: '13px', fontWeight: 800, textAlign: 'center' }} 
                                  value={form.qty} 
                                  onChange={e => setNum('qty', e.target.value)} 
                                />
                              )}
                            </div>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Satuan Eceran</label>
                              <select 
                                className="bo-input" 
                                style={{ background: '#ffffff', height: '34px', fontSize: '12px' }} 
                                value={form.unit} 
                                onChange={e => setF('unit', e.target.value)}
                              >
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                {!UNITS.includes(form.unit) && <option value={form.unit}>{form.unit}</option>}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Alert Min Stok</label>
                              <input 
                                type="number" 
                                min="0" 
                                className="bo-input" 
                                style={{ background: '#ffffff', height: '34px', fontSize: '12px', textAlign: 'center' }} 
                                value={form.minStock} 
                                onChange={e => setNum('minStock', e.target.value)} 
                              />
                            </div>
                          </div>
                        </div>

                        {/* 3. Kemasan Dus / Karton */}
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#92400e', marginBottom: '8px' }}>
                            📦 KEMASAN DUS / KARTON (GROSIR BESAR)
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: 700, color: '#92400e' }}>Isi 1 Dus ({form.unit})</label>
                              <input 
                                type="number" 
                                min="1" 
                                className="bo-input" 
                                style={{ background: '#ffffff', height: '34px', fontSize: '12px', fontWeight: 700, textAlign: 'center' }} 
                                value={form.boxCapacity} 
                                onChange={e => setNum('boxCapacity', e.target.value)} 
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: 700, color: '#92400e' }}>Harga Jual 1 Dus (Rp)</label>
                              <input 
                                type="number" 
                                min="0" 
                                className="bo-input" 
                                style={{ background: '#ffffff', height: '34px', fontSize: '12px', fontWeight: 800, color: '#92400e' }} 
                                value={form.boxPrice} 
                                onChange={e => setNum('boxPrice', e.target.value)} 
                                placeholder={form.sellingPrice && form.boxCapacity ? String(Number(form.sellingPrice) * Number(form.boxCapacity)) : ''}
                              />
                            </div>
                          </div>
                          <div style={{ marginTop: '6px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#92400e' }}>Barcode Dus (Opsional)</label>
                            <input 
                              type="text" 
                              className="bo-input" 
                              style={{ background: '#ffffff', height: '32px', fontSize: '11.5px', fontFamily: 'monospace' }} 
                              value={form.boxBarcode} 
                              onChange={e => setF('boxBarcode', e.target.value)} 
                              placeholder="Barcode di kardus luar..."
                            />
                          </div>
                        </div>

                        {/* 4. Kemasan Menengah (Sak, Slop, Pack, Lusin, Renceng) */}
                        <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#5b21b6' }}>
                              🗂️ KEMASAN MENENGAH (SAK / SLOP / PACK / RENCENG)
                            </span>
                            <label style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              fontSize: '11px', fontWeight: 700,
                              color: form.hasMidTier ? '#6d28d9' : '#64748b',
                              background: form.hasMidTier ? '#ede9fe' : '#f1f5f9',
                              border: `1px solid ${form.hasMidTier ? '#c4b5fd' : '#cbd5e1'}`,
                              padding: '2px 8px', borderRadius: '999px', cursor: 'pointer'
                            }}>
                              <input 
                                type="checkbox" 
                                checked={form.hasMidTier} 
                                onChange={e => {
                                  const checked = e.target.checked;
                                  setF('hasMidTier', checked);
                                  if (checked && !form.midUnitName) {
                                    setF('midUnitName', form.unit?.toLowerCase() === 'kg' ? 'Sak' : 'Pack');
                                    setF('midCapacity', form.unit?.toLowerCase() === 'kg' ? 5 : 10);
                                  }
                                }}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span>{form.hasMidTier ? 'Aktif' : 'Nonaktif'}</span>
                            </label>
                          </div>

                          {form.hasMidTier && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#5b21b6' }}>Nama Satuan</label>
                                  <select 
                                    className="bo-input" 
                                    style={{ background: '#ffffff', height: '34px', fontSize: '12px' }}
                                    value={PRESET_MID_UNITS.includes(form.midUnitName) ? form.midUnitName : 'Lainnya'}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (val === 'Lainnya') {
                                        setF('midUnitName', '');
                                      } else {
                                        setF('midUnitName', val);
                                      }
                                    }}
                                  >
                                    <option value="Sak">Sak (Beras / Pakan)</option>
                                    <option value="Karung">Karung (25-50 Kg)</option>
                                    <option value="Bal">Bal (Gula/Garam)</option>
                                    <option value="Slop">Slop (10 Bungkus Rokok)</option>
                                    <option value="Pack">Pack</option>
                                    <option value="Lusin">Lusin (12 Pcs)</option>
                                    <option value="Renceng">Renceng (10-12 Sachet)</option>
                                    <option value="Karton">Karton Kecil</option>
                                    <option value="Ikat">Ikat</option>
                                    <option value="Lainnya">Lainnya (Ketik Manual)...</option>
                                  </select>
                                  {!PRESET_MID_UNITS.includes(form.midUnitName) && (
                                    <input 
                                      type="text" 
                                      className="bo-input" 
                                      style={{ background: '#ffffff', height: '30px', fontSize: '11.5px', marginTop: '4px' }} 
                                      placeholder="Nama satuan menengah..." 
                                      value={form.midUnitName} 
                                      onChange={e => setF('midUnitName', e.target.value)} 
                                      autoFocus
                                    />
                                  )}
                                </div>
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#5b21b6' }}>Isi per {form.midUnitName || 'Kemasan'}</label>
                                  <input 
                                    type="number" 
                                    min="1" 
                                    className="bo-input" 
                                    style={{ background: '#ffffff', height: '34px', fontSize: '12px', fontWeight: 800, textAlign: 'center' }} 
                                    value={form.midCapacity} 
                                    onChange={e => setNum('midCapacity', e.target.value)} 
                                  />
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#5b21b6' }}>Harga Jual {form.midUnitName || 'Kemasan'}</label>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    className="bo-input" 
                                    style={{ background: '#ffffff', height: '34px', fontSize: '12px', fontWeight: 800, color: '#1d4ed8' }} 
                                    value={form.midPrice} 
                                    onChange={e => setNum('midPrice', e.target.value)} 
                                    placeholder={form.sellingPrice && form.midCapacity ? String(Number(form.sellingPrice) * Number(form.midCapacity)) : ''}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#5b21b6' }}>Barcode {form.midUnitName || 'Kemasan'} (Opsional)</label>
                                  <input 
                                    type="text" 
                                    className="bo-input" 
                                    style={{ background: '#ffffff', height: '34px', fontSize: '11.5px', fontFamily: 'monospace' }} 
                                    value={form.midBarcode} 
                                    onChange={e => setF('midBarcode', e.target.value)} 
                                    placeholder="Barcode khusus paket..."
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 5. Harga Modal & Jual Eceran */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                            💰 HARGA MODAL &amp; HARGA ECERAN
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>Harga Beli (Modal / {form.unit})</label>
                              <input 
                                type="number" 
                                min="0" 
                                className="bo-input" 
                                style={{ background: '#ffffff', height: '34px', fontSize: '13px', fontWeight: 700 }} 
                                value={form.purchasePrice} 
                                onChange={e => setNum('purchasePrice', e.target.value)} 
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: 800, color: '#da291c' }}>Harga Jual Eceran (per {form.unit})</label>
                              <input 
                                type="number" 
                                min="0" 
                                className="bo-input" 
                                style={{ background: '#fff5f5', borderColor: '#fca5a5', height: '34px', fontSize: '13px', fontWeight: 800, color: '#da291c' }} 
                                value={form.sellingPrice} 
                                onChange={e => setNum('sellingPrice', e.target.value)} 
                                required
                              />
                            </div>
                          </div>
                        </div>

                        {/* 6. Foto & Varian */}
                        <div>
                          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>Tautan Foto Produk (Opsional)</label>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                            {form.image && (
                              <div style={{ position: 'relative', width: '34px', height: '34px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1', background: '#f1f5f9' }}>
                                <img
                                  src={form.image}
                                  alt="Preview"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setF('image', '')}
                                  title="Hapus gambar"
                                  style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.65)', color: 'white', border: 'none', width: '14px', height: '14px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '0 0 0 4px', padding: 0 }}
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                            <input
                              type="text"
                              inputMode="url"
                              className="bo-input"
                              style={{ background: '#ffffff', height: '34px', fontSize: '12px', flex: 1 }}
                              value={form.image}
                              onChange={e => setF('image', e.target.value)}
                              placeholder="https://... atau ambil kamera"
                            />
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              id={`draft-cam-${item.id}`}
                              style={{ display: 'none' }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const compressed = await compressImageFile(file);
                                  setF('image', compressed);
                                } catch (err: any) {
                                  alert(err?.message || 'Gagal memproses foto kamera');
                                } finally {
                                  e.target.value = '';
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => document.getElementById(`draft-cam-${item.id}`)?.click()}
                              className="bo-btn"
                              style={{ backgroundColor: '#2563eb', color: 'white', height: '34px', padding: '0 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                            >
                              <Camera size={13} /> Kamera
                            </button>
                          </div>
                        </div>

                        <VariantEditor
                          variants={(form.variants || []) as VariantDraft[]}
                          onChange={(next) => setF('variants', next)}
                          title="Varian Produk"
                          parentBarcode={item.barcode || item.id}
                        />

                        <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                          ID / Barcode Utama <strong style={{ fontFamily: 'monospace' }}>{item.barcode || item.id}</strong> bersifat permanen.
                        </div>

                        {/* Action buttons form */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                          <button 
                            type="button" 
                            className="bo-btn bo-btn-secondary" 
                            style={{ padding: '6px 14px', fontSize: '12px' }} 
                            onClick={() => setEditingId(null)}
                          >
                            Batal
                          </button>
                          <button 
                            type="button" 
                            className="bo-btn bo-btn-primary" 
                            style={{ padding: '6px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }} 
                            onClick={() => saveEdit(item)}
                          >
                            <Save size={14} /> Simpan Perubahan
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ===== CARD VIEW READ-ONLY DENGAN INFORMASI LENGKAP ===== */
                      <>
                        {/* Grid Statistik Harga & Kuantitas */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px' }}>
                            <div style={{ color: '#64748b', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase' }}>Qty Masuk</div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px', marginTop: '1px' }}>
                              {item.qty.toLocaleString('id-ID')} <span style={{ fontSize: '10.5px', color: '#64748b' }}>{item.unit}</span>
                            </div>
                            {boxCap > 1 && (
                              <div style={{ fontSize: '9.5px', color: '#92400e', fontWeight: 700, marginTop: '1px' }}>
                                {Math.floor(item.qty / boxCap)} Dus {item.qty % boxCap > 0 ? `+ ${item.qty % boxCap}` : ''}
                              </div>
                            )}
                          </div>

                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px' }}>
                            <div style={{ color: '#64748b', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase' }}>Harga Beli</div>
                            <div style={{ fontWeight: 800, color: '#475569', fontSize: '12.5px', marginTop: '1px' }}>
                              {idr(item.purchasePrice)}
                            </div>
                            {boxCap > 1 && (
                              <div style={{ fontSize: '9.5px', color: '#94a3b8', marginTop: '1px' }}>
                                {idr(item.purchasePrice * boxCap)}/Dus
                              </div>
                            )}
                          </div>

                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px' }}>
                            <div style={{ color: '#dc2626', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase' }}>Harga Eceran</div>
                            <div style={{ fontWeight: 800, color: '#dc2626', fontSize: '12.5px', marginTop: '1px' }}>
                              {idr(item.sellingPrice)}
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#94a3b8', marginTop: '1px' }}>
                              per {item.unit}
                            </div>
                          </div>

                          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '6px 8px' }}>
                            <div style={{ color: '#92400e', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase' }}>Harga Dus</div>
                            <div style={{ fontWeight: 800, color: '#92400e', fontSize: '12px', marginTop: '1px' }}>
                              {boxPriceVal > 0 ? idr(boxPriceVal) : '-'}
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#b45309', marginTop: '1px' }}>
                              {boxCap > 1 ? `isi ${boxCap} ${item.unit}` : '1 unit'}
                            </div>
                          </div>

                          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '6px 8px' }}>
                            <div style={{ color: '#0369a1', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                              Harga {hasMid ? midUnit : 'Menengah'}
                            </div>
                            <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '12px', marginTop: '1px' }}>
                              {hasMid && midPriceVal > 0 ? idr(midPriceVal) : '-'}
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#0284c7', marginTop: '1px' }}>
                              {hasMid ? `isi ${midCap} ${item.unit}` : '-'}
                            </div>
                          </div>

                          <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px' }}>
                            <div style={{ color: '#475569', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase' }}>Subtotal Modal</div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px', marginTop: '1px' }}>
                              {idr(item.purchasePrice * item.qty)}
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '1px' }}>
                              nilai stok GR
                            </div>
                          </div>
                        </div>

                        {/* Bar Margin Keuntungan */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Estimasi Margin:</span>
                          <div style={{ flex: 1, height: '5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: Math.min(Math.max((margin / 50) * 100, 0), 100) + '%', height: '100%', background: marginColor }} />
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: marginColor, whiteSpace: 'nowrap' }}>
                            {margin > 0 ? '+' : ''}{margin.toFixed(1)}% <span style={{ fontWeight: 600, color: '#64748b', fontSize: '10px' }}>({idr(profit)}/{item.unit})</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {postError && (
                <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '10px', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', fontWeight: 600 }}>
                  <span>⚠️ {postError}</span>
                </div>
              )}

              {postable.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', padding: '10px 14px', backgroundColor: '#ecfdf5', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
                  <CheckCircle size={16} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ fontSize: '11.5px', color: '#065f46', lineHeight: 1.4 }}>
                    Setelah tombol <strong>Konfirmasi &amp; Posting</strong> ditekan, seluruh item draf di atas akan resmi masuk ke stok fisik dan otomatis siap ditransaksikan di Kasir POS.
                  </span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
              {editingId && (
                <span style={{ fontSize: '11.5px', color: '#b45309', marginRight: 'auto', fontWeight: 600 }}>
                  ⚠️ Simpan / batalkan edit dulu sebelum posting
                </span>
              )}
              <button 
                type="button" 
                className="bo-btn bo-btn-secondary" 
                onClick={close}
                disabled={isPosting}
                style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '8px' }}
              >
                Tutup
              </button>
              <button
                type="button" 
                className="bo-btn bo-btn-primary"
                onClick={handlePost}
                disabled={isPosting || postable.length === 0 || !!editingId}
                style={{ 
                  minWidth: '220px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', 
                  opacity: isPosting || postable.length === 0 || editingId ? 0.5 : 1,
                  padding: '8px 20px', fontSize: '13px', borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(218,41,28,0.25)'
                }}
              >
                <CheckCircle size={16} /> {isPosting ? 'Memproses Posting...' : `Konfirmasi & Posting${postable.length > 1 ? ` (${postable.length})` : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DraftReviewDrawer;
