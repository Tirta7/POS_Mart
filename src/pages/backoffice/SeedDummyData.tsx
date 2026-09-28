import React from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import type { SalesTransaction, Product } from '../../types';

const todayAt = (hour: number, minute: number) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const randomPast = (daysAgo: number, hour: number, minute: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const METHODS = ['TUNAI', 'QRIS', 'QRIS', 'TUNAI', 'KARTU DEBIT', 'TUNAI', 'QRIS'];
const CASHIERS = [
  { id: 'emp-1', name: 'Tirta' },
  { id: 'emp-2', name: 'Sari' },
  { id: 'emp-3', name: 'Budi' },
];

const DUMMY_PRODUCTS: Omit<Product, 'reserved'>[] = [
  // Sembako
  { id: 'dk-001', sku: 'SKU-BRS-001', barcode: '8993010005', name: 'Beras Premium 5kg', category: 'Sembako', location: 'Rak A1', unit: 'Sak', stock: 80, minStock: 10, baseUnitMultiplier: 1, purchasePrice: 58000, sellingPrice: 68000, wholesalePrice: 65000, image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-002', sku: 'SKU-MNY-001', barcode: '8993010006', name: 'Minyak Goreng Tropical 2L', category: 'Sembako', location: 'Rak A2', unit: 'Botol', stock: 60, minStock: 10, baseUnitMultiplier: 1, purchasePrice: 28000, sellingPrice: 34000, wholesalePrice: 32000, image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-003', sku: 'SKU-GLA-001', barcode: '8993010007', name: 'Gula Pasir 1kg', category: 'Sembako', location: 'Rak A3', unit: 'Pcs', stock: 45, minStock: 10, baseUnitMultiplier: 1, purchasePrice: 13500, sellingPrice: 16000, wholesalePrice: 15000, image: 'https://images.unsplash.com/photo-1559598467-f8b76c8155d0?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-004', sku: 'SKU-TEP-001', barcode: '8993010008', name: 'Tepung Terigu Segitiga 1kg', category: 'Sembako', location: 'Rak A4', unit: 'Pcs', stock: 55, minStock: 8, baseUnitMultiplier: 1, purchasePrice: 10000, sellingPrice: 12500, wholesalePrice: 11500, image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=300&q=80' },
  // Minuman
  { id: 'dk-005', sku: 'SKU-AQU-001', barcode: '8992775540014', name: 'Aqua Galon', category: 'Minuman', location: 'Rak B1', unit: 'Pcs', stock: 30, minStock: 5, baseUnitMultiplier: 1, purchasePrice: 18000, sellingPrice: 22000, wholesalePrice: 20000, image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-006', sku: 'SKU-IND-TEH', barcode: '8992775540015', name: 'Teh Botol Sosro 500ml', category: 'Minuman', location: 'Rak B2', unit: 'Pcs', stock: 120, minStock: 20, baseUnitMultiplier: 1, purchasePrice: 4500, sellingPrice: 6000, wholesalePrice: 5500, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-007', sku: 'SKU-KPC-001', barcode: '8992775540016', name: 'Kopi Kapal Api 165gr', category: 'Minuman', location: 'Rak B3', unit: 'Pcs', stock: 40, minStock: 10, baseUnitMultiplier: 1, purchasePrice: 14500, sellingPrice: 18000, wholesalePrice: 16500, image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-008', sku: 'SKU-FNT-001', barcode: '8992775540017', name: 'Fanta Strawberry 1.5L', category: 'Minuman', location: 'Rak B4', unit: 'Pcs', stock: 36, minStock: 6, baseUnitMultiplier: 1, purchasePrice: 12000, sellingPrice: 15000, wholesalePrice: 14000, image: 'https://images.unsplash.com/photo-1624517452488-04869289c4ca?auto=format&fit=crop&w=300&q=80' },
  // Snack / Combo
  { id: 'dk-009', sku: 'SKU-CHT-001', barcode: '8992775540018', name: 'Chitato Rasa Sapi 68gr', category: 'Combo', location: 'Rak C1', unit: 'Pcs', stock: 96, minStock: 15, baseUnitMultiplier: 1, purchasePrice: 8000, sellingPrice: 10500, wholesalePrice: 9500, image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-010', sku: 'SKU-POP-001', barcode: '8992775540019', name: 'Poppies Udang Keju', category: 'Combo', location: 'Rak C2', unit: 'Pcs', stock: 72, minStock: 10, baseUnitMultiplier: 1, purchasePrice: 3500, sellingPrice: 5000, wholesalePrice: 4500, image: 'https://images.unsplash.com/photo-1621447504864-d8686e12698c?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-011', sku: 'SKU-ORO-001', barcode: '8992775540020', name: 'Oreo Original 137gr', category: 'Combo', location: 'Rak C3', unit: 'Pcs', stock: 60, minStock: 10, baseUnitMultiplier: 1, purchasePrice: 12000, sellingPrice: 15000, wholesalePrice: 14000, image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=300&q=80' },
  // Rokok
  { id: 'dk-012', sku: 'SKU-SMO-001', barcode: '8992775540021', name: 'Sampoerna Mild', category: 'Rokok', location: 'Etalase D1', unit: 'Pcs', stock: 200, minStock: 30, baseUnitMultiplier: 1, purchasePrice: 23000, sellingPrice: 27500, wholesalePrice: 27000, image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-013', sku: 'SKU-DJR-001', barcode: '8992775540022', name: 'Djarum Super 12', category: 'Rokok', location: 'Etalase D2', unit: 'Pcs', stock: 150, minStock: 30, baseUnitMultiplier: 1, purchasePrice: 22000, sellingPrice: 26000, wholesalePrice: 25500, image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-014', sku: 'SKU-GDG-001', barcode: '8992775540023', name: 'Gudang Garam Merah', category: 'Rokok', location: 'Etalase D3', unit: 'Pcs', stock: 180, minStock: 30, baseUnitMultiplier: 1, purchasePrice: 20000, sellingPrice: 24000, wholesalePrice: 23500, image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=300&q=80' },
  // Frozen
  { id: 'dk-015', sku: 'SKU-SOS-001', barcode: '8992775540024', name: 'Sosis So Nice 500gr', category: 'Frozen Meat', location: 'Chiller A', unit: 'Pack', stock: 40, minStock: 5, baseUnitMultiplier: 1, purchasePrice: 24000, sellingPrice: 29000, wholesalePrice: 28000, image: 'https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-016', sku: 'SKU-NUG-001', barcode: '8992775540025', name: 'Nugget Fiesta 500gr', category: 'Frozen Meat', location: 'Chiller B', unit: 'Pack', stock: 35, minStock: 5, baseUnitMultiplier: 1, purchasePrice: 28000, sellingPrice: 34000, wholesalePrice: 32000, image: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=300&q=80' },
  // Personal Care
  { id: 'dk-017', sku: 'SKU-SBN-001', barcode: '8992775540026', name: 'Sabun Lifebuoy 110gr', category: 'Sembako', location: 'Rak E1', unit: 'Pcs', stock: 90, minStock: 15, baseUnitMultiplier: 1, purchasePrice: 4200, sellingPrice: 5500, wholesalePrice: 5000, image: 'https://images.unsplash.com/photo-1584305574647-0cc949a2bb9f?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-018', sku: 'SKU-SPU-001', barcode: '8992775540027', name: 'Shampo Pantene 170ml', category: 'Sembako', location: 'Rak E2', unit: 'Botol', stock: 50, minStock: 8, baseUnitMultiplier: 1, purchasePrice: 18000, sellingPrice: 22000, wholesalePrice: 21000, image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-019', sku: 'SKU-PST-001', barcode: '8992775540028', name: 'Pasta Gigi Pepsodent 190gr', category: 'Sembako', location: 'Rak E3', unit: 'Pcs', stock: 65, minStock: 10, baseUnitMultiplier: 1, purchasePrice: 10000, sellingPrice: 13000, wholesalePrice: 12000, image: 'https://images.unsplash.com/photo-1571167366136-b57e07b89c3a?auto=format&fit=crop&w=300&q=80' },
  { id: 'dk-020', sku: 'SKU-INM-001', barcode: '8992775540029', name: 'Indomie Goreng Spesial', category: 'Sembako', location: 'Rak A5', unit: 'Pcs', stock: 300, minStock: 50, baseUnitMultiplier: 1, purchasePrice: 2500, sellingPrice: 3500, wholesalePrice: 3200, image: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?auto=format&fit=crop&w=300&q=80' },
];

const SeedDummyData: React.FC = () => {
  const { addSale, sales, clearSales } = useSalesStore();
  const { products, addProduct, deleteProduct, addCategory } = useInventoryStore();

  const rnd = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

  const buildSale = (id: string, date: string): SalesTransaction => {
    const itemCount = Math.floor(Math.random() * 3) + 1;
    const pool = [...products].sort(() => Math.random() - 0.5).slice(0, Math.min(itemCount, products.length));

    const items = pool.map(p => {
      const qty = Math.floor(Math.random() * 3) + 1;
      return { productId: p.id, name: p.name, qty, price: p.sellingPrice, subtotal: p.sellingPrice * qty };
    });

    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const cashier = rnd(CASHIERS);
    const method = rnd(METHODS);

    return {
      id, date, items, subtotal, tax: 0, rounding: 0,
      total: subtotal, paymentMethod: method,
      tendered: subtotal, change: 0,
      employeeId: cashier.id, employeeName: cashier.name,
    };
  };

  const handleSeedProducts = () => {
    // Add required categories first
    const cats = ['Frozen Meat', 'Poultry', 'Minuman', 'Combo', 'Rokok', 'Sembako'];
    cats.forEach(c => addCategory(c));

    // Only add products not already in store (by id)
    const existingIds = new Set(products.map(p => p.id));
    let added = 0;
    DUMMY_PRODUCTS.forEach(p => {
      if (!existingIds.has(p.id)) {
        addProduct({ ...p, reserved: 0 });
        added++;
      }
    });
    alert(added > 0 ? `✅ ${added} produk dummy berhasil ditambahkan.` : 'ℹ️ Semua produk dummy sudah ada.');
  };

  const handleClearProducts = () => {
    if (!confirm(`⚠️ Hapus semua ${products.length} produk? Ini juga akan mempengaruhi data transaksi.`)) return;
    // Delete one by one (store doesn't have clearAll)
    const ids = products.map(p => p.id);
    ids.forEach(id => deleteProduct(id));
    alert('✅ Semua produk telah dihapus.');
  };

  const handleSeedToday = () => {
    if (!products.length) { alert('Tidak ada produk. Tambahkan produk di Manajemen Stok.'); return; }
    const slots = [[8,12],[8,45],[9,22],[10,5],[10,33],[11,8],[11,55],[12,14],[13,30],[14,2]];
    slots.forEach(([h, m], i) => addSale(buildSale(`DUMMY-T-${String(i+1).padStart(2,'0')}`, todayAt(h, m))));
    alert('✅ 10 transaksi dummy hari ini berhasil ditambahkan.');
  };

  const handleSeed7Days = () => {
    if (!products.length) { alert('Tidak ada produk. Tambahkan produk di Manajemen Stok.'); return; }
    let count = 0;
    for (let day = 6; day >= 0; day--) {
      const n = Math.floor(Math.random() * 8) + 5;
      for (let i = 0; i < n; i++) {
        const h = 8 + Math.floor(Math.random() * 10);
        const m = Math.floor(Math.random() * 60);
        const id = `DUMMY-${day}D-${String(i+1).padStart(2,'0')}-${Date.now()+count}`;
        addSale(buildSale(id, randomPast(day, h, m)));
        count++;
      }
    }
    alert(`✅ ${count} transaksi dummy 7 hari terakhir berhasil ditambahkan.`);
  };

  const handleClear = () => {
    if (!confirm(`⚠️ Hapus SEMUA ${sales.length} transaksi? Tidak bisa dibatalkan.`)) return;
    clearSales();
    alert('✅ Semua transaksi telah dihapus.');
  };

  const todayCount = sales.filter(s => new Date(s.date).toDateString() === new Date().toDateString()).length;

  return (
    <div className="bo-container">
      <div className="bo-page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title">🧪 Seed Data Dummy</h1>
          <p className="bo-page-subtitle">Buat data transaksi palsu untuk keperluan testing dan demo laporan.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
        {/* Stats */}
        <div className="bo-card" style={{ padding: '20px', display: 'flex', gap: '40px', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>TOTAL TRANSAKSI</div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#111' }}>{sales.length} Nota</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>PRODUK TERSEDIA</div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#111' }}>{products.length} Produk</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>TRANSAKSI HARI INI</div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#10b981' }}>{todayCount} Nota</div>
          </div>
        </div>

        {/* Action Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', flexShrink: 0 }}>
          <div className="bo-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📅</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 'bold' }}>Transaksi Hari Ini</h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
              Tambahkan <strong>10 transaksi dummy</strong> dengan jam berbeda untuk hari ini.
            </p>
            <button onClick={handleSeedToday} className="bo-btn bo-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              ➕ Tambah 10 Transaksi Hari Ini
            </button>
          </div>

          <div className="bo-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📆</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 'bold' }}>Transaksi 7 Hari Terakhir</h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
              Tambahkan <strong>5–12 transaksi per hari</strong> selama 7 hari ke belakang.
            </p>
            <button onClick={handleSeed7Days} className="bo-btn bo-btn-primary" style={{ width: '100%', justifyContent: 'center', background: '#3b82f6', borderColor: '#3b82f6' }}>
              📊 Tambah Data 7 Hari
            </button>
          </div>

          <div className="bo-card" style={{ padding: '24px', borderLeft: '4px solid #ef4444' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>Hapus Semua Transaksi</h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
              Menghapus <strong>semua</strong> data transaksi. <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Tidak bisa dibatalkan!</span>
            </p>
            <button onClick={handleClear} className="bo-btn" style={{ width: '100%', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
              🗑️ Hapus Semua ({sales.length})
            </button>
          </div>
        </div>

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#9ca3af', fontSize: '13px', fontWeight: 'bold', flexShrink: 0 }}>
          <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
          📦 MANAJEMEN PRODUK / STOK
          <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
        </div>

        {/* Product Action Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', flexShrink: 0 }}>
          <div className="bo-card" style={{ padding: '24px', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🛒</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 'bold' }}>Tambah 20 Produk Dummy</h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
              Menambahkan <strong>20 produk</strong> dari berbagai kategori (Sembako, Minuman, Rokok, Frozen, Snack) lengkap dengan harga beli, harga jual, dan stok awal. Produk yang sudah ada tidak akan ditimpa.
            </p>
            <button onClick={handleSeedProducts} className="bo-btn bo-btn-primary" style={{ width: '100%', justifyContent: 'center', background: '#10b981', borderColor: '#10b981' }}>
              🛒 Tambah 20 Produk Dummy
            </button>
          </div>

          <div className="bo-card" style={{ padding: '24px', borderLeft: '4px solid #ef4444' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>Hapus Semua Produk</h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
              Menghapus <strong>semua</strong> produk dari database. <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Hati-hati!</span>
            </p>
            <button onClick={handleClearProducts} className="bo-btn" style={{ width: '100%', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
              🗑️ Hapus Semua Produk ({products.length})
            </button>
          </div>
        </div>

        {/* Product Preview Table */}
        <div className="bo-card" style={{ flexShrink: 0 }}>
          <div className="bo-card-header">
            <h3 className="bo-card-title">Daftar Produk ({products.length})</h3>
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {products.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                Belum ada produk. Klik tombol di atas untuk menambahkan produk dummy.
              </div>
            ) : (
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>NAMA PRODUK</th>
                    <th>KATEGORI</th>
                    <th>SATUAN</th>
                    <th>STOK</th>
                    <th>HARGA BELI</th>
                    <th>HARGA JUAL</th>
                    <th>MARGIN</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: '600' }}>{p.name}</td>
                      <td><span style={{ padding: '2px 8px', borderRadius: '999px', background: '#f3f4f6', fontSize: '12px' }}>{p.category}</span></td>
                      <td style={{ color: '#6b7280' }}>{p.unit}</td>
                      <td style={{ fontWeight: 'bold', color: p.stock <= (p.minStock || 10) ? '#ef4444' : '#111' }}>{p.stock}</td>
                      <td style={{ color: '#6b7280' }}>Rp {p.purchasePrice.toLocaleString('id-ID')}</td>
                      <td style={{ fontWeight: 'bold', color: '#10b981' }}>Rp {p.sellingPrice.toLocaleString('id-ID')}</td>
                      <td style={{ fontWeight: 'bold', color: '#3b82f6' }}>+Rp {(p.sellingPrice - p.purchasePrice).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Preview Table */}
        <div className="bo-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: 0 }}>
          <div className="bo-card-header" style={{ flexShrink: 0 }}>
            <h3 className="bo-card-title">Preview 10 Transaksi Terakhir</h3>
          </div>
          <div className="bo-table-container">
            {sales.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                Belum ada data transaksi. Klik tombol di atas untuk menambahkan data dummy.
              </div>
            ) : (
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>ID TRANSAKSI</th>
                    <th>WAKTU</th>
                    <th>KASIR</th>
                    <th>ITEM</th>
                    <th>METODE</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sales]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 10)
                    .map(s => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>{s.id}</td>
                        <td style={{ fontSize: '13px' }}>{new Date(s.date).toLocaleString('id-ID')}</td>
                        <td>{s.employeeName || '—'}</td>
                        <td>{s.items.length} item</td>
                        <td>
                          <span style={{
                            padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 'bold',
                            background: s.paymentMethod === 'TUNAI' ? '#ecfdf5' : '#eff6ff',
                            color: s.paymentMethod === 'TUNAI' ? '#059669' : '#3b82f6',
                          }}>
                            {s.paymentMethod}
                          </span>
                        </td>
                        <td style={{ fontWeight: 'bold' }}>Rp {s.total.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeedDummyData;
