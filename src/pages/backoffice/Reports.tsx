import React, { useState, useMemo } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { FileText, TrendingUp, AlertCircle, Calendar, DollarSign, Search, Filter, User, UserCheck, CreditCard } from 'lucide-react';

const Reports: React.FC = () => {
  const { sales } = useSalesStore();
  const { products } = useInventoryStore();
  const { customers } = useCustomerStore();
  
  const [activeTab, setActiveTab] = useState<'sales' | 'low-stock'>('sales');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [paymentMethod, setPaymentMethod] = useState('ALL');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest'>('latest');

  const formatIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

  // Compute enriched sales with Customer Name and Profit Margin
  const enrichedSales = useMemo(() => {
    return sales.map(sale => {
      // Find customer
      const customer = customers.find(c => c.id === sale.customerId);
      const customerName = customer ? customer.name : 'Umum (Guest)';

      // Calculate profit margin
      let totalPurchasePrice = 0;
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        // Harga modal langsung dari purchasePrice
        const unitCost = product ? product.purchasePrice : 0;
        totalPurchasePrice += unitCost * item.qty;
      });
      // Margin = Subtotal (harga jual) - Total Harga Beli
      const profitMargin = sale.subtotal - totalPurchasePrice;

      return {
        ...sale,
        customerName,
        profitMargin,
        totalPurchasePrice
      };
    });
  }, [sales, customers, products]);

  // Apply filters
  const filteredSales = useMemo(() => {
    let result = enrichedSales;
    
    if (searchQuery.trim() !== '') {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(sale => 
        sale.id.toLowerCase().includes(lowerQuery) || 
        sale.customerName.toLowerCase().includes(lowerQuery)
      );
    }
    
    if (startDate) {
      result = result.filter(sale => {
        const saleDate = new Date(sale.date).toISOString().split('T')[0];
        return saleDate >= startDate;
      });
    }
    
    if (endDate) {
      result = result.filter(sale => {
        const saleDate = new Date(sale.date).toISOString().split('T')[0];
        return saleDate <= endDate;
      });
    }

    if (paymentMethod !== 'ALL') {
      result = result.filter(sale => sale.paymentMethod === paymentMethod);
    }

    result.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortBy === 'latest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [enrichedSales, searchQuery, startDate, endDate, paymentMethod, sortBy]);

  // Summaries
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalTransactions = sales.length;
  const totalProfit = enrichedSales.reduce((sum, sale) => sum + sale.profitMargin, 0);

  // Low Stock Items
  const lowStockItems = products.filter(p => {
    const available = p.stock - (p.reserved || 0);
    const min = p.minStock ?? 10;
    return available <= min;
  });

  return (
    <div className="bo-container">
      <div className="bo-page-header" style={{ marginBottom: '16px', flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title">Laporan & Analitik</h1>
          <p className="bo-page-subtitle">Pantau performa penjualan, pergerakan stok, dan keuntungan toko Anda secara realtime.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '16px', flexShrink: 0 }}>
        {/* Total Pendapatan */}
        <div className="bo-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #10b981' }}>
          <div style={{ padding: '14px', backgroundColor: '#ecfdf5', color: '#10b981', borderRadius: '12px' }}>
            <TrendingUp size={28} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>TOTAL PENDAPATAN</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111' }}>{formatIDR(totalRevenue)}</div>
          </div>
        </div>

        {/* Total Keuntungan */}
        <div className="bo-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ padding: '14px', backgroundColor: '#fffbeb', color: '#f59e0b', borderRadius: '12px' }}>
            <DollarSign size={28} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>TOTAL KEUNTUNGAN</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111' }}>{formatIDR(totalProfit)}</div>
          </div>
        </div>

        {/* Total Transaksi */}
        <div className="bo-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ padding: '14px', backgroundColor: '#eff6ff', color: '#3b82f6', borderRadius: '12px' }}>
            <FileText size={28} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>TOTAL TRANSAKSI</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111' }}>{totalTransactions} Nota</div>
          </div>
        </div>

        {/* Stok Tipis */}
        <div className="bo-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ padding: '14px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '12px' }}>
            <AlertCircle size={28} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>STOK TIPIS / HABIS</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111' }}>{lowStockItems.length} Produk</div>
          </div>
        </div>
      </div>

      <div className="bo-card" style={{ marginBottom: '0', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <button 
            onClick={() => setActiveTab('sales')}
            style={{ 
              padding: '16px 24px', 
              background: 'none', 
              border: 'none', 
              fontWeight: 'bold',
              fontSize: '15px',
              color: activeTab === 'sales' ? 'var(--primary)' : '#6b7280',
              borderBottom: activeTab === 'sales' ? '3px solid var(--primary)' : '3px solid transparent',
              cursor: 'pointer'
            }}
          >
            Laporan Penjualan
          </button>
          <button 
            onClick={() => setActiveTab('low-stock')}
            style={{ 
              padding: '16px 24px', 
              background: 'none', 
              border: 'none', 
              fontWeight: 'bold',
              fontSize: '15px',
              color: activeTab === 'low-stock' ? '#ef4444' : '#6b7280',
              borderBottom: activeTab === 'low-stock' ? '3px solid #ef4444' : '3px solid transparent',
              cursor: 'pointer'
            }}
          >
            Peringatan Stok Tipis
          </button>
        </div>

        <div className="bo-card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}>
          {activeTab === 'sales' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Filter Area */}
              <div style={{ display: 'flex', gap: '16px', padding: '16px 20px', flexShrink: 0, borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f3f4f6', padding: '8px 12px', borderRadius: '8px', flex: 1, minWidth: '250px' }}>
                  <Search size={18} color="#6b7280" style={{ marginRight: '8px' }} />
                  <input 
                    type="text" 
                    placeholder="Cari nama pelanggan atau ID Transaksi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '14px' }}
                  />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} color="#6b7280" />
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px' }}
                    title="Dari Tanggal"
                  />
                  <span style={{ color: '#6b7280', fontSize: '14px', fontWeight: 'bold' }}>—</span>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px' }}
                    title="Sampai Tanggal"
                  />
                  {(startDate || endDate) && (
                    <button 
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                      style={{ padding: '8px 12px', border: 'none', backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={18} color="#6b7280" />
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', backgroundColor: 'white' }}
                  >
                    <option value="ALL">Semua Metode</option>
                    <option value="TUNAI">TUNAI</option>
                    <option value="QRIS">QRIS</option>
                    <option value="KARTU KREDIT">KARTU KREDIT</option>
                    <option value="KARTU DEBIT">KARTU DEBIT</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Filter size={18} color="#6b7280" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'latest' | 'oldest')}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', backgroundColor: 'white' }}
                  >
                    <option value="latest">Terbaru</option>
                    <option value="oldest">Terlama</option>
                  </select>
                </div>
              </div>

              <div className="bo-table-container">
                {filteredSales.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                    Data penjualan tidak ditemukan.
                  </div>
                ) : (
                  <table className="bo-table">
                    <thead>
                      <tr>
                        <th>ID & WAKTU</th>
                        <th>KASIR</th>
                        <th>PELANGGAN</th>
                        <th>ITEM BELANJA</th>
                        <th>METODE</th>
                        <th>SUBTOTAL & PPN</th>
                        <th>TOTAL BAYAR</th>
                        <th>PROFIT MARGIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale) => (
                        <tr key={sale.id}>
                          <td>
                            <div style={{ fontWeight: 'bold', color: '#111', marginBottom: '4px' }}>{sale.id}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280' }}>
                              <Calendar size={12} />
                              {new Date(sale.date).toLocaleString('id-ID')}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <UserCheck size={14} color="#2563eb" />
                              </div>
                              <div>
                                <div style={{ fontWeight: '700', fontSize: '13px', color: '#1d4ed8' }}>
                                  {sale.employeeName || 'Tidak Diketahui'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>ID: {sale.employeeId || '-'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <User size={14} color="#6b7280" />
                              </div>
                              <span style={{ fontWeight: '600', color: sale.customerName === 'Umum (Guest)' ? '#9ca3af' : '#1f2937' }}>
                                {sale.customerName}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {sale.items.map((item, i) => (
                                <div key={i} style={{ fontSize: '12px', color: '#4b5563' }}>
                                  • {item.name} <span style={{ color: '#9ca3af' }}>(x{item.qty})</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              fontSize: '11px', 
                              fontWeight: 'bold',
                              backgroundColor: sale.paymentMethod === 'TUNAI' ? '#dcfce7' : '#e0e7ff',
                              color: sale.paymentMethod === 'TUNAI' ? '#166534' : '#3730a3'
                            }}>
                              {sale.paymentMethod}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '13px', color: '#374151' }}>Sub: {formatIDR(sale.subtotal)}</div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>PPN: {formatIDR(sale.tax)}</div>
                          </td>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '14px' }}>
                            {formatIDR(sale.total)}
                          </td>
                          <td>
                            <span style={{ 
                              padding: '6px 10px', 
                              borderRadius: '6px',
                              backgroundColor: sale.profitMargin > 0 ? '#ecfdf5' : '#fef2f2',
                              color: sale.profitMargin > 0 ? '#059669' : '#dc2626',
                              fontWeight: 'bold',
                              fontSize: '13px',
                              display: 'inline-block'
                            }}>
                              {sale.profitMargin > 0 ? '+' : ''}{formatIDR(sale.profitMargin)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'low-stock' && (
            <div className="bo-table-container">
              {lowStockItems.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  Semua stok produk dalam kondisi aman.
                </div>
              ) : (
                <table className="bo-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>NAMA PRODUK</th>
                      <th>KATEGORI</th>
                      <th>STOK TERSEDIA</th>
                      <th>BATAS MINIMUM</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.map((p) => {
                      const available = p.stock - (p.reserved || 0);
                      const min = p.minStock ?? 10;
                      return (
                        <tr key={p.id}>
                          <td>{p.sku}</td>
                          <td style={{ fontWeight: 'bold' }}>{p.name}</td>
                          <td><span className="bo-badge bo-badge-gray">{p.category}</span></td>
                          <td style={{ fontWeight: 'bold', fontSize: '16px' }}>{available} {p.unit}</td>
                          <td>{min} {p.unit}</td>
                          <td>
                            <span style={{ 
                              padding: '6px 10px', 
                              borderRadius: '6px', 
                              fontSize: '12px', 
                              fontWeight: 'bold',
                              backgroundColor: available <= 0 ? '#fef2f2' : '#fffbeb',
                              color: available <= 0 ? '#ef4444' : '#d97706',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <AlertCircle size={14} />
                              {available <= 0 ? 'STOK HABIS' : 'STOK TIPIS'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
