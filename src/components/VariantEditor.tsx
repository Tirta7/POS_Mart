import React, { useState } from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import type { VariantDraft } from '../types';

/** ID unik untuk varian baru (dibuat di sisi klien agar bisa langsung dipakai mutasi stok) */
export const makeVariantId = (): string => {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

/** Total qty seluruh varian yang bernama */
export const sumVariantQty = (variants: VariantDraft[]) =>
  variants.filter(v => v.name.trim()).reduce((s, v) => s + (Number(v.qty) || 0), 0);

/** Cek nama varian ganda (tidak peka huruf besar/kecil). Mengembalikan nama yang ganda atau null. */
export const findDuplicateVariant = (variants: VariantDraft[]): string | null => {
  const seen = new Set<string>();
  for (const v of variants) {
    const k = v.name.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) return v.name.trim();
    seen.add(k);
  }
  return null;
};

interface Props {
  variants: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
  title?: string;
  /** Label kolom jumlah, mis. "Qty" atau "Tambah" */
  qtyLabel?: string;
  /** Tampilkan kolom harga jual/grosir per varian (opsional, kosong = ikut harga produk) */
  showPrices?: boolean;
  hint?: string;
  parentBarcode?: string;
}

const cellInput: React.CSSProperties = {
  width: '100%', height: '34px', padding: '0 8px', fontSize: '13px', borderRadius: '8px',
  border: '1px solid #e5e7eb', background: '#f9fafb', outline: 'none', boxSizing: 'border-box',
};

export const generateVariantBarcode = (parentBarcode?: string, index: number = 1): string => {
  const p = (parentBarcode || '').trim();
  if (p && p.length >= 6) {
    return `${p}-${index}`;
  }
  const timestamp = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900);
  return `VAR${timestamp}${rand}`;
};

const VariantEditor: React.FC<Props> = ({ variants, onChange, title = 'Varian Produk', qtyLabel = 'Qty', showPrices = true, hint, parentBarcode }) => {
  const [quick, setQuick] = useState('');

  const update = (id: string, patch: Partial<VariantDraft>) =>
    onChange(variants.map(v => (v.id === id ? { ...v, ...patch } : v)));

  const addBlank = () => onChange([...variants, { id: makeVariantId(), name: '', barcode: '', qty: '', sellingPrice: '', wholesalePrice: '' }]);

  // Tambah cepat: "Merah, Hijau, Kuning" -> 3 baris sekaligus
  const addQuick = () => {
    const names = quick.split(/[,\n;]/).map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const existing = new Set(variants.map(v => v.name.trim().toLowerCase()));
    const fresh = names
      .filter((n, i) => !existing.has(n.toLowerCase()) && names.findIndex(x => x.toLowerCase() === n.toLowerCase()) === i)
      .map(n => ({ 
        id: makeVariantId(), 
        name: n, 
        barcode: '',
        qty: '' as number | string, 
        sellingPrice: '' as number | string, 
        wholesalePrice: '' as number | string 
      }));
    onChange([...variants.filter(v => v.name.trim() || v.qty !== ''), ...fresh]);
    setQuick('');
  };

  const total = sumVariantQty(variants);

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '12px', border: '1px solid #ede9fe' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '13px', color: '#5b21b6' }}>
          <Layers size={15} /> {title}
        </div>
        {variants.length > 0 && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: '999px' }}>
            Total {qtyLabel}: {total}
          </span>
        )}
      </div>
      {hint && <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', lineHeight: 1.4 }}>{hint}</div>}

      {/* Tambah cepat banyak varian */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <input
          type="text"
          value={quick}
          onChange={e => setQuick(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuick(); } }}
          placeholder="Ketik varian dipisah koma: Merah, Hijau, Kuning"
          style={{ ...cellInput, flex: 1 }}
        />
        <button type="button" onClick={addQuick} style={{ height: '34px', padding: '0 12px', border: 'none', borderRadius: '8px', background: '#7c3aed', color: 'white', fontWeight: 700, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Tambah
        </button>
      </div>

      {variants.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {variants.map((v, index) => (
            <div key={v.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Row 1: Nama Varian & Qty */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={v.name}
                  onChange={e => update(v.id, { name: e.target.value })}
                  placeholder="Nama varian (cth: Surya 16)"
                  style={{ ...cellInput, flex: 1, fontWeight: 700, background: '#ffffff' }}
                />
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={v.qty}
                  onChange={e => update(v.id, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder={qtyLabel}
                  aria-label={`${qtyLabel} varian ${v.name}`}
                  style={{ ...cellInput, width: '78px', textAlign: 'center', fontWeight: 700, background: '#ffffff' }}
                />
                <button type="button" onClick={() => onChange(variants.filter(x => x.id !== v.id))} title="Hapus varian" style={{ width: '32px', height: '34px', border: '1px solid #fecaca', borderRadius: '8px', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Row 2: Barcode Khusus Varian */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '8px', fontSize: '11px', fontWeight: 800, color: '#7c3aed', letterSpacing: '0.5px' }}>
                    ||||
                  </span>
                  <input
                    type="text"
                    value={v.barcode || ''}
                    onChange={e => update(v.id, { barcode: e.target.value })}
                    placeholder="Scan / ketik Barcode varian ini..."
                    style={{
                      ...cellInput,
                      paddingLeft: '32px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: v.barcode ? '#ffffff' : '#f5f3ff',
                      border: v.barcode ? '1px solid #cbd5e1' : '1px dashed #c4b5fd'
                    }}
                  />
                  {v.barcode && (
                    <button
                      type="button"
                      onClick={() => update(v.id, { barcode: '' })}
                      title="Hapus barcode"
                      style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '11px' }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {!v.barcode && (
                  <button
                    type="button"
                    onClick={() => update(v.id, { barcode: generateVariantBarcode(parentBarcode, index + 1) })}
                    title="Buat barcode otomatis untuk varian ini"
                    style={{
                      height: '34px',
                      padding: '0 8px',
                      border: '1px solid #ddd6fe',
                      borderRadius: '8px',
                      background: '#ede9fe',
                      color: '#6d28d9',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    ⚡ Auto Barcode
                  </button>
                )}
              </div>

              {/* Row 3: Harga Jual & Harga Grosir Khusus Varian */}
              {showPrices && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={v.sellingPrice ?? ''}
                    onChange={e => update(v.id, { sellingPrice: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="Harga jual (ikut induk)"
                    style={{ ...cellInput, fontSize: '12px', background: '#ffffff' }}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={v.wholesalePrice ?? ''}
                    onChange={e => update(v.id, { wholesalePrice: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="Harga grosir (ikut induk)"
                    style={{ ...cellInput, fontSize: '12px', background: '#ffffff' }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={addBlank} style={{ marginTop: '8px', width: '100%', height: '34px', border: '1.5px dashed #c4b5fd', borderRadius: '8px', background: 'transparent', color: '#6d28d9', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
        <Plus size={14} /> Tambah Varian Manual
      </button>
    </div>
  );
};

export default VariantEditor;
