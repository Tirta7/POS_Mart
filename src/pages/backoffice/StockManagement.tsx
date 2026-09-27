import React, { useState } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import { Plus, Save, CheckCircle, PackageCheck, Edit2, Trash2 } from 'lucide-react';

const StockManagement: React.FC = () => {
  const { products, addProduct, deleteProduct, updateProduct } = useInventoryStore();
  const { suppliers } = useSupplierStore();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Sembako');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('Pcs');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [image, setImage] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setProductId('');
    setSku('');
    setName('');
    setCategory('Sembako');
    setQty(1);
    setUnit('Pcs');
    setPurchasePrice(0);
    setSellingPrice(0);
    setWholesalePrice(0);
    setImage('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku || !name || qty <= 0 || sellingPrice <= 0) return;
    
    if (editingId) {
      // Find original to keep unmodified fields (like id, barcode, etc)
      const original = products.find(p => p.id === editingId);
      if (original) {
        updateProduct({
          ...original,
          sku,
          name,
          category,
          unit,
          stock: qty,
          purchasePrice,
          sellingPrice,
          wholesalePrice,
          image: image || original.image
        });
      }
    } else {
      addProduct({
        id: productId || ('PRD-' + Date.now().toString()),
        sku,
        barcode: sku,
        name,
        category,
        location: 'Gudang Utama',
        unit,
        stock: qty,
        baseUnitMultiplier: 1,
        purchasePrice,
        sellingPrice,
        wholesalePrice,
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
    setImage(p.image || '');
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatIDR = (num: number) => {
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  return (
    <div className="bo-container">
      
      {/* Header */}
      <div className="bo-page-header">
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
      <div className="bo-card">
        <div className="bo-card-header">
          <h2 className="bo-card-title">
            <div className="bo-card-title-indicator"></div>
            Formulir Cepat Tambah Stok
          </h2>
        </div>
        
        <div className="bo-card-body bg-[#fafafa]">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="bo-form-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <div className="bo-form-group">
                <label className="bo-label">ID PRODUK</label>
                <input type="text" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Misal: PRD-001" className="bo-input" disabled={!!editingId} style={{ backgroundColor: editingId ? '#f3f4f6' : 'white' }} />
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
                <label className="bo-label">KATEGORI</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="bo-input" required>
                  <option value="Sembako">Sembako</option>
                  <option value="Combo">Combo / Paket</option>
                  <option value="Rokok">Rokok</option>
                  <option value="Minuman">Minuman</option>
                </select>
              </div>
            </div>
            
            <div className="bo-form-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">QTY</label>
                <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="bo-input" required />
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
                <label className="bo-label">HARGA BELI</label>
                <input type="number" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(Number(e.target.value))} className="bo-input" />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">HARGA JUAL</label>
                <input type="number" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(Number(e.target.value))} className="bo-input" required />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 1' }}>
                <label className="bo-label">HARGA GROSIR</label>
                <input type="number" min="0" value={wholesalePrice} onChange={(e) => setWholesalePrice(Number(e.target.value))} className="bo-input" />
              </div>
              <div className="bo-form-group" style={{ gridColumn: 'span 3' }}>
                <label className="bo-label">URL GAMBAR PRODUK</label>
                <input type="text" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://images.unsplash.com/..." className="bo-input" />
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
      <div className="bo-card">
        <div className="bo-card-header">
          <h3 className="bo-card-title">
            <PackageCheck size={20} style={{ color: 'var(--primary)' }} /> 
            Rincian Barang Diterima
          </h3>
          <span className="bo-badge bo-badge-red" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
            {products.length} Item
          </span>
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
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
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
                  <td style={{ textAlign: 'center' }}>
                    <span className="bo-badge bo-badge-green">
                      <span className="bo-badge-dot green"></span> Segel Baik
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="bo-action-btn" onClick={() => handleEditClick(p)}><Edit2 size={16} /></button>
                    <button className="bo-action-btn" onClick={() => deleteProduct(p.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default StockManagement;
