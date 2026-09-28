import React, { useState } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import { Plus, Save, CheckCircle, PackageCheck, Edit2, Trash2, X, Settings, ArrowDownToLine, Camera, Search } from 'lucide-react';
import BarcodeScannerCamera from '../../components/BarcodeScannerCamera';

const StockManagement: React.FC = () => {
  const { products, addProduct, deleteProduct, updateProduct, categories, addCategory, deleteCategory, editCategory } = useInventoryStore();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Sembako');
  const [searchQuery, setSearchQuery] = useState('');
  const [qty, setQty] = useState<number | string>('');
  const [unit, setUnit] = useState('Pcs');
  const [purchasePrice, setPurchasePrice] = useState<number | string>('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');
  const [wholesalePrice, setWholesalePrice] = useState<number | string>('');
  const [minStock, setMinStock] = useState<number | string>('');
  const [image, setImage] = useState('');
  const [newCategory, setNewCategory] = useState('');
  
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  
  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryTarget, setEditingCategoryTarget] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Restock Modal State
  const [restockProduct, setRestockProduct] = useState<any>(null);
  const [restockQty, setRestockQty] = useState<number | string>('');
  const [restockPrice, setRestockPrice] = useState<number | string>('');

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
    
    const finalId = productId || ('PRD-' + Date.now().toString());
    const finalBarcode = productId || ('PRD-' + Date.now().toString());

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
        setEditingId(null); // Keluar dari mode edit setelah berhasil simpan
      }
    } else {
      // Cek duplikat untuk penambahan data baru
      const isDuplicate = products.some(p => p.id === finalId || p.barcode === finalBarcode);
      if (isDuplicate) {
        alert(`Peringatan: Barcode/ID ${finalId} sudah terdaftar di database! Tidak boleh ada duplikat.`);
        return;
      }

      addProduct({
        id: finalId,
        sku,
        barcode: finalBarcode,
        name,
        category,
        location: 'Gudang Utama',
        unit,
        stock: Number(qty),
        baseUnitMultiplier: 1,
        purchasePrice: Number(purchasePrice),
        sellingPrice: Number(sellingPrice),
        wholesalePrice: Number(wholesalePrice),
        minStock: Number(minStock),
        image: image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80'
      });
    }
    
    resetForm();
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
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    updateProduct(restockProduct.id, {
      ...restockProduct,
      stock: newTotalQty,
      purchasePrice: newAveragePrice,
      // Harga jual tidak diubah otomatis
    });

    setRestockProduct(null);
  };

  return (
    <div className="bo-container">
      
      {/* Header */}
      <div className="bo-page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title">Penerimaan Stok (Goods Receipt)</h1>
          <p className="bo-page-subtitle">Input form cepat untuk penambahan stok masuk.</p>
        </div>
        <div className="bo-header-actions">
          <button className="bo-btn bo-btn-secondary">
            <Save size={16} /> Simpan Draf
          </button>
          <button className="bo-btn bo-btn-primary">
            <CheckCircle size={16} /> Konfirmasi & Posting
          </button>
        </div>
      </div>

      {/* Input Form */}
      <div className="bo-card" style={{ flexShrink: 0 }}>
        <div className="bo-card-header">
          <h2 className="bo-card-title">
            <div className="bo-card-title-indicator"></div>
            Formulir Cepat Tambah Stok
          </h2>
        </div>
        
        <div className="bo-card-body bg-[#fafafa]">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="bo-form-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <div className="bo-form-group" style={{ position: 'relative' }}>
                <label className="bo-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  ID PRODUK (BARCODE)
                  <button 
                    type="button"
                    onClick={() => setCameraScannerOpen(true)}
                    style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold' }}
                  >
                    <Camera size={14} /> Scan
                  </button>
                </label>
                <input 
                  type="text" 
                  value={productId} 
                  onChange={(e) => setProductId(e.target.value)} 
                  onKeyDown={handleIdKeyDown}
                  placeholder="Scan Barcode..." 
                  className="bo-input" 
                  style={{ backgroundColor: 'white' }} 
                  autoFocus
                />
              </div>
              <div className="bo-form-group">
                <label className="bo-label">SKU BARANG</label>
                <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Misal: SKU-123" className="bo-input" required />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 2' }}>
                <label className="bo-label">NAMA PRODUK</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama Barang Lengkap" className="bo-input" required />
              </div>
              <div className="bo-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="bo-label" style={{ marginBottom: 0 }}>KATEGORI</label>
                  <button type="button" onClick={() => setIsCategoryModalOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                    <Settings size={12} /> Kelola
                  </button>
                </div>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="bo-input" required>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                  <input 
                    type="text" 
                    value={newCategory} 
                    onChange={(e) => setNewCategory(e.target.value)} 
                    placeholder="+ Kategori Baru" 
                    className="bo-input" 
                    style={{ padding: '4px 8px', fontSize: '12px', height: '28px' }} 
                  />
                  <button 
                    type="button" 
                    onClick={() => { 
                      if(newCategory.trim()) { 
                        addCategory(newCategory.trim()); 
                        setCategory(newCategory.trim()); 
                        setNewCategory(''); 
                      } 
                    }} 
                    className="bo-btn bo-btn-primary" 
                    style={{ padding: '4px 8px', fontSize: '12px', height: '28px' }}
                  >
                    Tambah
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bo-form-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">QTY</label>
                <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))} className="bo-input" required />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">SATUAN</label>
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bo-input" required>
                  <option value="Pcs">Pcs</option>
                  <option value="Kg">Kg</option>
                  <option value="Gram">Gram</option>
                  <option value="Liter">Liter</option>
                  <option value="Pack">Pack</option>
                  <option value="Dus">Dus</option>
                </select>
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">MIN STOK</label>
                <input type="number" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Peringatan" className="bo-input" />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">HARGA BELI</label>
                <input type="number" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))} className="bo-input" />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">HARGA JUAL</label>
                <input type="number" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))} className="bo-input" required />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">HARGA GROSIR</label>
                <input type="number" min="0" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))} className="bo-input" />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 2' }}>
                <label className="bo-label">URL GAMBAR</label>
                <input type="text" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." className="bo-input" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', gap: '8px' }}>
              {editingId && (
                <button type="button" className="bo-btn bo-btn-secondary" onClick={resetForm}>
                  Batal
                </button>
              )}
              <button type="submit" className="bo-btn bo-btn-primary">
                {editingId ? <Save size={18} /> : <Plus size={18} />} 
                {editingId ? 'Simpan Perubahan' : 'Tambahkan ke Daftar'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Data Table */}
      <div className="bo-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: 0 }}>
        <div className="bo-card-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 className="bo-card-title" style={{ margin: 0 }}>
              <PackageCheck size={20} style={{ color: 'var(--primary)' }} /> 
              Rincian Barang Diterima
            </h3>
            <span className="bo-badge bo-badge-red" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
              {products.length} Item
            </span>
          </div>
          
          <div style={{ position: 'relative', width: '250px', maxWidth: '100%' }}>
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
        </div>
        <div className="bo-table-container">
          <table className="bo-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>SKU</th>
                <th>Nama Produk</th>
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
              {products
                .filter(p => 
                  p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  p.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  p.id.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map(p => (
                <tr key={p.id}>
                  <td className="bo-table-sku" style={{ color: '#6b7280' }}>{p.id}</td>
                  <td className="bo-table-sku">{p.sku}</td>
                  <td className="bo-table-bold">{p.name}</td>
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
                    <button className="bo-action-btn" title="Restock / Barang Masuk" onClick={() => openRestockModal(p)} style={{ color: '#10b981' }}><ArrowDownToLine size={16} /></button>
                    <button className="bo-action-btn" title="Edit Master Data" onClick={() => handleEditClick(p)}><Edit2 size={16} /></button>
                    <button className="bo-action-btn" title="Hapus Produk" onClick={() => deleteProduct(p.id)}><Trash2 size={16} /></button>
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

      {/* CAMERA SCANNER MODAL */}
      {cameraScannerOpen && (
        <BarcodeScannerCamera 
          onScan={(decodedText) => {
            // Simulasi user mengetikkan text ke ID Produk lalu menekan Enter
            setProductId(decodedText);
            
            const foundProduct = products.find(p => p.id === decodedText || p.barcode === decodedText);
            if (foundProduct) {
              // Otomatis buka modal Restock
              openRestockModal(foundProduct);
              setProductId(''); // Reset
            } else {
              // Not found, treat as new item
              setEditingId(null);
              setSku('');
              setName('');
              setQty(1);
            }
            setCameraScannerOpen(false);
          }} 
          onClose={() => setCameraScannerOpen(false)} 
        />
      )}
    </div>
  );
};

export default StockManagement;
