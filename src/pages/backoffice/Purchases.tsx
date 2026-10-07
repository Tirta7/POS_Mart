import React, { useState } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ShoppingCart, Plus, Trash2, CheckCircle, Search, Camera, X } from 'lucide-react';
import type { StockTransactionItem } from '../../types';
import BarcodeScannerCamera from '../../components/BarcodeScannerCamera';

const Purchases: React.FC = () => {
  const { products, updateProduct, addTransaction, addProduct, categories } = useInventoryStore();
  const { suppliers, updateSupplierPayable } = useSupplierStore();
  const { currentUser } = useAuthStore();
  
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [items, setItems] = useState<Array<StockTransactionItem & { name: string; currentStock: number }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('Pcs');
  const [newProdSellingPrice, setNewProdSellingPrice] = useState('');
  const [newProdPurchasePrice, setNewProdPurchasePrice] = useState('');
  const [newProdWholesalePrice, setNewProdWholesalePrice] = useState('');
  const [newProdMinStock, setNewProdMinStock] = useState('');
  const [newProdImage, setNewProdImage] = useState('');

  const [documentNo, setDocumentNo] = useState(() => `PO-${Date.now()}`);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdBarcode || !newProdName || !newProdSellingPrice) return;
    
    // Check duplicate
    if (products.some(p => p.id === newProdBarcode || p.barcode === newProdBarcode)) {
      alert("Barcode / ID sudah terdaftar!");
      return;
    }

    const newProduct = {
      id: newProdBarcode,
      sku: newProdSku || newProdBarcode,
      barcode: newProdBarcode,
      name: newProdName,
      category: newProdCategory || (categories[0] || 'Sembako'),
      location: 'Gudang Utama',
      unit: newProdUnit,
      stock: 0,
      baseUnitMultiplier: 1,
      purchasePrice: Number(newProdPurchasePrice) || 0,
      sellingPrice: Number(newProdSellingPrice),
      wholesalePrice: Number(newProdWholesalePrice) || 0,
      minStock: Number(newProdMinStock) || 0,
      image: newProdImage || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80'
    };

    const createdProd = await addProduct(newProduct);
    
    // Auto add to PO items
    handleAddItem(createdProd);
    
    // Reset and close
    setIsNewProductModalOpen(false);
    setNewProdBarcode('');
    setNewProdSku('');
    setNewProdName('');
    setNewProdSellingPrice('');
    setNewProdPurchasePrice('');
    setNewProdWholesalePrice('');
    setNewProdMinStock('');
    setNewProdImage('');
    setSearchTerm('');
  };

  const handleAddItem = (product: any) => {
    if (items.find(i => i.productId === product.id)) return;
    setItems([...items, {
      productId: product.id,
      name: product.name,
      currentStock: product.stock,
      qty: 1,
      batchNo: '',
      expiryDate: '',
      purchasePrice: product.purchasePrice || 0,
      subtotal: product.purchasePrice || 0
    }]);
    setSearchTerm('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!searchTerm) return;
      const exactMatch = products.find(p => p.barcode === searchTerm || p.id === searchTerm);
      if (exactMatch) {
        handleAddItem(exactMatch);
      }
    }
  };

  const handleRemoveItem = (productId: string) => {
    setItems(items.filter(i => i.productId !== productId));
  };

  const handleItemChange = (productId: string, field: string, value: any) => {
    setItems(items.map(item => {
      if (item.productId === productId) {
        const updated = { ...item, [field]: value };
        if (field === 'qty' || field === 'purchasePrice') {
          updated.subtotal = Number(updated.qty) * Number(updated.purchasePrice);
        }
        return updated;
      }
      return item;
    }));
  };

  const totalValue = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) {
      alert("Pilih supplier terlebih dahulu!");
      return;
    }
    if (items.length === 0) {
      alert("Tambahkan minimal 1 produk!");
      return;
    }
    if (!currentUser) return;

    // 1. Catat Transaksi
    const transaction = {
      id: `TXN-${Date.now()}`,
      type: 'IN' as const,
      date: new Date().toISOString(),
      documentNo,
      supplierId: selectedSupplier,
      employeeId: currentUser.id,
      items: items.map(({ name, currentStock, ...rest }) => rest), // exclude extra fields
      totalValue
    };
    // 1. Catat Transaksi (Ini otomatis akan menambah hutang supplier di backend)
    addTransaction(transaction);

    // 2. Update Stok dan HPP Produk
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const oldQty = product.stock;
        const oldPrice = product.purchasePrice || 0;
        const addedQty = Number(item.qty);
        const addedPrice = Number(item.purchasePrice);
        const newTotalQty = oldQty + addedQty;
        
        // HPP Rata-rata
        const newAvgPrice = newTotalQty > 0 
          ? Math.round(((oldQty * oldPrice) + (addedQty * addedPrice)) / newTotalQty)
          : oldPrice;

        updateProduct(product.id, {
          ...product,
          stock: newTotalQty,
          purchasePrice: newAvgPrice
        });
      }
    });

    alert("Pembelian berhasil disimpan! Stok dan hutang telah diperbarui.");
    setItems([]);
    setDocumentNo(`PO-${Date.now()}`);
  };

  const formatIDR = (num: number) => 'Rp ' + num.toLocaleString('id-ID');

  const filteredProducts = products.filter(p => {
    const q = searchTerm.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(q)) || 
           (p.sku && p.sku.toLowerCase().includes(q)) ||
           (p.barcode && p.barcode.toLowerCase().includes(q));
  });

  return (
    <div className="bo-container">
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Pembelian (Purchase Order)</h1>
          <p className="bo-page-subtitle">Beli stok dari supplier. Hutang/Piutang akan otomatis ditambahkan.</p>
        </div>
      </div>

      <div className="bo-layout-grid" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Form Pembelian */}
        <div className="bo-card r-full-mobile" style={{ flex: '1 1 500px', minWidth: 0 }}>
          <div className="bo-card-header">
            <h3 className="bo-card-title"><ShoppingCart size={20} style={{ color: 'var(--primary)' }} /> Detail Pembelian</h3>
          </div>
          
          <form onSubmit={handleSubmit} className="bo-card-body">
            <div className="bo-grid-2" style={{ marginBottom: '20px' }}>
              <div className="bo-form-group">
                <label className="bo-label">NO. DOKUMEN / FAKTUR</label>
                <input type="text" className="bo-input" value={documentNo} onChange={e => setDocumentNo(e.target.value)} required />
              </div>
              <div className="bo-form-group">
                <label className="bo-label">SUPPLIER</label>
                <select className="bo-input" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} required>
                  <option value="">-- Pilih Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.contact})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bo-form-group">
              <label className="bo-label">CARI PRODUK</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input 
                  type="text" 
                  className="bo-input" 
                  placeholder="Ketik nama produk, SKU, atau scan barcode..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{ paddingLeft: '32px', paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#10b981', display: 'flex', alignItems: 'center', padding: '4px'
                  }}
                  title="Scan Barcode"
                >
                  <Camera size={16} />
                </button>
                
                {/* Search Results Dropdown */}
                {searchTerm && (
                  <div style={{ 
                    position: 'absolute', top: '100%', left: 0, right: 0, 
                    backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', 
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 50, maxHeight: '250px', overflowY: 'auto', marginTop: '4px' 
                  }}>
                    {filteredProducts.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ color: '#6b7280', marginBottom: '12px' }}>Produk tidak ditemukan</div>
                        <button 
                          type="button" 
                          className="bo-btn bo-btn-primary" 
                          style={{ width: '100%' }}
                          onClick={() => {
                            setNewProdBarcode(searchTerm); // use search term as default barcode/name
                            setNewProdName('');
                            setIsNewProductModalOpen(true);
                          }}
                        >
                          <Plus size={16} /> Tambah Produk Baru
                        </button>
                      </div>
                    ) : (
                      <>
                        {filteredProducts.map(p => (
                          <div 
                            key={p.id} 
                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}
                            onClick={() => handleAddItem(p)}
                          >
                            <div>
                              <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>SKU: {p.sku} | Stok: {p.stock}</div>
                            </div>
                            <div style={{ color: '#10b981', fontWeight: 'bold' }}>{formatIDR(p.purchasePrice)}</div>
                          </div>
                        ))}
                        <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb' }}>
                          <button 
                            type="button" 
                            className="bo-btn bo-btn-secondary" 
                            style={{ width: '100%', fontSize: '12px', padding: '6px' }}
                            onClick={() => setIsNewProductModalOpen(true)}
                          >
                            + Buat Produk Baru
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bo-table-container" style={{ marginTop: '20px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <table className="bo-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f9fafb' }}>
                  <tr>
                    <th>Produk</th>
                    <th style={{ width: '100px' }}>Qty</th>
                    <th style={{ width: '150px' }}>Harga Beli</th>
                    <th style={{ width: '150px' }}>Subtotal</th>
                    <th style={{ width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>Belum ada produk yang ditambahkan.</td>
                    </tr>
                  ) : (
                    items.map(item => (
                      <tr key={item.productId}>
                        <td>
                          <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Stok Saat Ini: {item.currentStock}</div>
                        </td>
                        <td>
                          <input type="number" min="1" className="bo-input" value={item.qty} onChange={e => handleItemChange(item.productId, 'qty', Number(e.target.value))} style={{ padding: '4px 8px' }} />
                        </td>
                        <td>
                          <input type="number" min="0" className="bo-input" value={item.purchasePrice} onChange={e => handleItemChange(item.productId, 'purchasePrice', Number(e.target.value))} style={{ padding: '4px 8px' }} />
                        </td>
                        <td style={{ fontWeight: 'bold', textAlign: 'right' }}>{formatIDR(item.subtotal)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" onClick={() => handleRemoveItem(item.productId)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '2px dashed #e5e7eb' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Total Pembelian:</div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary)' }}>{formatIDR(totalValue)}</div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="bo-btn bo-btn-primary" style={{ padding: '12px 24px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={20} /> Simpan Pembelian
              </button>
            </div>
          </form>
        </div>

        {/* Info Supplier */}
        <div className="bo-card r-full-mobile" style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div className="bo-card-header">
            <h3 className="bo-card-title">Ringkasan Supplier</h3>
          </div>
          <div className="bo-card-body">
            {!selectedSupplier ? (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px 0' }}>Pilih supplier untuk melihat info.</div>
            ) : (
              (() => {
                const supp = suppliers.find(s => s.id === selectedSupplier);
                if (!supp) return null;
                return (
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>{supp.name}</div>
                    <div style={{ color: '#4b5563', marginBottom: '16px' }}>{supp.contact} - {supp.phone}</div>
                    
                    <div style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                      <div style={{ color: '#991b1b', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>TOTAL HUTANG (PIUTANG SUPPLIER):</div>
                      <div style={{ color: '#b91c1c', fontSize: '24px', fontWeight: '900' }}>{formatIDR(supp.totalPayable || 0)}</div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>
      
      {isScannerOpen && (
        <BarcodeScannerCamera 
          onScan={(decodedText) => {
            const foundProduct = products.find(p => p.id === decodedText || p.barcode === decodedText);
            if (foundProduct) {
              handleAddItem(foundProduct);
              setIsScannerOpen(false);
              return foundProduct.name;
            }
            setIsScannerOpen(false);
            
            // If not found, open new product modal
            if (window.confirm('Produk tidak ditemukan. Tambahkan sebagai produk baru?')) {
              setNewProdBarcode(decodedText);
              setIsNewProductModalOpen(true);
            }
            return null;
          }} 
          onClose={() => setIsScannerOpen(false)} 
        />
      )}

      {/* MODAL: TAMBAH PRODUK BARU */}
      {isNewProductModalOpen && (
        <div className="pf-overlay" style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998,
          animation: 'fadeIn 0.15s ease'
        }}>
          <div className="pf-sheet" style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '96%', maxWidth: '900px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            animation: 'slideUp 0.2s cubic-bezier(0.34,1.4,0.64,1)'
          }}>
            {/* Modal Header */}
            <div className="pf-head" style={{
              background: 'linear-gradient(135deg, #1a0505 0%, #2d0a08 50%, #1a0505 100%)',
              padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(218,41,28,0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div className="pf-head-icon" style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #da291c, #b91c1c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(218,41,28,0.4)', flexShrink: 0
                }}>
                  <Plus size={18} color="white" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="pf-title" style={{ color: 'white', fontWeight: 800, fontSize: '16px' }}>
                    Formulir Cepat Tambah Stok
                  </div>
                  <div className="pf-subtitle" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                    Isi semua field yang diperlukan
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="pf-close"
                onClick={() => setIsNewProductModalOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px', width: '34px', height: '34px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'rgba(255,255,255,0.7)', transition: 'all 0.15s'
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(218,41,28,0.3)'; e.currentTarget.style.color = 'white'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="pf-body" style={{ padding: '24px', backgroundColor: '#fafafa' }}>
              <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Row 1: Barcode, SKU, Nama, Kategori */}
                <div className="pf-section">Info Produk</div>
                <div className="pf-group">
                  <div className="r-grid-4 pf-info" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 2fr 1.3fr', gap: '16px' }}>
                    <div className="bo-form-group">
                      <label className="bo-label">ID Produk<span className="hide-mobile"> (Barcode)</span></label>
                      <input type="text" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdBarcode} onChange={e => setNewProdBarcode(e.target.value)} required autoFocus={!(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)} placeholder="Scan / ketik barcode" />
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">SKU<span className="hide-mobile"> Barang</span></label>
                      <input type="text" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdSku} onChange={e => setNewProdSku(e.target.value)} required placeholder="Misal: SKU-123" />
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">Nama Produk</label>
                      <input type="text" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdName} onChange={e => setNewProdName(e.target.value)} required placeholder="Nama barang lengkap" />
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">Kategori</label>
                      <select className="bo-input" style={{ backgroundColor: 'white' }} value={newProdCategory} onChange={e => setNewProdCategory(e.target.value)} required>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                
                {/* Row 2: Satuan, Min Stok, H.Beli, H.Jual, H.Grosir, URL */}
                <div className="pf-section">Stok & Harga</div>
                <div className="pf-group">
                  <div className="r-grid-6 pf-row2" style={{ display: 'grid', gridTemplateColumns: '100px 90px 1fr 1fr 1fr 1.5fr', gap: '16px', alignItems: 'end' }}>
                    <div className="bo-form-group">
                      <label className="bo-label">Satuan</label>
                      <select className="bo-input" style={{ backgroundColor: 'white' }} value={newProdUnit} onChange={e => setNewProdUnit(e.target.value)}>
                        <option value="Pcs">Pcs</option>
                        <option value="Kg">Kg</option>
                        <option value="Gram">Gram</option>
                        <option value="Pack">Pack</option>
                        <option value="Dus">Dus</option>
                      </select>
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">Min Stok</label>
                      <input type="number" inputMode="numeric" min="0" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdMinStock} onChange={e => setNewProdMinStock(e.target.value)} placeholder="Alert" />
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">Harga Beli</label>
                      <input type="number" inputMode="numeric" min="0" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdPurchasePrice} onChange={e => setNewProdPurchasePrice(e.target.value)} placeholder="0" />
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">Harga Jual</label>
                      <input type="number" inputMode="numeric" min="0" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdSellingPrice} onChange={e => setNewProdSellingPrice(e.target.value)} required placeholder="0" />
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">Harga Grosir</label>
                      <input type="number" inputMode="numeric" min="0" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdWholesalePrice} onChange={e => setNewProdWholesalePrice(e.target.value)} placeholder="Opsional" />
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">URL Gambar</label>
                      <input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" className="bo-input" style={{ backgroundColor: 'white' }} value={newProdImage} onChange={e => setNewProdImage(e.target.value)} placeholder="https://..." />
                    </div>
                  </div>
                </div>
                
                <div className="pf-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                  <button type="button" className="bo-btn bo-btn-secondary" onClick={() => setIsNewProductModalOpen(false)}>Batal</button>
                  <button type="submit" className="bo-btn bo-btn-primary" style={{ minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Plus size={16} /> Tambahkan ke Daftar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp {
          from { opacity:0; transform: translateY(20px) scale(0.98); }
          to { opacity:1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default Purchases;
