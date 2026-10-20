import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useInventoryStore } from '../store/useInventoryStore';
import VariantEditor, { sumVariantQty, findDuplicateVariant } from './VariantEditor';
import { generateInternalBarcode } from '../utils/barcode';
import type { Product, VariantDraft } from '../types';

interface UnregisteredProductModalProps {
  isOpen: boolean;
  initialBarcode: string;
  initialQty?: number;
  appName?: string;
  onClose: () => void;
  onSuccess: (product: Product, cartQty: number) => void;
}

export default function UnregisteredProductModal({
  isOpen,
  initialBarcode,
  initialQty = 1,
  appName = 'POS MART',
  onClose,
  onSuccess,
}: UnregisteredProductModalProps) {
  const { products, categories, addProduct, addCategory } = useInventoryStore();

  // Form State matching Backoffice "Formulir Tambah Stok"
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [stockQty, setStockQty] = useState<number | ''>(10);
  const [cartQty, setCartQty] = useState<number>(1);
  const [unit, setUnit] = useState('Pcs');
  const [minStock, setMinStock] = useState<number | ''>(5);
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [sellingPrice, setSellingPrice] = useState<number | ''>('');
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>('');

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync initial barcode whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const code = (initialBarcode || '').trim();
      setBarcode(code);
      setSku(code || `SKU-${Date.now().toString().slice(-6)}`);
      setName('');
      setCategory(categories[0] || 'Umum');
      setVariants([]);
      setStockQty(10);
      setCartQty(Math.max(1, initialQty || 1));
      setUnit('Pcs');
      setMinStock(5);
      setPurchasePrice('');
      setSellingPrice('');
      setWholesalePrice('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialBarcode, initialQty, categories]);

  if (!isOpen) return null;

  // Margin calculation
  const buyNum = Number(purchasePrice) || 0;
  const sellNum = Number(sellingPrice) || 0;
  const marginAmt = sellNum - buyNum;
  const marginPct = sellNum > 0 ? (marginAmt / sellNum) * 100 : 0;
  const marginColor = marginPct >= 0 ? '#10b981' : '#ef4444';
  const marginBg = marginPct >= 0 ? '#dcfce7' : '#fee2e2';

  const handleAddNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    await addCategory(trimmed);
    setCategory(trimmed);
    setNewCategoryName('');
    setIsCategoryModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Nama produk wajib diisi!');
      return;
    }
    if (!sku.trim()) {
      alert('SKU Internal toko wajib diisi!');
      return;
    }
    if (sellNum <= 0) {
      alert('Harga jual kasir harus lebih dari Rp 0!');
      return;
    }

    const namedVariants = variants.filter((v: VariantDraft) => v.name.trim());
    const hasVariants = namedVariants.length > 0;
    const dupVariant = findDuplicateVariant(namedVariants);
    if (dupVariant) {
      alert(`Nama varian "${dupVariant}" ganda. Setiap varian harus memiliki nama berbeda.`);
      return;
    }

    const finalBarcode = barcode.trim() || generateInternalBarcode(products);
    const finalSku = sku.trim() || finalBarcode;

    // Cek apakah barcode sudah terdaftar di master produk
    const dup = products.find(p => p.id === finalBarcode || p.barcode === finalBarcode);
    if (dup) {
      alert(`Barcode "${finalBarcode}" sudah digunakan oleh produk "${dup.name}".`);
      return;
    }

    const computedTotalStock = hasVariants
      ? sumVariantQty(namedVariants)
      : Math.max(Number(cartQty), Number(stockQty) || 0);

    setIsSubmitting(true);
    try {
      const payload: any = {
        id: finalBarcode,
        barcode: finalBarcode,
        sku: finalSku,
        name: name.trim(),
        category: category || 'Umum',
        unit: unit || 'Pcs',
        location: 'Gudang Utama',
        stock: computedTotalStock,
        minStock: Number(minStock) || 0,
        purchasePrice: buyNum,
        sellingPrice: sellNum,
        wholesalePrice: Number(wholesalePrice) || 0,
        image: '',
        variants: hasVariants
          ? namedVariants.map((v: VariantDraft) => ({
              id: v.id,
              name: v.name.trim(),
              stock: Number(v.qty) || 0,
              purchasePrice: buyNum,
              sellingPrice: Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : sellNum,
              wholesalePrice: Number(v.wholesalePrice) > 0 ? Number(v.wholesalePrice) : (Number(wholesalePrice) || 0),
            }))
          : []
      };

      const created = await addProduct(payload);

      // Callback sukses ke Kasir POS
      onSuccess(created, cartQty);
      onClose();
    } catch (err: any) {
      alert(`Gagal menyimpan produk baru: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-end',
        zIndex: 10000,
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#f8fafc',
          width: '100%',
          maxWidth: '540px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 35px rgba(0,0,0,0.25)',
          position: 'relative',
          overflow: 'hidden',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* TOP HEADER */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '16px 20px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          flexShrink: 0
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              <span style={{ color: 'var(--primary, #dc2626)' }}>{appName}</span> &bull; INVENTARIS
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px', letterSpacing: '-0.3px' }}>
              Formulir Tambah Stok
            </div>
            <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ⚡ Barcode baru terdeteksi: <span style={{ fontFamily: 'monospace', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px', color: '#92400e' }}>{initialBarcode || '-'}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !isSubmitting && onClose()}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#f1f5f9',
              border: 'none',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* NOTICE BAR */}
        <div style={{
          background: '#fffbeb',
          borderBottom: '1px solid #fef3c7',
          padding: '8px 20px',
          fontSize: '11.5px',
          color: '#92400e',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0 }} />
          <span>Lengkapi seluruh informasi produk ini agar master stok tidak ada data kosong dan otomatis masuk ke nota belanja saat disimpan.</span>
        </div>

        {/* SCROLLABLE FORM BODY */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* SECTION 1: INFORMASI PRODUK */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>INFORMASI PRODUK</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>* Wajib diisi</span>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* ID Barcode */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  <label>ID Produk / Barcode</label>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500 }}>Ketik atau Pindai</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="899..."
                    style={{
                      flex: 1,
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#0f172a',
                      outline: 'none'
                    }}
                  />
                  {barcode && (
                    <button
                      type="button"
                      onClick={() => setBarcode('')}
                      style={{
                        padding: '6px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      title="Hapus barcode"
                    >
                      <X size={14} color="#64748b" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const gen = generateInternalBarcode(products);
                      setBarcode(gen);
                      if (!sku) setSku(gen);
                    }}
                    style={{
                      padding: '8px 12px',
                      background: '#fee2e2',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#dc2626',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                    title="Generate Barcode Internal Otomatis"
                  >
                    ⚡ Buat
                  </button>
                </div>
              </div>

              {/* Nama Produk */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Nama Produk &amp; Varian <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Contoh: Cue Tip Kamui Original M / Biskuit Roma 300g"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0f172a',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Grid: SKU Internal & Kategori */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '12px 14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    SKU Internal Toko <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="SKU-..."
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#0f172a',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Kategori</label>
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(true)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    >
                      + Baru
                    </button>
                  </div>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#0f172a',
                      outline: 'none'
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: VARIAN (OPSIONAL) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>VARIAN (OPSIONAL)</span>
              <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500 }}>Warna / rasa / ukuran</span>
            </div>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px 14px' }}>
              <VariantEditor
                variants={variants}
                onChange={setVariants}
                qtyLabel="Qty"
                hint="Satu produk, banyak varian dengan harga sama? Cukup ketik nama varian dipisah koma lalu isi qty tiap varian. Harga varian dikosongkan = ikut harga produk di bawah."
              />
            </div>
          </div>

          {/* SECTION 3: MANAJEMEN STOK & SATUAN */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>MANAJEMEN STOK &amp; SATUAN</span>
              <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500 }}>Gudang Utama (POS 01)</span>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Jumlah Masuk (Stok Awal) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Jumlah Masuk (Stok Awal)
                  </label>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {variants.some((v: VariantDraft) => v.name.trim()) ? 'Dihitung otomatis dari seluruh varian' : 'Kuantitas fisik yang diterima'}
                  </div>
                </div>

                {variants.some((v: VariantDraft) => v.name.trim()) ? (
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669' }}>
                    {sumVariantQty(variants)} <span style={{ fontSize: '12px', color: '#64748b' }}>{unit}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '2px', border: '1px solid #cbd5e1' }}>
                    <button
                      type="button"
                      onClick={() => setStockQty(Math.max(1, (Number(stockQty) || 0) - 1))}
                      style={{ width: '30px', height: '30px', border: 'none', background: 'transparent', fontSize: '16px', fontWeight: 800, cursor: 'pointer', color: '#334155' }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={stockQty}
                      onChange={(e) => setStockQty(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      style={{ width: '50px', textAlign: 'center', border: 'none', background: 'transparent', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}
                    />
                    <button
                      type="button"
                      onClick={() => setStockQty((Number(stockQty) || 0) + 1)}
                      style={{ width: '30px', height: '30px', border: 'none', background: 'transparent', fontSize: '16px', fontWeight: 800, cursor: 'pointer', color: '#334155' }}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              {/* Qty Masuk Nota Langsung (Spesifik Kasir) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 800, color: '#dc2626' }}>
                    🛒 Qty Masuk Nota Kasir Sekarang
                  </label>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Jumlah yang langsung ditambahkan ke transaksi pelanggan
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', borderRadius: '8px', padding: '2px', border: '1.5px solid #dc2626' }}>
                  <button
                    type="button"
                    onClick={() => setCartQty(Math.max(1, cartQty - 1))}
                    style={{ width: '30px', height: '30px', border: 'none', background: 'transparent', fontSize: '16px', fontWeight: 800, cursor: 'pointer', color: '#dc2626' }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={cartQty}
                    onChange={(e) => setCartQty(Math.max(1, Number(e.target.value) || 1))}
                    style={{ width: '45px', textAlign: 'center', border: 'none', background: 'transparent', fontSize: '15px', fontWeight: 900, color: '#dc2626' }}
                  />
                  <button
                    type="button"
                    onClick={() => setCartQty(cartQty + 1)}
                    style={{ width: '30px', height: '30px', border: 'none', background: 'transparent', fontSize: '16px', fontWeight: 800, cursor: 'pointer', color: '#dc2626' }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Satuan Unit */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Satuan Unit
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                  {['Pcs', 'Box', 'Kg', 'Liter'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      style={{
                        padding: '8px 0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: unit === u ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        backgroundColor: unit === u ? '#eff6ff' : '#f8fafc',
                        color: unit === u ? '#1d4ed8' : '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>

                <select
                  value={['Pcs', 'Box', 'Kg', 'Liter'].includes(unit) ? '' : unit}
                  onChange={(e) => { if (e.target.value) setUnit(e.target.value); }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    color: '#334155',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="">Pilih satuan lain...</option>
                  <option value="Gram">Gram</option>
                  <option value="Pack">Pack</option>
                  <option value="Lusin">Lusin</option>
                  <option value="Dus">Dus</option>
                  <option value="Btl">Btl (Botol)</option>
                  <option value="Bks">Bks (Bungkus)</option>
                  <option value="Kaleng">Kaleng</option>
                </select>
              </div>

              {/* Peringatan Stok Tipis (Min) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Peringatan Stok Tipis (Min) <AlertTriangle size={14} color="#f59e0b" />
                  </label>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    Peringatan saat stok di bawah nilai ini
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  style={{
                    width: '65px',
                    textAlign: 'center',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    fontWeight: 800,
                    color: '#0f172a'
                  }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: STRUKTUR HARGA (IDR) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>STRUKTUR HARGA (IDR)</span>
              <span style={{
                backgroundColor: marginBg,
                color: marginColor,
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                Margin: {marginPct > 0 ? '+' : ''}{marginPct.toFixed(1)}%
              </span>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Harga Modal (Beli) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                    Harga Modal (Beli / HPP)
                  </label>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>Biaya pokok per item</div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '10px', fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>Rp</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    style={{
                      width: '140px',
                      padding: '8px 10px 8px 30px',
                      textAlign: 'right',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#0f172a',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Harga Jual (Kasir) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f1f5f9', background: '#fff1f2' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 800, color: '#dc2626' }}>
                    Harga Jual (Kasir / Normal) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ fontSize: '11.5px', color: '#991b1b' }}>Harga eceran reguler nota</div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '10px', fontSize: '12px', fontWeight: 800, color: '#dc2626' }}>Rp</span>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="0"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    style={{
                      width: '140px',
                      padding: '8px 10px 8px 30px',
                      textAlign: 'right',
                      borderRadius: '8px',
                      border: '2px solid #fca5a5',
                      backgroundColor: '#ffffff',
                      fontSize: '15px',
                      fontWeight: 900,
                      color: '#dc2626',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Harga Grosir (Opsional) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                    Harga Grosir (Partai)
                  </label>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>Opsional untuk pelanggan grosir</div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '10px', fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>Rp</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    style={{
                      width: '140px',
                      padding: '8px 10px 8px 30px',
                      textAlign: 'right',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#0f172a',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* FIXED FOOTER */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid #e2e8f0',
          padding: '14px 20px',
          display: 'flex',
          gap: '12px',
          zIndex: 10
        }}>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            style={{
              flex: '0 0 100px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f1f5f9',
              fontSize: '14px',
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: 'var(--primary, #dc2626)',
              fontSize: '14px',
              fontWeight: 800,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
            }}
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>+ Tambahkan ke Daftar &amp; Masuk Nota</span>
              </>
            )}
          </button>
        </div>

        {/* MODAL TAMBAH KATEGORI BARU (INLINE) */}
        {isCategoryModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10010,
              padding: '16px'
            }}
            onClick={() => setIsCategoryModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                padding: '20px',
                width: '100%',
                maxWidth: '380px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)'
              }}
            >
              <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                Tambah Kategori Baru
              </h4>
              <input
                type="text"
                autoFocus
                placeholder="Misal: Aksesoris, Makanan, dsb"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNewCategory(e);
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  outline: 'none',
                  marginBottom: '16px'
                }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAddNewCategory}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--primary, #dc2626)',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  Simpan Kategori
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
