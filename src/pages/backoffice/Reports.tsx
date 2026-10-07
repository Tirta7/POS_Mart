import React, { useState, useMemo, useEffect } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import ReceiptModal from '../../components/ReceiptModal';
import type { SalesTransaction } from '../../types';
import type { ReceiptOptions } from '../../utils/receipt';
import { FileText, TrendingUp, AlertCircle, Calendar, DollarSign, Search, Filter, CreditCard, CheckCircle2, Printer } from 'lucide-react';

const Reports: React.FC = () => {
  const { sales, fetchSales } = useSalesStore();
  const { products, fetchProducts } = useInventoryStore();
  
  useEffect(() => {
    fetchSales();
    fetchProducts();
    useSupplierStore.getState().fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { customers } = useCustomerStore();
  const { appName, taxEnabled, taxRate } = useSettingsStore();
  const [reprint, setReprint] = useState<{ sale: SalesTransaction; options: ReceiptOptions } | null>(null);
  
  const [activeTab, setActiveTab] = useState<'sales' | 'low-stock' | 'supplier-debts'>('sales');
  
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
    // Create lookup maps for faster access (O(1) instead of O(N))
    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    const productMap = new Map(products.map(p => [p.id, p]));

    return sales.map(sale => {
      // Find customer
      const customerName = sale.customerId ? customerMap.get(sale.customerId) || 'Umum (Guest)' : 'Umum (Guest)';

      // Calculate profit margin
      let totalPurchasePrice = 0;
      sale.items.forEach(item => {
        const product = productMap.get(item.productId);
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
    let result = [...enrichedSales];
    
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
  const totalSubtotal = enrichedSales.reduce((sum, sale) => sum + sale.subtotal, 0);
  const avgPerNota = totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0;
  const marginPct = totalSubtotal ? (totalProfit / totalSubtotal) * 100 : 0;

  // Low Stock Items (stok habis di urutan teratas)
  const lowStockItems = products
    .filter(p => {
      const available = p.stock - (p.reserved || 0);
      const min = p.minStock ?? 10;
      return available <= min;
    })
    .sort((a, b) => (a.stock - (a.reserved || 0)) - (b.stock - (b.reserved || 0)));
  const outOfStockCount = lowStockItems.filter(p => p.stock - (p.reserved || 0) <= 0).length;

  // Total pada data penjualan yang sedang ditampilkan
  const shown = useMemo(() => {
    let qty = 0, sub = 0, tax = 0, total = 0, profit = 0;
    filteredSales.forEach(s => {
      qty += s.items.reduce((x, i) => x + i.qty, 0);
      sub += s.subtotal; tax += s.tax; total += s.total; profit += s.profitMargin;
    });
    return { qty, sub, tax, total, profit };
  }, [filteredSales]);

  const summaryCards = [
    { label: 'TOTAL PENDAPATAN', value: formatIDR(totalRevenue), sub: `rata-rata ${formatIDR(avgPerNota)} / nota`, color: '#10b981', bg: '#ecfdf5', Icon: TrendingUp },
    { label: 'TOTAL KEUNTUNGAN', value: formatIDR(totalProfit), sub: `margin ${marginPct.toFixed(1)}%`, color: '#f59e0b', bg: '#fffbeb', Icon: DollarSign },
    { label: 'TOTAL TRANSAKSI', value: `${totalTransactions} Nota`, sub: `${filteredSales.length} sesuai filter`, color: '#3b82f6', bg: '#eff6ff', Icon: FileText },
    { label: 'STOK TIPIS / HABIS', value: `${lowStockItems.length} Produk`, sub: `${outOfStockCount} habis • ${lowStockItems.length - outOfStockCount} tipis`, color: '#ef4444', bg: '#fef2f2', Icon: AlertCircle },
  ];

  const { suppliers, paySupplierDebt } = useSupplierStore();
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payingSupplier, setPayingSupplier] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);

  // Fetch payment history when opening the tab
  useEffect(() => {
    if (activeTab === 'supplier-debts') {
      fetch('/api/saas/supplier-payments', { headers: { 'x-tenant-id': 'TID-DEMO-123' } })
        .then(res => res.json())
        .then(data => setPaymentHistory(data))
        .catch(console.error);
    }
  }, [activeTab]);

  const handlePaySupplier = async () => {
    if (!payingSupplier || !payAmount) return;
    await paySupplierDebt(payingSupplier, Number(payAmount), payNote);
    alert('Pembayaran berhasil dicatat!');
    setPayingSupplier(null);
    setPayAmount('');
    setPayNote('');
    // Refresh history
    const res = await fetch('/api/saas/supplier-payments', { headers: { 'x-tenant-id': 'TID-DEMO-123' } });
    const data = await res.json();
    setPaymentHistory(data);
  };

  const suppliersWithDebt = suppliers.filter(s => s.totalPayable && s.totalPayable > 0);

  const tabBtn = (id: 'sales' | 'low-stock' | 'supplier-debts', label: string, n: number, activeColor: string): React.ReactNode => {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        style={{
          padding: '12px 20px',
          background: 'none',
          border: 'none',
          fontWeight: 'bold',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: active ? activeColor : '#6b7280',
          borderBottom: active ? `3px solid ${activeColor}` : '3px solid transparent',
          cursor: 'pointer'
        }}
      >
        {label}
        <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', background: active ? activeColor : '#e5e7eb', color: active ? 'white' : '#6b7280' }}>{n}</span>
      </button>
    );
  };

  const emptyState = (title: string, desc: string, icon: React.ReactNode) => (
    <div style={{ padding: '56px 20px', textAlign: 'center', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontWeight: 700, color: '#374151' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#9ca3af', maxWidth: '360px' }}>{desc}</div>
    </div>
  );

  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';

  return (
    <div className="bo-container r-kiosk" style={{ overflowY: 'hidden' }}>
      <style>{`
        .rpt-table th { padding: 9px 14px !important; font-size: 11px !important; letter-spacing: 0.4px; white-space: nowrap; position: sticky; top: 0; z-index: 1; background: #f9fafb; }
        .rpt-table td { padding: 8px 14px !important; font-size: 13px; line-height: 1.35; }
        .rpt-table tbody tr:hover td { background: #f8fafc; }
        .rpt-filter select, .rpt-filter input[type=date], .rpt-filter button { padding: 6px 10px !important; font-size: 13px !important; }
      `}</style>
      <div className="bo-page-header" style={{ marginBottom: '14px', flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title">Laporan & Analitik</h1>
          <p className="bo-page-subtitle">Pantau performa penjualan, pergerakan stok, dan keuntungan toko Anda secara realtime.</p>
        </div>
      </div>

      <div className="r-grid-4 r-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '14px', flexShrink: 0 }}>
        {summaryCards.map(c => (
          <div key={c.label} className="bo-card r-stat" style={{ padding: '12px 16px', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '12px', borderLeft: `4px solid ${c.color}` }}>
            <div className="r-stat-icon" style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, color: c.color, borderRadius: '10px', flexShrink: 0 }}>
              <c.Icon size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="r-stat-label" style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700, letterSpacing: '0.4px' }}>{c.label}</div>
              <div className="r-stat-value" style={{ fontSize: '20px', fontWeight: 800, color: '#111', lineHeight: 1.2 }}>{c.value}</div>
              <div className="r-stat-sub" style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bo-card r-kiosk-card" style={{ marginBottom: '0', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="r-tabs" style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          {tabBtn('sales', 'Laporan Penjualan', filteredSales.length, 'var(--primary)')}
          {tabBtn('low-stock', 'Peringatan Stok Tipis', lowStockItems.length, '#ef4444')}
          {tabBtn('supplier-debts', 'Hutang Supplier', suppliersWithDebt.length, '#f59e0b')}
        </div>

        <div className="bo-card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}>
          {activeTab === 'sales' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Filter Area */}
              <div className="rpt-filter" style={{ display: 'flex', gap: '12px', padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f3f4f6', padding: '7px 12px', borderRadius: '8px', flex: 1, minWidth: '240px' }}>
                  <Search size={16} color="#6b7280" style={{ marginRight: '8px' }} />
                  <input 
                    type="text" 
                    placeholder="Cari nama pelanggan atau ID Transaksi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '13px' }}
                  />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} color="#6b7280" />
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none' }}
                    title="Dari Tanggal"
                  />
                  <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: 'bold' }}>—</span>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none' }}
                    title="Sampai Tanggal"
                  />
                  {(startDate || endDate) && (
                    <button 
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                      style={{ border: 'none', backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={16} color="#6b7280" />
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', backgroundColor: 'white' }}
                  >
                    <option value="ALL">Semua Metode</option>
                    <option value="TUNAI">TUNAI</option>
                    <option value="QRIS">QRIS</option>
                    <option value="KARTU KREDIT">KARTU KREDIT</option>
                    <option value="KARTU DEBIT">KARTU DEBIT</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Filter size={16} color="#6b7280" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'latest' | 'oldest')}
                    style={{ border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', backgroundColor: 'white' }}
                  >
                    <option value="latest">Terbaru</option>
                    <option value="oldest">Terlama</option>
                  </select>
                </div>
              </div>

              <div className="bo-table-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {filteredSales.length === 0 ? (
                  emptyState('Data penjualan tidak ditemukan', 'Coba ubah rentang tanggal, metode pembayaran, atau kata kunci pencarian.', <FileText size={26} color="#9ca3af" />)
                ) : (
                  <table className="bo-table rpt-table r-sheet">
                    <thead>
                      <tr>
                        <th className="r-sheet-name">ID & WAKTU</th>
                        <th>KASIR</th>
                        <th>PELANGGAN</th>
                        <th>ITEM BELANJA</th>
                        <th style={{ textAlign: 'center' }}>QTY</th>
                        <th>METODE</th>
                        <th style={{ textAlign: 'right' }}>SUBTOTAL & PPN</th>
                        <th style={{ textAlign: 'right' }}>TOTAL BAYAR</th>
                        <th style={{ textAlign: 'right' }}>PROFIT MARGIN</th>
                        <th style={{ textAlign: 'center' }}>STRUK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale) => {
                        const itemsText = sale.items.map(i => `${i.name} (x${i.qty})`).join(', ');
                        const totalQty = sale.items.reduce((x, i) => x + i.qty, 0);
                        const shownItems = sale.items.slice(0, 2);
                        const more = sale.items.length - shownItems.length;
                        const cashier = sale.employeeName || 'Tidak Diketahui';
                        const pct = sale.subtotal ? (sale.profitMargin / sale.subtotal) * 100 : 0;
                        const positive = sale.profitMargin > 0;
                        return (
                        <tr key={sale.id}>
                          <td className="r-card-title r-sheet-name" style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: '#111', fontSize: '12.5px' }}>{sale.id}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{new Date(sale.date).toLocaleString('id-ID')}</div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', fontSize: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(cashier)}</span>
                              <div>
                                <div style={{ fontWeight: 600, color: '#1d4ed8', lineHeight: 1.2 }}>{cashier}</div>
                                <div style={{ fontSize: '10.5px', color: '#9ca3af' }}>{sale.employeeId || '-'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontWeight: 600, color: sale.customerName === 'Umum (Guest)' ? '#9ca3af' : '#1f2937' }}>
                            {sale.customerName}
                          </td>
                          <td title={itemsText} style={{ maxWidth: '280px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                              {shownItems.map((it, i) => (
                                <span key={i} style={{ background: '#f3f4f6', color: '#374151', borderRadius: '6px', padding: '1px 7px', fontSize: '11.5px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {it.name} <span style={{ color: '#9ca3af' }}>×{it.qty}</span>
                                </span>
                              ))}
                              {more > 0 && <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700 }}>+{more} lagi</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#374151' }}>{totalQty}</td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '5px', 
                              fontSize: '11px', 
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap',
                              backgroundColor: sale.paymentMethod === 'TUNAI' ? '#dcfce7' : '#e0e7ff',
                              color: sale.paymentMethod === 'TUNAI' ? '#166534' : '#3730a3'
                            }}>
                              {sale.paymentMethod}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'right', color: '#374151' }}>
                            <div>{formatIDR(sale.subtotal)}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>PPN {formatIDR(sale.tax)}</div>
                          </td>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary)', whiteSpace: 'nowrap', textAlign: 'right', fontSize: '14px' }}>
                            {formatIDR(sale.total)}
                          </td>
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', color: positive ? '#059669' : '#dc2626' }}>
                              {positive ? '+' : ''}{formatIDR(sale.profitMargin)}
                            </div>
                            <div style={{ fontSize: '11px', color: positive ? '#34d399' : '#f87171' }}>{pct.toFixed(1)}%</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              title="Cetak ulang struk"
                              onClick={() => setReprint({
                                sale,
                                options: {
                                  storeName: appName,
                                  customerName: sale.customerName === 'Umum (Guest)' ? undefined : sale.customerName,
                                  taxEnabled,
                                  taxRate,
                                },
                              })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              <Printer size={14} /> Cetak
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {filteredSales.length > 0 && (
                <div className="r-summary-bar" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap', padding: '10px 18px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '12px', color: '#6b7280' }}>
                  <span style={{ fontWeight: 700, color: '#374151' }}>Total ditampilkan</span>
                  <span>{filteredSales.length} nota • {shown.qty} item</span>
                  <span>Subtotal: <b style={{ color: '#374151' }}>{formatIDR(shown.sub)}</b></span>
                  <span>PPN: <b style={{ color: '#374151' }}>{formatIDR(shown.tax)}</b></span>
                  <span>Total: <b style={{ color: 'var(--primary)' }}>{formatIDR(shown.total)}</b></span>
                  <span style={{ marginLeft: 'auto' }}>Profit: <b style={{ color: shown.profit > 0 ? '#059669' : '#dc2626' }}>{shown.profit > 0 ? '+' : ''}{formatIDR(shown.profit)}</b></span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'low-stock' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="bo-table-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {lowStockItems.length === 0 ? (
                  emptyState('Semua stok aman', 'Tidak ada produk yang berada di bawah atau sama dengan batas minimum.', <CheckCircle2 size={26} color="#10b981" />)
                ) : (
                  <table className="bo-table rpt-table r-sheet">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th className="r-sheet-name">NAMA PRODUK</th>
                        <th>KATEGORI</th>
                        <th style={{ minWidth: '170px' }}>STOK TERSEDIA</th>
                        <th style={{ textAlign: 'center' }}>BATAS MINIMUM</th>
                        <th style={{ textAlign: 'center' }}>KEKURANGAN</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems.map((p) => {
                        const available = p.stock - (p.reserved || 0);
                        const min = p.minStock ?? 10;
                        const empty = available <= 0;
                        const color = empty ? '#ef4444' : '#d97706';
                        const pct = min > 0 ? Math.max(0, Math.min(100, (available / min) * 100)) : 0;
                        const lack = Math.max(0, min - available);
                        return (
                          <tr key={p.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{p.sku}</td>
                            <td className="r-card-title r-sheet-name" style={{ fontWeight: 600, color: '#111827' }}>{p.name}</td>
                            <td><span className="bo-badge bo-badge-gray" style={{ fontSize: '11px', padding: '2px 9px' }}>{p.category}</span></td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontWeight: 700, color, minWidth: '56px', whiteSpace: 'nowrap' }}>{available} {p.unit}</span>
                                <div style={{ flex: 1, height: '6px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '999px' }} />
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', color: '#6b7280', whiteSpace: 'nowrap' }}>{min} {p.unit}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color, whiteSpace: 'nowrap' }}>{lack > 0 ? `-${lack} ${p.unit}` : '-'}</td>
                            <td>
                              <span style={{ 
                                padding: '2px 9px', 
                                borderRadius: '999px', 
                                fontSize: '11px', 
                                fontWeight: 'bold',
                                whiteSpace: 'nowrap',
                                backgroundColor: empty ? '#fef2f2' : '#fffbeb',
                                color,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <AlertCircle size={12} />
                                {empty ? 'STOK HABIS' : 'STOK TIPIS'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {lowStockItems.length > 0 && (
                <div className="r-summary-bar" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '22px', padding: '10px 18px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '12px', color: '#6b7280' }}>
                  <span style={{ fontWeight: 700, color: '#374151' }}>Ringkasan</span>
                  <span>Habis: <b style={{ color: '#ef4444' }}>{outOfStockCount}</b></span>
                  <span>Tipis: <b style={{ color: '#d97706' }}>{lowStockItems.length - outOfStockCount}</b></span>
                  <span style={{ marginLeft: 'auto' }}>{lowStockItems.length} produk perlu restock</span>
                </div>
              )}
            </div>
          )}

          {/* TAB HUTANG SUPPLIER */}
          {activeTab === 'supplier-debts' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '20px', gap: '24px', overflowY: 'auto' }}>
              
              {/* Payment Modal/Form Inline */}
              {payingSupplier && (
                <div style={{ padding: '20px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#166534', marginBottom: '16px' }}>
                    Lunasi Hutang: {suppliers.find(s => s.id === payingSupplier)?.name}
                  </h3>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#166534', marginBottom: '6px' }}>Jumlah Pembayaran (Rp)</label>
                      <input 
                        type="number" 
                        className="bo-input" 
                        style={{ borderColor: '#bbf7d0', width: '100%' }}
                        value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                        placeholder="Contoh: 500000"
                      />
                    </div>
                    <div style={{ flex: 2, minWidth: '300px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#166534', marginBottom: '6px' }}>Catatan / Referensi</label>
                      <input 
                        type="text" 
                        className="bo-input" 
                        style={{ borderColor: '#bbf7d0', width: '100%' }}
                        value={payNote}
                        onChange={e => setPayNote(e.target.value)}
                        placeholder="Contoh: Transfer BCA, Cicilan 1"
                      />
                    </div>
                    <button 
                      onClick={handlePaySupplier}
                      className="bo-btn"
                      style={{ backgroundColor: '#16a34a', color: 'white', border: 'none' }}
                    >
                      Konfirmasi Pembayaran
                    </button>
                    <button 
                      onClick={() => setPayingSupplier(null)}
                      className="bo-btn bo-btn-secondary"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {/* Daftar Supplier dengan Hutang */}
                <div style={{ flex: '1 1 500px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151', marginBottom: '16px' }}>Daftar Hutang Aktif</h3>
                  {suppliersWithDebt.length === 0 ? (
                    emptyState('Tidak Ada Hutang', 'Saat ini tidak ada hutang tagihan aktif ke supplier.', <CheckCircle2 color="#10b981" />)
                  ) : (
                    <div className="bo-table-container">
                      <table className="bo-table rpt-table" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>SUPPLIER</th>
                            <th>KONTAK</th>
                            <th style={{ textAlign: 'right' }}>TOTAL HUTANG</th>
                            <th style={{ textAlign: 'center' }}>AKSI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {suppliersWithDebt.map(s => (
                            <tr key={s.id}>
                              <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                              <td>{s.contact} ({s.phone})</td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{formatIDR(s.totalPayable || 0)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <button 
                                  onClick={() => {
                                    setPayingSupplier(s.id);
                                    setPayAmount(String(s.totalPayable || 0));
                                  }}
                                  className="bo-btn" 
                                  style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: '#eff6ff', color: '#2563eb', border: 'none' }}
                                >
                                  Bayar Cicil / Lunas
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Riwayat Pembayaran */}
                <div style={{ flex: '1 1 500px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151', marginBottom: '16px' }}>Riwayat Pembayaran</h3>
                  {paymentHistory.length === 0 ? (
                    emptyState('Belum Ada Riwayat', 'Anda belum melakukan pembayaran hutang ke supplier manapun.', <DollarSign color="#9ca3af" />)
                  ) : (
                    <div className="bo-table-container">
                      <table className="bo-table rpt-table" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>TANGGAL</th>
                            <th>SUPPLIER</th>
                            <th style={{ textAlign: 'right' }}>DIBAYARKAN</th>
                            <th>CATATAN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentHistory.map(p => (
                            <tr key={p.id}>
                              <td style={{ fontSize: '12px', color: '#6b7280' }}>
                                {new Date(p.created_at).toLocaleString('id-ID')}
                              </td>
                              <td style={{ fontWeight: 'bold' }}>{p.supplier?.name}</td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                                {formatIDR(p.amount)}
                              </td>
                              <td style={{ fontSize: '12px' }}>{p.note || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {reprint && (
        <ReceiptModal
          sale={reprint.sale}
          options={reprint.options}
          autoPrint={false}
          title="Cetak Ulang Struk"
          printLabel="Cetak Struk"
          onClose={() => setReprint(null)}
        />
      )}
    </div>
  );
};

export default Reports;
