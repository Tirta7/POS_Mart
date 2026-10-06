import React, { useState } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useDraftStore } from '../../store/useDraftStore';

import { Plus, Save, CheckCircle, PackageCheck, Edit2, Trash2, X, ArrowDownToLine, Camera, Search, FileText, AlertTriangle, Printer, LayoutGrid, Package } from 'lucide-react';
import BarcodeScannerCamera from '../../components/BarcodeScannerCamera';
import BarcodeLabelModal from '../../components/BarcodeLabelModal';
import DraftReviewDrawer from '../../components/DraftReviewDrawer';
import { generateInternalBarcode, isInternalBarcode } from '../../utils/barcode';
import { recordStockMutation, makeDocNo } from '../../utils/stockMutation';

const makeGrNumber = () => {
  const d = new Date();
  return `GR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*900)+100)}`;
};

const StockManagement: React.FC = () => {
  const { appName } = useSettingsStore();
  const { products, addProduct, deleteProduct, updateProduct, categories, addCategory, deleteCategory, editCategory } = useInventoryStore();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Sembako');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [qty, setQty] = useState<number | string>('');
  const [unit, setUnit] = useState('Pcs');
  const [purchasePrice, setPurchasePrice] = useState<number | string>('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');
  const [wholesalePrice, setWholesalePrice] = useState<number | string>('');
  const [minStock, setMinStock] = useState<number | string>('');
  const [image, setImage] = useState('');
  const [newCategory, setNewCategory] = useState('');
  
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);

  // Tutup drawer dengan animasi slide keluar ke kanan
  const closeDrawer = () => {
    setDrawerClosing(true);
    setTimeout(() => { resetForm(); setDrawerClosing(false); }, 250);
  };

  // Cetak label barcode (stiker thermal 40x30mm)
  const [labelProduct, setLabelProduct] = useState<any>(null);
  const [labelCopies, setLabelCopies] = useState(1);
  
  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryTarget, setEditingCategoryTarget] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Restock Modal State
  const [restockProduct, setRestockProduct] = useState<any>(null);
  const [restockQty, setRestockQty] = useState<number | string>('');
  const [restockPrice, setRestockPrice] = useState<number | string>('');

  // Tidak lagi menggunakan sessionItems terpisah, semua draf global
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Konfirmasi & Posting
  const [showPostModal, setShowPostModal] = useState(false);
  const [isPosted, setIsPosted] = useState(false);
  const [grNumber, setGrNumber] = useState(makeGrNumber);

  // Draf Tersimpan (disimpan di Database via API)
  const { drafts, saveDrafts } = useDraftStore();
  const [showDraftModal, setShowDraftModal] = useState(false);
  // Pilihan item di daftar draf + drawer review (Lihat 1 item / Lanjutkan beberapa item)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewItems, setReviewItems] = useState<any[] | null>(null);
  const [reviewMode, setReviewMode] = useState<'single' | 'multi'>('single');

  const resetForm = () => {
    setEditingId(null);
    setProductId('');
    setSku('');
    setName('');
    setCategory(categories[0] || 'Sembako');
    setQty('');
    setUnit('Pcs');
    setPurchasePrice('');
    setSellingPrice('');
    setWholesalePrice('');
    setMinStock('');
    setImage('');
    setIsFormOpen(false);
  };

  const handleIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      
      const foundProduct = products.find(p => p.id === productId || p.barcode === productId);
      if (foundProduct) {
        // Otomatis buka modal Restock karena ini kemungkinan barang masuk
        openRestockModal(foundProduct);
        setProductId(''); // Reset input barcode untuk scan selanjutnya
      } else {
        // Not found, treat as new item. Reset editing state but keep the scanned ID.
        setEditingId(null);
        setSku('');
        setName('');
        setQty(1);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku || !name || Number(qty) <= 0 || Number(sellingPrice) <= 0) return;
    
    // Tanpa barcode -> buat barcode internal unik (SKxxxxxx), sama untuk ID & barcode
    const finalId = productId || generateInternalBarcode(products);
    const finalBarcode = finalId;

    if (editingId) {
      // Find original to keep unmodified fields (like id, barcode, etc)
      const original = products.find(p => p.id === editingId);
      if (original) {
        // Cek duplikat: pastikan ID baru tidak bertabrakan dengan produk LAIN (kecuali diri sendiri)
        const isDuplicate = products.some(p => p.id !== editingId && (p.id === finalId || p.barcode === finalBarcode));
        if (isDuplicate) {
          alert(`Peringatan: Barcode/ID ${finalId} sudah digunakan oleh produk lain!`);
          return;
        }

        updateProduct(editingId, {
          ...original,
          id: finalId, // Izinkan update ID/Barcode
          barcode: finalBarcode,
          sku,
          name,
          category,
          unit,
          stock: Number(qty),
          purchasePrice: Number(purchasePrice),
          sellingPrice: Number(sellingPrice),
          wholesalePrice: Number(wholesalePrice),
          minStock: Number(minStock),
          image: image || original.image
        });
        // Mutasi stok: jika qty diubah lewat Edit, catat sebagai penyesuaian (selisih)
        const stockDelta = Number(qty) - original.stock;
        if (stockDelta !== 0) {
          recordStockMutation(
            'ADJUSTMENT',
            makeDocNo('ADJ'),
            [{ productId: finalId, qty: stockDelta, purchasePrice: Number(purchasePrice), name, unit }],
            `Koreksi stok via Edit Master Data (${original.stock} → ${Number(qty)})`
          );
        }
        setEditingId(null); // Keluar dari mode edit setelah berhasil simpan
      }
    } else {
      // Cek duplikat: di stok, di sesi ini, dan di draf lain yang belum diposting
      const pendingItems = [...draftItems];
      const isDuplicate =
        products.some(p => p.id === finalId || p.barcode === finalBarcode) ||
        pendingItems.some(i => i.id === finalId || i.barcode === finalBarcode);
      if (isDuplicate) {
        alert(`Peringatan: Barcode/ID ${finalId} sudah terdaftar (di stok atau di draf)! Tidak boleh ada duplikat.`);
        return;
      }

      // Masuk ke Draf (BELUM masuk stok / Kasir POS sampai di-Posting)
      const newItem = {
        pending: true,
        id: finalId,
        barcode: finalBarcode,
        sku, name, category, unit,
        location: 'Gudang Utama',
        qty: Number(qty),
        purchasePrice: Number(purchasePrice),
        sellingPrice: Number(sellingPrice),
        wholesalePrice: Number(wholesalePrice),
        minStock: Number(minStock),
        image: image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80',
      };
      const nextItems = [...draftItems, newItem];
      
      // Update global draft
      saveDrafts([{ grNumber: 'GLOBAL-DRAFT', savedAt: new Date().toISOString(), draftId: 'DRAFT-GLOBAL', items: nextItems }]);
      
      setDraftToast(`"${name}" ditambahkan ke Draf. Belum tampil di Kasir POS sebelum diposting.`);
      setTimeout(() => setDraftToast(null), 4500);

      // Barang tanpa barcode pabrikan -> langsung tawarkan cetak label stiker
      if (isInternalBarcode(finalId)) {
        setLabelCopies(Math.max(1, Math.ceil(Number(qty))));
        setLabelProduct({ id: finalId, barcode: finalId, sku, name, sellingPrice: Number(sellingPrice) });
      }
    }
    
    resetForm();
  };

  
  // Semua item draf (datar)
  const draftItems: any[] = drafts
    .slice()
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .flatMap(d => (d.items || []).map((it: any) => ({ ...it, grNumber: d.grNumber, draftId: d.draftId, savedAt: d.savedAt })));

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const openReviewSingle = (item: any) => { setReviewMode('single'); setReviewItems([item]); };
  const openReviewSelected = () => {
    setReviewMode('multi');
    setReviewItems(draftItems.filter(i => selectedIds.includes(i.id)));
  };

  // Simpan hasil edit item draf (mis. salah input harga). ID/barcode tidak berubah.
  const handleSaveDraftItem = (updated: any) => {
    const fields = {
      name: updated.name,
      sku: updated.sku,
      category: updated.category,
      unit: updated.unit,
      qty: Number(updated.qty),
      minStock: Number(updated.minStock || 0),
      purchasePrice: Number(updated.purchasePrice || 0),
      sellingPrice: Number(updated.sellingPrice),
      wholesalePrice: Number(updated.wholesalePrice || 0),
      image: updated.image || undefined,
    };
    const next = drafts.map(d => ({
      ...d,
      items: (d.items || []).map((i: any) => i.id === updated.id ? { ...i, ...fields } : i),
    }));
    saveDrafts(next);
    setReviewItems(prev => prev ? prev.map(i => i.id === updated.id ? { ...i, ...fields } : i) : prev);
  };

  // Hapus satu item dari draf (draf yang kosong ikut dihapus)
  const handleRemoveDraftItem = (itemId: string) => {
    if (!window.confirm('Hapus item ini dari draf? Item belum masuk stok dan akan hilang.')) return;
    const next = drafts
      .map(d => ({ ...d, items: (d.items || []).filter((i: any) => i.id !== itemId) }))
      .filter(d => d.items.length > 0);
    saveDrafts(next);
    setSelectedIds(prev => prev.filter(x => x !== itemId));
  };

  // Terapkan item ke stok (stok bertambah / produk baru muncul di Kasir POS)
  const applyItemsToStock = async (items: any[], docNo: string) => {
    const mutationLines: { productId: string; qty: number; purchasePrice: number; name: string; unit: string }[] = [];
    for (const item of items) {
      // Item draf lama (sebelum fitur ini) sudah pernah masuk stok -> jangan ditambah dua kali
      if (!item.pending) continue;
      const live = useInventoryStore.getState().products;
      const existing = live.find(p => p.id === item.id || p.barcode === item.id);
      const qtyIn = Number(item.qty);
      if (existing) {
        mutationLines.push({ productId: existing.id, qty: qtyIn, purchasePrice: Number(item.purchasePrice), name: item.name, unit: item.unit });
        // Produk sudah ada -> tambah stok, HPP Moving Average
        const newTotal = existing.stock + qtyIn;
        const avg = newTotal > 0
          ? Math.round(((existing.stock * existing.purchasePrice) + (qtyIn * Number(item.purchasePrice))) / newTotal)
          : Number(item.purchasePrice);
          
        // Mencegah Race Condition: Jangan update stok di sini! Biarkan Mutasi (recordStockMutation) 
        // yang melakukan INCREMENT secara atomic di sisi database.
        const { stock, ...payload } = { ...existing, purchasePrice: avg };
        await updateProduct(existing.id, payload as any);
      } else {
        const createdProd = await addProduct({
          id: item.id,
          sku: item.sku,
          barcode: item.barcode || item.id,
          name: item.name,
          category: item.category,
          location: item.location || 'Gudang Utama',
          unit: item.unit,
          stock: 0, // Dikosongkan agar penambahan qty di mutasi tidak berlipat (doubled)
          baseUnitMultiplier: 1,
          purchasePrice: Number(item.purchasePrice),
          sellingPrice: Number(item.sellingPrice),
          wholesalePrice: Number(item.wholesalePrice || 0),
          minStock: Number(item.minStock || 0),
          image: item.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80',
        });
        mutationLines.push({ productId: createdProd.id, qty: qtyIn, purchasePrice: Number(item.purchasePrice), name: item.name, unit: item.unit });
      }
    }
    // Mutasi stok: Barang Masuk (IN) per dokumen GR
    recordStockMutation('IN', docNo, mutationLines, 'Penerimaan Barang (GR)');
  };

  const writePostedLog = (ref: string, items: any[]) => {
    const log = {
      grNumber: ref,
      postedAt: new Date().toISOString(),
      items,
      totalItems: items.length,
      totalValue: items.reduce((sum, i) => sum + (Number(i.purchasePrice) * Number(i.qty)), 0),
    };
    const existingLogs: any[] = JSON.parse(localStorage.getItem('grPosted') || '[]');
    existingLogs.push(log);
    localStorage.setItem('grPosted', JSON.stringify(existingLogs));
  };

  // Posting dari drawer (item terpilih saja, bisa dari beberapa draf)
  const handlePostFromDrawer = (items: any[]): string => {
    const ref = makeGrNumber();
    applyItemsToStock(items, ref);
    writePostedLog(ref, items);

    const ids = new Set(items.map(i => i.id));
    const next = drafts
      .map(d => ({ ...d, items: (d.items || []).filter((i: any) => !ids.has(i.id)) }))
      .filter(d => d.items.length > 0);
    saveDrafts(next);
    setSelectedIds(prev => prev.filter(id => !ids.has(id)));
    return ref;
  };

  // Posting seluruh draft
  const handlePosting = async () => {
    if (draftItems.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      await applyItemsToStock(draftItems, grNumber);

      setIsPosted(true);
      writePostedLog(grNumber, draftItems);
      // Kosongkan draft global
      const emptyDraft: any[] = [];
      saveDrafts(emptyDraft);
          } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (p: any) => {
    setEditingId(p.id);
    setProductId(p.id);
    setSku(p.sku);
    setName(p.name);
    setCategory(p.category);
    setQty(p.stock);
    setUnit(p.unit || 'Pcs');
    setPurchasePrice(p.purchasePrice);
    setSellingPrice(p.sellingPrice);
    setWholesalePrice(p.wholesalePrice || 0);
    setMinStock(p.minStock || 0);
    setImage(p.image || '');
    setIsFormOpen(true); // Buka popup
  };

  const formatIDR = (num: number) => {
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  const openRestockModal = (p: any) => {
    setRestockProduct(p);
    setRestockQty('');
    setRestockPrice(p.purchasePrice);
  };

  const handleRestockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct || Number(restockQty) <= 0 || Number(restockPrice) <= 0) return;

    const oldQty = restockProduct.stock;
    const oldPrice = restockProduct.purchasePrice;
    const addedQty = Number(restockQty);
    const newPrice = Number(restockPrice);

    const newTotalQty = oldQty + addedQty;
    // Hitung Harga Pokok Pembelian (HPP) baru dengan Moving Average
    const newAveragePrice = Math.round(((oldQty * oldPrice) + (addedQty * newPrice)) / newTotalQty);

    // Mencegah Race Condition: Jangan update stok di sini! Mutasi IN yang akan
    // menambah stok (increment) di database.
    const payload = {
      ...restockProduct,
      purchasePrice: newAveragePrice,
      // Harga jual tidak diubah otomatis
    };
    delete payload.stock;
    
    updateProduct(restockProduct.id, payload);

    // Mutasi stok: Barang Masuk (IN) dari restock
    recordStockMutation(
      'IN',
      makeDocNo('RST'),
      [{ productId: restockProduct.id, qty: addedQty, purchasePrice: newPrice, name: restockProduct.name, unit: restockProduct.unit }],
      'Restock / Barang Masuk'
    );

    setRestockProduct(null);
  };

  // Jika kategori aktif sudah dihapus/diganti nama, kembali ke 'Semua'
  const currentCategory = activeCategory === 'all' || categories.includes(activeCategory) ? activeCategory : 'all';

  // Combine database products with pending draft items
  const pendingDisplayProducts = draftItems.map(si => ({
    id: si.id,
    sku: si.sku,
    barcode: si.barcode,
    name: si.name,
    category: si.category,
    location: si.location,
    unit: si.unit,
    stock: si.qty,
    purchasePrice: si.purchasePrice,
    sellingPrice: si.sellingPrice,
    wholesalePrice: si.wholesalePrice,
    minStock: si.minStock,
    image: si.image,
    isPending: true
  }));

  const allDisplayProducts = [...pendingDisplayProducts, ...products];

  const filteredProducts = allDisplayProducts.filter(p =>
    (currentCategory === 'all' || p.category === currentCategory) &&
    (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
     p.id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="bo-container r-kiosk">
      
      {/* Header */}
      <div className="bo-page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title">Penerimaan Stok (Goods Receipt)</h1>
          <p className="bo-page-subtitle">Input form cepat untuk penambahan stok masuk.</p>
        </div>
        <div className="bo-header-actions">
          <button className="bo-btn bo-btn-secondary" onClick={() => {  setSelectedIds([]); setShowDraftModal(true); }}>
            <FileText size={16} /> <span className="hide-mobile">Draf Tersimpan</span><span className="show-mobile">Draf</span>
            {draftItems.length > 0 && <span style={{ marginLeft: '4px', background: '#6b7280', color: 'white', borderRadius: '10px', padding: '1px 6px', fontSize: '11px' }}>{draftItems.length}</span>}
          </button>
          <button className="bo-btn bo-btn-primary" onClick={() => { setShowPostModal(true); setIsPosted(false); }} disabled={draftItems.length === 0} style={{ opacity: draftItems.length === 0 ? 0.5 : 1 }}>
            <CheckCircle size={16} /> <span className="hide-mobile">Konfirmasi &amp; Posting</span><span className="show-mobile">Posting</span>
          </button>
        </div>
      </div>

      {/* Toast Simpan Draf */}
      {draftToast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1a1a2e', color: 'white',
          padding: '12px 24px', borderRadius: '999px',
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          zIndex: 99999, animation: 'fadeInUp 0.25s ease',
          fontSize: '14px', fontWeight: 600
        }}>
          <Save size={16} color="#4ade80" />
          {draftToast}
        </div>
      )}

      {/* Tabel sekarang langsung muncul di bawah header - form dipindah ke popup */}
      {/* Data Table */}
      <div className="bo-card r-kiosk-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: 0 }}>
        <div className="bo-card-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 className="bo-card-title" style={{ margin: 0 }}>
              <PackageCheck size={20} style={{ color: 'var(--primary)' }} /> 
              Rincian Barang Diterima
            </h3>
            <span className="bo-badge bo-badge-red" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
              {filteredProducts.length} Item
            </span>
          </div>
          
          <div className="r-wrap-mobile" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div className="r-full-mobile" style={{ position: 'relative', width: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Cari nama, SKU, atau ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bo-input"
                style={{ paddingLeft: '32px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', height: '36px' }}
              />
            </div>
            <button
              className="bo-btn bo-btn-primary"
              onClick={() => { resetForm(); setIsFormOpen(true); }}
              style={{ whiteSpace: 'nowrap', height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> <span className="hide-mobile">Tambah Produk Baru</span><span className="show-mobile">Tambah</span>
            </button>
          </div>
        </div>

        {/* Filter Kategori (dinamis) */}
        <div className="categories-bar" style={{ flexShrink: 0 }}>
          <button
            className={`cat-btn ${currentCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            <LayoutGrid size={16} /> SEMUA (ALL)
            <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>{products.length}</span>
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`cat-btn ${currentCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              <Package size={16} /> {cat.toUpperCase()}
              <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>{products.filter(p => p.category === cat).length}</span>
            </button>
          ))}
        </div>
        <div className="bo-table-container">
          <table className="bo-table r-sheet">
            <thead>
              <tr>
                <th>ID</th>
                <th>SKU</th>
                <th className="r-sheet-name">Nama Produk</th>
                <th>Kategori</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Harga Beli</th>
                <th style={{ textAlign: 'right' }}>Harga Jual</th>
                <th style={{ textAlign: 'right' }}>Harga Grosir</th>
                <th style={{ textAlign: 'center' }}>Profit Margin</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                <tr key={p.id}>
                  <td className="bo-table-sku" style={{ color: '#6b7280' }}>{p.barcode || p.id}</td>
                  <td className="bo-table-sku">{p.sku}</td>
                  <td className="bo-table-bold r-card-title r-sheet-name">
                    {p.name}
                    {p.isPending && <span style={{ marginLeft: '8px', fontSize: '10px', backgroundColor: '#fbbf24', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>DRAF</span>}
                  </td>
                  <td>
                    <span className="bo-badge bo-badge-gray">
                      {p.category}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '800' }}>
                    {p.stock} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>{p.unit || 'Pcs'}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)' }}>{formatIDR(p.purchasePrice)}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--green)' }}>{formatIDR(p.sellingPrice)}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--primary)' }}>{p.wholesalePrice ? formatIDR(p.wholesalePrice) : '-'}</td>
                  <td style={{ textAlign: 'center', minWidth: '120px' }}>
                    {(() => {
                      const profit = p.sellingPrice - p.purchasePrice;
                      const marginPercent = p.sellingPrice > 0 ? (profit / p.sellingPrice) * 100 : 0;
                      let marginColor = '#10b981';
                      if (marginPercent < 0) marginColor = '#ef4444';
                      else if (marginPercent < 15) marginColor = '#f59e0b';
                      const barFill = Math.min(Math.max((marginPercent / 50) * 100, 0), 100) + '%';
                      
                      return (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: marginColor }}>
                            {marginPercent > 0 ? '+' : ''}{marginPercent.toFixed(1)}%
                          </div>
                          <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: barFill, height: '100%', backgroundColor: marginColor }}></div>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {p.isPending ? (
                      <>
                        <button className="bo-action-btn" title="Cetak Label Barcode" onClick={() => { setLabelCopies(Math.max(1, Math.ceil(Number(p.stock)))); setLabelProduct(p); }} style={{ color: '#2563eb' }}><Printer size={16} /></button>
                        <button className="bo-action-btn" title="Batal Tambah (Hapus Draf)" onClick={() => {
                          const nextItems = draftItems.filter(si => si.id !== p.id);
                          const newDraft = [{ grNumber: 'GLOBAL-DRAFT', savedAt: new Date().toISOString(), draftId: 'DRAFT-GLOBAL', items: nextItems }];
                          saveDrafts(newDraft);
                        }} style={{ color: '#ef4444' }}><Trash2 size={16} /></button>
                      </>
                    ) : (
                      <>
                        <button className="bo-action-btn" title="Restock / Barang Masuk" onClick={() => openRestockModal(p)} style={{ color: '#10b981' }}><ArrowDownToLine size={16} /></button>
                        <button className="bo-action-btn" title="Cetak Label Barcode" onClick={() => { setLabelCopies(1); setLabelProduct(p); }} style={{ color: '#2563eb' }}><Printer size={16} /></button>
                        <button className="bo-action-btn" title="Edit Master Data" onClick={() => handleEditClick(p)}><Edit2 size={16} /></button>
                        <button className="bo-action-btn" title="Hapus Produk" onClick={() => deleteProduct(p.id)}><Trash2 size={16} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* Restock Modal */}
      {restockProduct && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}><ArrowDownToLine size={20} color="#10b981" /> Barang Masuk / Restock</h3>
              <button onClick={() => setRestockProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#6b7280" /></button>
            </div>
            
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{restockProduct.name}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Stok Saat Ini: {restockProduct.stock} {restockProduct.unit}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Modal Lama: Rp {restockProduct.purchasePrice.toLocaleString('id-ID')} / {restockProduct.unit}</div>
            </div>

            <form onSubmit={handleRestockSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label className="bo-label">JUMLAH TAMBAHAN (IN)</label>
                <input 
                  type="number" 
                  className="bo-input" 
                  value={restockQty} 
                  onChange={(e) => setRestockQty(e.target.value)} 
                  required 
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label className="bo-label">HARGA BELI BARU (MODAL / PCS)</label>
                <input 
                  type="number" 
                  className="bo-input" 
                  value={restockPrice} 
                  onChange={(e) => setRestockPrice(e.target.value)} 
                  required 
                />
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', lineHeight: 1.4 }}>
                    Sistem menggunakan <strong>Rata-rata Bergerak (Moving Average)</strong>.
                  </div>
                </div>

                {Number(restockQty) > 0 && Number(restockPrice) > 0 && (() => {
                  const oldStock = restockProduct.stock;
                  const oldPrice = restockProduct.purchasePrice;
                  const addedQty = Number(restockQty);
                  const addedPrice = Number(restockPrice);
                  const newTotalQty = oldStock + addedQty;
                  const newAvgPrice = Math.round(((oldStock * oldPrice) + (addedQty * addedPrice)) / newTotalQty);
                  
                  const sellingPrice = restockProduct.sellingPrice;
                  const profit = sellingPrice - newAvgPrice;
                  const marginPercent = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
                  
                  let marginColor = '#10b981'; // Green (Aman)
                  let marginStatus = 'Aman';
                  if (marginPercent < 0) {
                    marginColor = '#ef4444'; // Red (Rugi)
                    marginStatus = 'Rugi / Tidak Untung';
                  } else if (marginPercent < 15) {
                    marginColor = '#f59e0b'; // Yellow (Tipis)
                    marginStatus = 'Margin Tipis';
                  }
                  
                  // Visual bar max at 50% for display purposes (50% margin fills the bar)
                  const barFill = Math.min(Math.max((marginPercent / 50) * 100, 0), 100) + '%';

                  return (
                    <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#1e3a8a', marginBottom: '8px' }}>Preview Kalkulasi Modal Baru:</div>
                      <div style={{ fontSize: '12px', color: '#1e40af', display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Lama: {oldStock} x Rp {oldPrice.toLocaleString('id-ID')}</span>
                          <span>Rp {(oldStock * oldPrice).toLocaleString('id-ID')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Baru: {addedQty} x Rp {addedPrice.toLocaleString('id-ID')}</span>
                          <span>Rp {(addedQty * addedPrice).toLocaleString('id-ID')}</span>
                        </div>
                        <div style={{ height: '1px', background: '#93c5fd', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                          <span>Total: {newTotalQty} Pcs</span>
                          <span>Rp {((oldStock * oldPrice) + (addedQty * addedPrice)).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                      
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #93c5fd', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#1e40af', marginBottom: '2px' }}>HPP / Modal Rata-rata Baru:</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1d4ed8' }}>
                          Rp {newAvgPrice.toLocaleString('id-ID')} / Pcs
                        </div>
                      </div>

                      {/* Margin Progress Bar */}
                      <div style={{ marginTop: '16px', backgroundColor: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                          <span style={{ color: '#374151' }}>Estimasi Profit: <span style={{ color: marginColor }}>{marginStatus}</span></span>
                          <span style={{ color: marginColor }}>{marginPercent > 0 ? '+' : ''}{marginPercent.toFixed(1)}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: barFill, height: '100%', backgroundColor: marginColor, transition: 'width 0.3s ease, background-color 0.3s ease' }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#6b7280' }}>
                          <span>Harga Jual: Rp {sellingPrice.toLocaleString('id-ID')}</span>
                          <span>Untung: Rp {profit.toLocaleString('id-ID')}</span>
                        </div>
                      </div>

                    </div>
                  );
                })()}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="bo-btn" onClick={() => setRestockProduct(null)}>Batal</button>
                <button type="submit" className="bo-btn bo-btn-primary" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}>
                  Simpan Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Kelola Kategori</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#666" /></button>
            </div>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
              <table className="bo-table" style={{ width: '100%' }}>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat}>
                      <td>
                        {editingCategoryTarget === cat ? (
                          <input 
                            type="text" 
                            className="bo-input" 
                            value={editingCategoryName} 
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            autoFocus
                            style={{ padding: '4px 8px', fontSize: '14px' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 'bold' }}>{cat}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', width: '80px' }}>
                        {editingCategoryTarget === cat ? (
                          <button 
                            className="bo-action-btn"
                            onClick={() => {
                              if (editingCategoryName.trim()) {
                                editCategory(cat, editingCategoryName.trim());
                                // Update current category selection if edited category was selected
                                if (category === cat) setCategory(editingCategoryName.trim());
                              }
                              setEditingCategoryTarget('');
                            }}
                          >
                            <Save size={16} color="var(--primary)" />
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button 
                              className="bo-action-btn" 
                              onClick={() => { 
                                setEditingCategoryTarget(cat); 
                                setEditingCategoryName(cat); 
                              }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              className="bo-action-btn" 
                              style={{ color: '#ef4444' }}
                              onClick={() => {
                                if(window.confirm(`Hapus kategori ${cat}?`)) {
                                  deleteCategory(cat);
                                  if (category === cat) setCategory(categories[0] || ''); // Fallback
                                }
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                value={newCategory} 
                onChange={(e) => setNewCategory(e.target.value)} 
                placeholder="Kategori Baru" 
                className="bo-input" 
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                onClick={() => { 
                  if(newCategory.trim()) { 
                    addCategory(newCategory.trim()); 
                    setNewCategory(''); 
                  } 
                }} 
                className="bo-btn bo-btn-primary" 
              >
                <Plus size={16} /> Tambah
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DAFTAR DRAF TERSIMPAN (per item, dengan ceklist) ===== */}
      {showDraftModal && (() => {
        const selectable = draftItems.filter(i => i.pending);
        const allSelected = selectable.length > 0 && selectable.every(i => selectedIds.includes(i.id));
        return (
        <div className="r-modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
          <div className="r-modal" style={{ backgroundColor: 'white', borderRadius: '14px', padding: '22px', width: '680px', maxWidth: '94%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--primary)" /> Draf Tersimpan
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>({draftItems.length} item)</span>
              </h3>
              <button onClick={() => setShowDraftModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="#6b7280" />
              </button>
            </div>

            {/* Bar pilih / aksi */}
            {selectable.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', background: selectedIds.length > 0 ? '#fff1f0' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelectedIds(allSelected ? [] : selectable.map(i => i.id))}
                  />
                  {selectedIds.length > 0 ? `${selectedIds.length} item dipilih` : 'Pilih semua'}
                </label>
                {selectedIds.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="bo-btn bo-btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setSelectedIds([])}>Batal pilih</button>
                    <button className="bo-btn bo-btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={openReviewSelected}>
                      Lanjutkan ({selectedIds.length})
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {draftItems.length === 0 && (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px 0', fontSize: '14px' }}>
                  Belum ada draf. Tambahkan produk lewat "Tambah Produk Baru".
                </div>
              )}
              {draftItems.map(item => {
                const checked = selectedIds.includes(item.id);
                return (
                  <div key={item.draftId + ':' + item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid ' + (checked ? 'var(--primary)' : '#e5e7eb'), borderRadius: '10px', padding: '10px 12px', background: checked ? '#fff7f6' : 'white' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!item.pending}
                      title={item.pending ? 'Pilih item' : 'Item lama: sudah masuk stok'}
                      onChange={() => toggleSelect(item.id)}
                    />
                    <div style={{ width: '44px', height: '44px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.image
                        ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        : <Package size={20} color="#9ca3af" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {item.sku} &bull; {item.qty} {item.unit} &bull; Rp {(Number(item.purchasePrice || 0) * Number(item.qty || 0)).toLocaleString('id-ID')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {item.grNumber}{item.grNumber === grNumber && <span style={{ marginLeft: '6px', color: 'var(--primary)', fontWeight: 700 }}>SESI AKTIF</span>} &bull; {new Date(item.savedAt).toLocaleString('id-ID')}
                        {!item.pending && <span style={{ marginLeft: '6px', color: '#92400e', fontWeight: 700 }}>Sudah masuk stok</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button className="bo-btn bo-btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => openReviewSingle(item)}>
                        Lihat
                      </button>
                      <button className="bo-action-btn" title="Hapus item dari draf" style={{ color: '#ef4444' }} onClick={() => handleRemoveDraftItem(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== DRAWER KANAN: DETAIL / REVIEW ITEM DRAF ===== */}
      {reviewItems && (
        <DraftReviewDrawer
          items={reviewItems}
          mode={reviewMode}
          categories={categories}
          onSaveItem={handleSaveDraftItem}
          onClose={() => setReviewItems(null)}
          onRemoveItem={(id) => {
            const next = reviewItems.filter(i => i.id !== id);
            setSelectedIds(prev => prev.filter(x => x !== id));
            setReviewItems(next.length > 0 ? next : null);
          }}
          onPost={handlePostFromDrawer}
        />
      )}

      {/* CETAK LABEL BARCODE */}
      {labelProduct && (
        <BarcodeLabelModal
          product={labelProduct}
          initialCopies={labelCopies}
          onClose={() => setLabelProduct(null)}
        />
      )}

      {/* CAMERA SCANNER MODAL */}
      {cameraScannerOpen && (
        <BarcodeScannerCamera 
          onScan={(decodedText) => {
            setProductId(decodedText);
            const foundProduct = products.find(p => p.id === decodedText || p.barcode === decodedText);
            if (foundProduct) {
              openRestockModal(foundProduct);
              setProductId('');
              setCameraScannerOpen(false);
              return foundProduct.name;
            } else {
              setEditingId(null);
              setSku('');
              setName('');
              setQty(1);
              setCameraScannerOpen(false);
              return null;
            }
          }} 
          onClose={() => setCameraScannerOpen(false)} 
        />
      )}
      {/* ===== IOS STYLE DRAWER: FORM TAMBAH / EDIT PRODUK ===== */}
      {isFormOpen && (
        <div className="ios-modal-overlay" style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 9998,
          animation: `${drawerClosing ? 'fadeOut' : 'fadeIn'} 0.25s ease forwards`
        }}>
          <div className={`ios-sheet${drawerClosing ? ' is-closing' : ''}`}>
            {/* Grabber */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              <div style={{ width: '40px', height: '5px', backgroundColor: '#d1d5db', borderRadius: '999px' }} />
            </div>
            
            {/* Header */}
            <div className="ios-sheet-header">
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span style={{ color: 'var(--primary)' }}>{appName}</span> &bull; Inventaris
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '2px', letterSpacing: '-0.5px' }}>
                  {editingId ? 'Edit Stok Barang' : 'Formulir Tambah Stok'}
                </div>
              </div>
              <button className="ios-close-btn" onClick={closeDrawer}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="ios-sheet-body">
              {/* SECTION: INFORMASI PRODUK */}
              <div className="ios-section-header">
                <span>INFORMASI PRODUK</span>
                <span className="ios-req">* Wajib diisi</span>
              </div>
              <div className="ios-group">
                <div className="ios-row-vert">
                  <div className="ios-label-row">
                    <label>ID Produk / Barcode</label>
                    <span className="ios-hint">Ketik atau Pindai</span>
                  </div>
                  <div className="ios-input-wrap">
                    <input
                      type="text" value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      onKeyDown={handleIdKeyDown}
                      className="ios-input-gray"
                      placeholder="899..."
                      autoFocus={!(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)}
                    />
                    {productId && (
                      <button type="button" className="ios-inside-btn" onClick={() => setProductId('')}>
                        <X size={14} color="#9ca3af" />
                      </button>
                    )}
                    <button type="button" className="ios-btn-pindai" onClick={() => setCameraScannerOpen(true)}>
                      <Camera size={14} /> Pindai
                    </button>
                    {!editingId && (
                      <button type="button" className="ios-btn-zap" onClick={() => setProductId(generateInternalBarcode(products))}>
                        ⚡
                      </button>
                    )}
                  </div>
                </div>

                <div className="ios-row-vert">
                  <div className="ios-label-row"><label>Nama Produk &amp; Varian</label></div>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="ios-input-gray" required />
                </div>

                <div className="ios-row-split">
                  <div className="ios-col">
                    <div className="ios-label-row"><label>SKU Internal Toko</label></div>
                    <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className="ios-input-gray" required />
                  </div>
                  <div className="ios-col">
                    <div className="ios-label-row">
                      <label>Kategori</label>
                      <button type="button" className="ios-link-red" onClick={() => setIsCategoryModalOpen(true)}>+ Baru</button>
                    </div>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="ios-input-gray" required>
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: MANAJEMEN STOK & SATUAN */}
              <div className="ios-section-header" style={{ marginTop: '20px' }}>
                <span>MANAJEMEN STOK &amp; SATUAN</span>
                <span className="ios-hint-gray">Gudang Utama (POS 01)</span>
              </div>
              <div className="ios-group">
                <div className="ios-row-horiz">
                  <div>
                    <label>Jumlah Masuk (Stok Awal)</label>
                    <div className="ios-sublabel">Kuantitas fisik yang diterima</div>
                  </div>
                  <div className="ios-stepper">
                    <button type="button" onClick={() => setQty(Math.max(0, Number(qty) - 1))}>-</button>
                    <input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))} required />
                    <button type="button" onClick={() => setQty(Number(qty) + 1)}>+</button>
                  </div>
                </div>
                
                <div className="ios-row-vert" style={{ padding: '12px 16px' }}>
                  <label style={{ marginBottom: '8px', display: 'block', fontSize: '13px', fontWeight: 600 }}>Satuan Unit</label>
                  <div className="ios-segmented">
                    {['Pcs', 'Box', 'Pack', 'Lusin'].map(u => (
                      <button type="button" key={u} className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>{u}</button>
                    ))}
                  </div>
                  {/* Cadangan satuan lain jika tidak ada di segment */}
                  {['Pcs', 'Box', 'Pack', 'Lusin'].indexOf(unit) === -1 && (
                    <select value={unit} onChange={(e) => setUnit(e.target.value)} className="ios-input-gray" style={{ marginTop: '8px' }}>
                      <option value="Kg">Kg</option>
                      <option value="Gram">Gram</option>
                      <option value="Liter">Liter</option>
                      <option value="Dus">Dus</option>
                    </select>
                  )}
                </div>

                <div className="ios-row-horiz">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Peringatan Stok Tipis (Min) <AlertTriangle size={14} color="#f59e0b" /></label>
                      <div className="ios-sublabel">Peringatan saat stok di bawah nilai ini</div>
                    </div>
                  </div>
                  <input type="number" inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value === '' ? '' : Number(e.target.value))} className="ios-input-gray ios-input-small" style={{ width: '60px', textAlign: 'center' }} />
                </div>
              </div>

              {/* SECTION: STRUKTUR HARGA */}
              <div className="ios-section-header" style={{ marginTop: '20px' }}>
                <span>STRUKTUR HARGA (IDR)</span>
                {(() => {
                  const m = (Number(sellingPrice) - Number(purchasePrice));
                  const pct = Number(sellingPrice) > 0 ? (m / Number(sellingPrice)) * 100 : 0;
                  const color = pct >= 0 ? '#10b981' : '#ef4444';
                  const bg = pct >= 0 ? '#dcfce7' : '#fee2e2';
                  return (
                    <span style={{ backgroundColor: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                      Margin: {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  );
                })()}
              </div>
              <div className="ios-group">
                <div className="ios-row-horiz">
                  <div>
                    <label>Harga Modal (Beli)</label>
                    <div className="ios-sublabel">Biaya pokok per item</div>
                  </div>
                  <div className="ios-input-prefix">
                    <span>Rp</span>
                    <input type="number" inputMode="numeric" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))} className="ios-input-gray" style={{ textAlign: 'right', width: '100px', fontWeight: 700 }} />
                  </div>
                </div>
                
                <div className="ios-row-horiz">
                  <div>
                    <label style={{ color: 'var(--primary)' }}>Harga Jual (Kasir)</label>
                    <div className="ios-sublabel">Harga eceran reguler</div>
                  </div>
                  <div className="ios-input-prefix is-red">
                    <span>Rp</span>
                    <input type="number" inputMode="numeric" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))} className="ios-input-gray" style={{ textAlign: 'right', width: '100px', color: 'var(--primary)', fontWeight: 700 }} required />
                  </div>
                </div>

                <div className="ios-row-horiz">
                  <div>
                    <label>Harga Grosir</label>
                    <div className="ios-sublabel">Opsional</div>
                  </div>
                  <div className="ios-input-prefix">
                    <span>Rp</span>
                    <input type="number" inputMode="numeric" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))} className="ios-input-gray" style={{ textAlign: 'right', width: '100px', fontWeight: 700 }} />
                  </div>
                </div>
              </div>

              {/* SECTION: GAMBAR PRODUK */}
              <div className="ios-section-header" style={{ marginTop: '20px' }}>
                <span>GAMBAR PRODUK (OPSIONAL)</span>
              </div>
              <div className="ios-group">
                <div className="ios-row-vert">
                  <div className="ios-label-row"><label>Tautan (URL) Gambar</label></div>
                  <input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" value={image} onChange={(e) => setImage(e.target.value)} className="ios-input-gray" placeholder="https://..." />
                </div>
              </div>

              {/* Spacer so we can scroll past keyboard */}
              <div style={{ height: '40px' }} />

              {/* FOOTER ACTIONS */}
              <div className="ios-sheet-footer">
                <button type="button" className="ios-btn-batal" onClick={closeDrawer}>Batal</button>
                <button type="submit" className="ios-btn-simpan">
                  {editingId ? <Save size={18} /> : <Plus size={18} />}
                  {editingId ? 'Simpan Perubahan' : 'Tambahkan ke Daftar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>{`
        /* iOS Bottom Sheet Styles */
        .ios-modal-overlay { padding: max(20px, calc(env(safe-area-inset-top) + 15px)) 0 0 0; }
        .ios-sheet {
          background-color: #f2f2f7; width: 100%; max-width: 480px; height: 100%;
          border-radius: 20px 20px 0 0; display: flex; flex-direction: column;
          box-shadow: 0 -10px 40px rgba(0,0,0,0.15); overflow: hidden; position: relative;
          animation: slideUp 0.35s cubic-bezier(0.32,0.72,0,1) forwards;
        }
        .ios-sheet.is-closing { animation: slideDown 0.25s ease-in forwards; }
        
        .ios-sheet-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 8px 20px 16px; flex-shrink: 0;
        }
        .ios-close-btn {
          width: 32px; height: 32px; border-radius: 50%; background: #e5e7eb;
          border: none; color: #4b5563; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .ios-sheet-body { flex: 1; overflow-y: auto; padding: 0 16px; padding-bottom: 90px; }
        
        .ios-section-header {
          display: flex; justify-content: space-between; align-items: flex-end;
          padding: 0 4px 6px; font-size: 11.5px; font-weight: 700; color: #6b7280; letter-spacing: 0.2px;
        }
        .ios-req { color: var(--primary); }
        .ios-hint-gray { font-weight: 500; }
        
        .ios-group {
          background: #ffffff; border-radius: 12px; overflow: hidden;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .ios-row-vert { padding: 12px 16px; position: relative; border-bottom: 0.5px solid #e5e7eb; }
        .ios-row-vert:last-child { border-bottom: none; }
        .ios-label-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: #374151; }
        .ios-hint { color: #9ca3af; font-weight: 400; font-size: 12px; }
        .ios-input-gray {
          width: 100%; background: #f3f4f6; border: 1px solid transparent; border-radius: 8px;
          padding: 10px 12px; font-size: 15px; color: #111827; outline: none; transition: border 0.2s;
        }
        .ios-input-gray:focus { border-color: #d1d5db; background: #fff; }
        .ios-input-small { padding: 8px; }
        
        .ios-input-wrap { display: flex; gap: 8px; align-items: center; }
        .ios-inside-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
        .ios-btn-pindai {
          display: flex; align-items: center; gap: 6px; background: white; border: 1px solid #d1d5db;
          padding: 0 12px; height: 38px; border-radius: 8px; font-weight: 600; font-size: 13px; color: #374151; cursor: pointer;
        }
        .ios-btn-zap {
          display: flex; align-items: center; justify-content: center; background: #fee2e2; border: none;
          width: 38px; height: 38px; border-radius: 8px; color: var(--primary); font-size: 16px; cursor: pointer;
        }

        .ios-row-split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px 16px; }
        .ios-col { display: flex; flex-direction: column; }
        .ios-link-red { background: none; border: none; color: var(--primary); font-weight: 700; font-size: 12px; cursor: pointer; padding: 0; }

        .ios-row-horiz {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 16px; border-bottom: 0.5px solid #e5e7eb;
        }
        .ios-row-horiz:last-child { border-bottom: none; }
        .ios-row-horiz label { font-size: 14px; font-weight: 600; color: #111827; }
        .ios-sublabel { font-size: 12px; color: #9ca3af; margin-top: 2px; }
        
        .ios-stepper { display: flex; align-items: center; background: #f3f4f6; border-radius: 8px; padding: 2px; border: 1px solid #e5e7eb; }
        .ios-stepper button { width: 32px; height: 32px; border: none; background: transparent; font-size: 18px; font-weight: 600; color: #4b5563; cursor: pointer; }
        .ios-stepper input { width: 44px; text-align: center; border: none; background: transparent; font-size: 16px; font-weight: 800; }
        
        .ios-segmented { display: flex; background: #f3f4f6; border-radius: 8px; padding: 2px; gap: 2px; }
        .ios-segmented button { flex: 1; padding: 8px 0; border: none; background: transparent; border-radius: 6px; font-size: 13px; font-weight: 600; color: #6b7280; transition: all 0.2s; cursor: pointer; }
        .ios-segmented button.active { background: white; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        
        .ios-input-prefix { display: flex; align-items: center; gap: 8px; background: #f3f4f6; padding: 0 12px; border-radius: 8px; }
        .ios-input-prefix span { font-size: 13px; font-weight: 700; color: #9ca3af; }
        .ios-input-prefix .ios-input-gray { background: transparent; padding: 10px 0; border: none; }
        .ios-input-prefix.is-red { background: #fff1f2; }
        .ios-input-prefix.is-red span { color: var(--primary); }
        
        .ios-sheet-footer {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); border-top: 1px solid #e5e7eb;
          padding: 12px 16px 16px; display: flex; gap: 12px;
        }
        .ios-btn-batal { flex: 0 0 100px; padding: 14px; border-radius: 12px; border: none; background: #f3f4f6; font-size: 15px; font-weight: 700; color: #374151; cursor: pointer; }
        .ios-btn-simpan { flex: 1; padding: 14px; border-radius: 12px; border: none; background: var(--primary); font-size: 15px; font-weight: 700; color: white; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }

        @media (min-width: 641px) {
          .ios-modal-overlay { justify-content: flex-end !important; padding: 0 !important; }
          .ios-sheet { border-radius: 0; max-width: 440px; animation: slideInRight 0.3s cubic-bezier(0.22,1,0.36,1) forwards; }
          .ios-sheet.is-closing { animation: slideOutRight 0.3s forwards; }
          .ios-sheet-footer { padding: 16px 20px; }
        }

        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes fadeOut { from { opacity:1 } to { opacity:0 } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes slideOutRight { from { transform: translateX(0); } to { transform: translateX(100%); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes scaleIn { from { opacity:0; transform: scale(0.5); } to { opacity:1; transform: scale(1); } }
      `}</style>

      {/* ===== MODAL: KONFIRMASI & POSTING ===== */}
      {showPostModal && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9997, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '16px',
            width: '96%', maxWidth: '680px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
            overflow: 'hidden', animation: 'slideUp 0.25s cubic-bezier(0.34,1.4,0.64,1)'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1a0505, #2d0a08)',
              padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(218,41,28,0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #da291c, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={18} color="white" />
                </div>
                <div>
                  <div style={{ color: 'white', fontWeight: 800, fontSize: '15px' }}>Konfirmasi Penerimaan Stok</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px' }}>Ref: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{grNumber}</strong></div>
                </div>
              </div>
              {!isPosted && (
                <button onClick={() => setShowPostModal(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.7)' }}>
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {!isPosted ? (
                <>
                  {/* Info bar */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    {[
                      { label: 'Total Item', value: draftItems.length + ' produk', color: '#1e40af', bg: '#eff6ff' },
                      { label: 'Total Qty Masuk', value: draftItems.reduce((s,i) => s + Number(i.qty), 0) + ' unit', color: '#065f46', bg: '#ecfdf5' },
                      { label: 'Total Nilai Beli', value: 'Rp ' + draftItems.reduce((s,i) => s + Number(i.purchasePrice) * Number(i.qty), 0).toLocaleString('id-ID'), color: '#92400e', bg: '#fffbeb' },
                    ].map(card => (
                      <div key={card.label} style={{ flex: 1, padding: '12px 16px', backgroundColor: card.bg, borderRadius: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: card.color }}>{card.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Item list */}
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px', marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          {['Nama Produk', 'Kategori', 'Qty', 'Harga Beli', 'Subtotal'].map(h => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Nama Produk' ? 'left' : 'right', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {draftItems.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.name}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{item.category}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{item.qty} {item.unit}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>Rp {Number(item.purchasePrice).toLocaleString('id-ID')}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>Rp {(Number(item.purchasePrice) * Number(item.qty)).toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Warning */}
                  <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', backgroundColor: '#fef3c7', borderRadius: '8px', marginBottom: '20px', border: '1px solid #fde68a' }}>
                    <AlertTriangle size={16} color="#92400e" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ fontSize: '13px', color: '#92400e' }}>
                      Setelah posting, stok bertambah dan produk baru langsung tampil di Kasir POS. Pastikan semua item sudah sesuai sebelum melanjutkan.
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="bo-btn bo-btn-secondary" onClick={() => setShowPostModal(false)} disabled={isSubmitting}>Batal</button>
                    <button
                      className="bo-btn bo-btn-primary"
                      style={{ minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={handlePosting}
                      disabled={isSubmitting}
                    >
                      <CheckCircle size={16} /> {isSubmitting ? 'Memproses...' : 'Posting Sekarang'}
                    </button>
                  </div>
                </>
              ) : (
                /* SUCCESS SCREEN */
                <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(34,197,94,0.4)', animation: 'scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
                    <CheckCircle size={36} color="white" />
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#111827', marginBottom: '6px' }}>Posting Berhasil!</div>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Nomor GR: <strong style={{ color: '#1e40af' }}>{grNumber}</strong></div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '24px' }}>
                    {draftItems.length} produk • {new Date().toLocaleString('id-ID')}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="bo-btn bo-btn-secondary" onClick={() => { setShowPostModal(false); setGrNumber(makeGrNumber()); }}>
                      <X size={16} /> Tutup &amp; Bersihkan Sesi
                    </button>
                    <button className="bo-btn bo-btn-primary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Printer size={16} /> Cetak GR
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

  );
};

export default StockManagement;
