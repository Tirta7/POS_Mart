import React, { useState, useEffect, useMemo } from 'react';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useSalesStore } from '../../store/useSalesStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import { getSocket } from '../../utils/socket';
import { 
  Plus, Search, Edit2, Trash2, X, ShoppingBag, Eye, RefreshCw, 
  Users, ShoppingCart, DollarSign, Store, Calendar, User, 
  CheckCircle2
} from 'lucide-react';
import type { Customer, CustomerOrder } from '../../types';
import '../../styles/backoffice.css';

export const CustomerData = () => {
  const { customers, fetchCustomers, addCustomer, updateCustomer, deleteCustomer } = useCustomerStore();
  const { sales, fetchSales } = useSalesStore();
  const { transactions: stockTxs, fetchTransactions } = useInventoryStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'RETAIL' | 'GROSIR' | 'ACTIVE'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'ADD' | 'EDIT'>('ADD');
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer>>({});
  const [isSaving, setIsSaving] = useState(false);

  // View History state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);

  // Auto fetch data on mount & subscribe to Socket.IO real-time events
  useEffect(() => {
    fetchCustomers();
    fetchSales();
    fetchTransactions();

    const socket = getSocket();

    const handleRefreshAll = () => {
      fetchCustomers();
      fetchSales();
      fetchTransactions();
    };

    const handleSaleCompleted = () => {
      fetchCustomers();
      fetchSales();
      fetchTransactions();
    };

    const handleCustomerUpdated = () => {
      fetchCustomers();
      fetchSales();
    };

    socket.on('sale_completed', handleSaleCompleted);
    socket.on('stock_mutation_updated', handleRefreshAll);
    socket.on('customer_orders_updated', handleCustomerUpdated);
    socket.on('data_updated', handleRefreshAll);

    return () => {
      socket.off('sale_completed', handleSaleCompleted);
      socket.off('stock_mutation_updated', handleRefreshAll);
      socket.off('customer_orders_updated', handleCustomerUpdated);
      socket.off('data_updated', handleRefreshAll);
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchCustomers(),
      fetchSales(),
      fetchTransactions()
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Helper untuk menghitung orderan lengkap pelanggan secara cross-reference
  const getCustomerOrders = (customer: Customer | null): CustomerOrder[] => {
    if (!customer) return [];
    const isRetail = (customer.name || '').trim().toLowerCase() === 'retail';
    const directOrders = customer.orders || [];

    // Orders dari sales store
    const salesOrders: CustomerOrder[] = sales
      .filter(s => {
        if (s.customerId && s.customerId === customer.id) return true;
        if (s.customerName && s.customerName.trim().toLowerCase() === (customer.name || '').trim().toLowerCase()) return true;
        if (isRetail && (!s.customerId || s.customerName === 'Umum (Guest)' || (s.customerName || '').trim().toLowerCase() === 'retail')) {
          return true;
        }
        return false;
      })
      .map(s => ({
        orderId: s.id,
        date: s.date,
        total: s.total,
        paymentMethod: s.paymentMethod,
        cashier: s.employeeName,
        items: (s.items || []).map(i => ({
          productId: i.productId,
          name: i.name,
          qty: i.qty,
          price: i.price,
          subtotal: i.subtotal
        }))
      }));

    // Orders dari stock mutation (OUT)
    const stockOrders: CustomerOrder[] = stockTxs
      .filter((st: any) => {
        if (st.type !== 'OUT') return false;
        if (st.customer_id && st.customer_id === customer.id) return true;
        if (st.customer_name && st.customer_name.trim().toLowerCase() === (customer.name || '').trim().toLowerCase()) return true;
        if (isRetail && (!st.customer_id || st.customer_name === 'Umum (Guest)' || (st.customer_name || '').trim().toLowerCase() === 'retail')) {
          return true;
        }
        return false;
      })
      .map((st: any) => ({
        orderId: st.document_no || st.documentNo || st.id,
        date: st.date || st.created_at,
        total: Number(st.total_value || st.totalValue || 0),
        paymentMethod: 'TUNAI',
        cashier: st.employee_id || 'Kasir',
        items: (st.items || []).map((i: any) => ({
          productId: i.product_id || i.productId,
          name: i.product?.name || i.name || 'Produk',
          qty: i.qty || i.quantity || 1,
          price: Number(i.purchase_price || i.price || 0),
          subtotal: Number(i.subtotal || 0)
        }))
      }));

    // Deduplikasi berdasar orderId/nota
    const map = new Map<string, CustomerOrder>();

    for (const ord of directOrders) {
      if (ord.orderId) map.set(ord.orderId.trim(), ord);
    }

    for (const ord of salesOrders) {
      if (ord.orderId) {
        const key = ord.orderId.trim();
        const existing = map.get(key);
        if (!existing || (ord.items && ord.items.length > (existing.items?.length || 0))) {
          map.set(key, ord);
        }
      }
    }

    for (const ord of stockOrders) {
      if (ord.orderId) {
        const key = ord.orderId.trim();
        if (!map.has(key)) {
          map.set(key, ord);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Hitung total belanja pelanggan
  const getCustomerTotalSpent = (customer: Customer): number => {
    const orders = getCustomerOrders(customer);
    return orders.reduce((sum, o) => sum + (o.total || 0), 0);
  };

  // Ringkasan KPI di atas tabel
  const metrics = useMemo(() => {
    let totalCustomers = customers.length;
    let totalOrdersCount = 0;
    let totalSpentAll = 0;
    let retailOrdersCount = 0;
    let retailSpent = 0;
    let wholesaleOrdersCount = 0;
    let wholesaleSpent = 0;

    customers.forEach(c => {
      const orders = getCustomerOrders(c);
      const spent = orders.reduce((acc, o) => acc + (o.total || 0), 0);
      totalOrdersCount += orders.length;
      totalSpentAll += spent;

      if ((c.name || '').trim().toLowerCase() === 'retail') {
        retailOrdersCount += orders.length;
        retailSpent += spent;
      } else {
        wholesaleOrdersCount += orders.length;
        wholesaleSpent += spent;
      }
    });

    return {
      totalCustomers,
      totalOrdersCount,
      totalSpentAll,
      retailOrdersCount,
      retailSpent,
      wholesaleOrdersCount,
      wholesaleSpent
    };
  }, [customers, sales, stockTxs]);

  const filteredCustomers = customers.filter(c => {
    const isRetail = (c.name || '').trim().toLowerCase() === 'retail';
    const orders = getCustomerOrders(c);

    // Tab filter
    if (filterTab === 'RETAIL' && !isRetail) return false;
    if (filterTab === 'GROSIR' && isRetail) return false;
    if (filterTab === 'ACTIVE' && orders.length === 0) return false;

    // Search filter
    const q = searchTerm.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCustomer.name || !currentCustomer.name.trim()) {
      alert('Nama pelanggan wajib diisi!');
      return;
    }

    setIsSaving(true);
    try {
      if (modalMode === 'ADD') {
        await addCustomer({
          id: currentCustomer.id?.trim() || ('CUST-' + Date.now().toString()),
          name: currentCustomer.name.trim(),
          phone: currentCustomer.phone?.trim() || '',
          address: currentCustomer.address?.trim() || '',
          orders: []
        });
      } else if (modalMode === 'EDIT' && currentCustomer.id) {
        await updateCustomer(currentCustomer as Customer);
      }
      setIsModalOpen(false);
      setCurrentCustomer({});
    } catch (err: any) {
      alert(`Gagal menyimpan data pelanggan: ${err?.message || 'Terjadi kesalahan pada sistem'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    } catch {
      return isoString;
    }
  };

  const activeOrdersForView = useMemo(() => {
    return viewCustomer ? getCustomerOrders(viewCustomer) : [];
  }, [viewCustomer, customers, sales, stockTxs]);

  return (
    <div className="bo-container">
      {/* HEADER SECTION */}
      <div className="bo-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 className="bo-page-title" style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#111827' }}>
            Data Pelanggan & Rekap Order
          </h1>
          <p className="bo-page-subtitle" style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
            Kelola data pelanggan retail & grosir beserta riwayat transaksi yang terekap otomatis dan akurat.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Real-time Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, border: '1px solid #a7f3d0' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Real-Time Aktif (Socket.IO)
          </div>

          {/* Refresh Button */}
          <button 
            className="bo-btn" 
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', padding: '8px 14px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
          >
            <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
            {isRefreshing ? 'Memuat...' : 'Segarkan'}
          </button>

          {/* Tambah Pelanggan Button */}
          <button 
            className="bo-btn bo-btn-primary" 
            onClick={() => { setModalMode('ADD'); setCurrentCustomer({}); setIsModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--primary, #ef4444)', color: 'white', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            <Plus size={18} /> Tambah Pelanggan
          </button>
        </div>
      </div>

      {/* METRIC / KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Pelanggan</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#111827', marginTop: '2px' }}>{metrics.totalCustomers} <span style={{ fontSize: '13px', fontWeight: 500, color: '#9ca3af' }}>terdaftar</span></div>
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Store size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Orderan Retail (Eceran)</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
              {metrics.retailOrdersCount} <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Order ({formatIDR(metrics.retailSpent)})</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCart size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Orderan Grosir (Partai)</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#d97706', marginTop: '2px' }}>
              {metrics.wholesaleOrdersCount} <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Order ({formatIDR(metrics.wholesaleSpent)})</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#faf5ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Belanja Seluruhnya</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#9333ea', marginTop: '2px' }}>{formatIDR(metrics.totalSpentAll)}</div>
          </div>
        </div>
      </div>

      {/* MAIN CARD: SEARCH, FILTER, AND TABLE */}
      <div className="bo-card" style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        
        {/* FILTER BAR */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setFilterTab('ALL')}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: filterTab === 'ALL' ? 'var(--primary, #ef4444)' : '#f3f4f6',
                color: filterTab === 'ALL' ? 'white' : '#4b5563'
              }}
            >
              Semua ({customers.length})
            </button>
            <button 
              onClick={() => setFilterTab('RETAIL')}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: filterTab === 'RETAIL' ? 'var(--primary, #ef4444)' : '#f3f4f6',
                color: filterTab === 'RETAIL' ? 'white' : '#4b5563'
              }}
            >
              Khusus Retail
            </button>
            <button 
              onClick={() => setFilterTab('GROSIR')}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: filterTab === 'GROSIR' ? 'var(--primary, #ef4444)' : '#f3f4f6',
                color: filterTab === 'GROSIR' ? 'white' : '#4b5563'
              }}
            >
              Pelanggan Grosir
            </button>
            <button 
              onClick={() => setFilterTab('ACTIVE')}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: filterTab === 'ACTIVE' ? 'var(--primary, #ef4444)' : '#f3f4f6',
                color: filterTab === 'ACTIVE' ? 'white' : '#4b5563'
              }}
            >
              Pernah Order
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: '#9ca3af' }} />
            <input 
              type="text" 
              placeholder="Cari nama, telepon, atau alamat..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bo-input"
              style={{ width: '100%', paddingLeft: '38px', height: '38px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
            />
          </div>
        </div>

        {/* TABLE */}
        <div className="bo-table-container" style={{ overflowX: 'auto' }}>
          <table className="bo-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '14px 16px', color: '#4b5563', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>ID</th>
                <th style={{ padding: '14px 16px', color: '#4b5563', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>NAMA PELANGGAN</th>
                <th style={{ padding: '14px 16px', color: '#4b5563', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>TELEPON</th>
                <th style={{ padding: '14px 16px', color: '#4b5563', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>ALAMAT</th>
                <th style={{ padding: '14px 16px', color: '#4b5563', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>TOTAL ORDER</th>
                <th style={{ padding: '14px 16px', color: '#4b5563', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>TOTAL BELANJA</th>
                <th style={{ padding: '14px 16px', color: '#4b5563', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '50px 20px', color: '#6b7280' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <ShoppingBag size={40} style={{ opacity: 0.25 }} />
                      <div style={{ fontSize: '15px', fontWeight: 600 }}>Tidak ada data pelanggan yang sesuai</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af' }}>Coba ubah kata kunci pencarian atau tab filter.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(c => {
                  const orders = getCustomerOrders(c);
                  const totalSpent = getCustomerTotalSpent(c);
                  const isRetail = (c.name || '').trim().toLowerCase() === 'retail';

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background-color 0.15s' }}>
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#6b7280' }}>
                        <span title={c.id}>
                          {c.id.length > 16 ? `${c.id.substring(0, 10)}...${c.id.slice(-4)}` : c.id}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: isRetail ? '#dc2626' : '#111827' }}>
                            {c.name}
                          </span>
                          {isRetail ? (
                            <span style={{ fontSize: '11px', fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.3px' }}>
                              RETAIL (ECERAN)
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', fontWeight: 700, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.3px' }}>
                              GROSIR
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>
                        {c.phone && c.phone !== '0' ? c.phone : <span style={{ color: '#9ca3af' }}>-</span>}
                      </td>

                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#4b5563', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.address ? c.address : <span style={{ color: '#9ca3af' }}>-</span>}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: orders.length > 0 ? '#eff6ff' : '#f3f4f6',
                          color: orders.length > 0 ? '#1d4ed8' : '#6b7280',
                          border: orders.length > 0 ? '1px solid #bfdbfe' : '1px solid #e5e7eb'
                        }}>
                          {orders.length} Order
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '14px', fontWeight: 800, color: totalSpent > 0 ? '#059669' : '#9ca3af' }}>
                        {formatIDR(totalSpent)}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          {/* Tombol Lihat Riwayat Order */}
                          <button 
                            onClick={() => { setViewCustomer(c); setHistoryModalOpen(true); }}
                            style={{
                              background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                              padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex',
                              alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600
                            }}
                            title="Lihat Riwayat & Detail Belanja"
                          >
                            <Eye size={15} />
                            <span>Riwayat</span>
                          </button>

                          {/* Tombol Edit */}
                          <button 
                            onClick={() => { setModalMode('EDIT'); setCurrentCustomer(c); setIsModalOpen(true); }}
                            style={{
                              background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
                              padding: '6px 8px', borderRadius: '6px', cursor: 'pointer'
                            }}
                            title="Edit Data"
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* Tombol Hapus (tidak bisa hapus default Retail) */}
                          {!isRetail && (
                            <button 
                              onClick={() => { 
                                if (window.confirm(`Hapus data pelanggan "${c.name}"?`)) {
                                  deleteCustomer(c.id).catch((err: any) => {
                                    alert(`Gagal menghapus: ${err?.message || 'Terjadi kesalahan'}`);
                                  });
                                }
                              }}
                              style={{
                                background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca',
                                padding: '6px 8px', borderRadius: '6px', cursor: 'pointer'
                              }}
                              title="Hapus Pelanggan"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM PELANGGAN (TAMBAH / EDIT) */}
      {isModalOpen && (
        <div className="r-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="r-modal" style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '440px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                {modalMode === 'ADD' ? 'Tambah Pelanggan Baru' : 'Edit Pelanggan'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4b5563', marginBottom: '6px' }}>ID PELANGGAN</label>
                <input 
                  type="text" 
                  required
                  placeholder="Misal: PLG-001"
                  disabled={modalMode === 'EDIT'}
                  value={currentCustomer.id || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, id: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', backgroundColor: modalMode === 'EDIT' ? '#f3f4f6' : 'white', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4b5563', marginBottom: '6px' }}>NAMA LENGKAP</label>
                <input 
                  type="text" 
                  required
                  placeholder="Nama Pelanggan atau Toko"
                  value={currentCustomer.name || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4b5563', marginBottom: '6px' }}>NO. TELEPON / WA</label>
                <input 
                  type="text" 
                  required
                  placeholder="Contoh: 08123456789"
                  value={currentCustomer.phone || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4b5563', marginBottom: '6px' }}>ALAMAT</label>
                <textarea 
                  rows={3}
                  placeholder="Alamat domisili atau alamat kirim..."
                  value={currentCustomer.address || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, address: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', resize: 'none', fontSize: '14px' }}
                />
              </div>

              <button 
                type="submit" 
                disabled={isSaving}
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  background: isSaving ? '#9ca3af' : 'var(--primary, #ef4444)', 
                  color: 'white', 
                  fontWeight: 700, 
                  border: 'none', 
                  borderRadius: '8px', 
                  cursor: isSaving ? 'not-allowed' : 'pointer', 
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isSaving ? 'Menyimpan ke Database...' : 'Simpan Data Pelanggan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RIWAYAT TRANSAKSI & DETAIL BARANG PERNAH ORDER */}
      {historyModalOpen && viewCustomer && (
        <div className="r-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="r-modal" style={{ background: 'white', padding: '0', borderRadius: '14px', width: '850px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            
            {/* MODAL HEADER */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#111827' }}>
                    Riwayat Transaksi Pelanggan
                  </h3>
                  {(viewCustomer.name || '').trim().toLowerCase() === 'retail' ? (
                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '999px' }}>
                      RETAIL / ECERAN
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '999px' }}>
                      PELANGGAN GROSIR
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', fontSize: '13px', color: '#4b5563' }}>
                  <span style={{ fontWeight: 700, color: 'var(--primary, #ef4444)' }}>{viewCustomer.name}</span>
                  {viewCustomer.phone && viewCustomer.phone !== '0' && <span>• Telp: {viewCustomer.phone}</span>}
                  {viewCustomer.address && <span>• {viewCustomer.address}</span>}
                </div>
              </div>

              <button 
                onClick={() => setHistoryModalOpen(false)} 
                style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#4b5563' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* SUMMARY STATS BAR DALAM MODAL */}
            <div style={{ padding: '14px 24px', background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>Total Transaksi:</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#111827' }}>{activeOrdersForView.length} Transaksi</span>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>Total Pembelian:</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>
                    {formatIDR(activeOrdersForView.reduce((sum, o) => sum + (o.total || 0), 0))}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} color="#059669" />
                Semua item dan nominal terekap lengkap dari database & kasir
              </div>
            </div>
            
            {/* LIST DAFTAR ORDER */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {activeOrdersForView.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '60px 20px' }}>
                  <ShoppingBag size={54} style={{ opacity: 0.25, marginBottom: '14px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#374151' }}>Belum ada riwayat transaksi</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
                    Transaksi kasir yang dilakukan oleh pelanggan ini akan otomatis muncul di sini secara real-time.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {activeOrdersForView.map((order, orderIdx) => {
                    const orderTotal = order.total || order.items.reduce((s, it) => s + (it.subtotal || 0), 0);

                    return (
                      <div 
                        key={order.orderId || orderIdx} 
                        style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                      >
                        {/* ORDER CARD HEADER */}
                        <div style={{ background: '#f9fafb', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: '#111827', fontSize: '14px', background: '#e5e7eb', padding: '3px 8px', borderRadius: '6px' }}>
                              #{order.orderId}
                            </span>
                            <span style={{ fontSize: '13px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={14} color="#6b7280" />
                              {formatDate(order.date)}
                            </span>
                            {order.cashier && (
                              <span style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <User size={14} /> {order.cashier}
                              </span>
                            )}
                            {order.paymentMethod && (
                              <span style={{ fontSize: '11px', fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px' }}>
                                {order.paymentMethod}
                              </span>
                            )}
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '11px', color: '#6b7280', display: 'block' }}>Total Transaksi</span>
                            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary, #ef4444)' }}>
                              {formatIDR(orderTotal)}
                            </span>
                          </div>
                        </div>

                        {/* ORDER ITEMS TABLE */}
                        <div style={{ padding: '14px 18px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Daftar Barang yang Dipesan ({order.items?.length || 0} Item):
                          </div>

                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                                <th style={{ padding: '6px 8px', width: '36px' }}>No</th>
                                <th style={{ padding: '6px 8px' }}>Nama Produk</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', width: '80px' }}>Qty</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', width: '130px' }}>Harga Satuan</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', width: '140px' }}>Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(!order.items || order.items.length === 0) ? (
                                <tr>
                                  <td colSpan={5} style={{ padding: '10px 8px', textAlign: 'center', color: '#9ca3af' }}>
                                    Item tidak tertera secara rinci pada dokumen ini
                                  </td>
                                </tr>
                              ) : (
                                order.items.map((item, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f9fafb' }}>
                                    <td style={{ padding: '8px', color: '#9ca3af' }}>{idx + 1}</td>
                                    <td style={{ padding: '8px', fontWeight: 600, color: '#111827' }}>
                                      {item.name}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>
                                      {item.qty} Pcs
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', color: '#4b5563' }}>
                                      {formatIDR(item.price)}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>
                                      {formatIDR(item.subtotal || (item.price * item.qty))}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: '2px solid #f3f4f6', background: '#fafafa' }}>
                                <td colSpan={4} style={{ padding: '8px', fontWeight: 700, textAlign: 'right', color: '#374151' }}>
                                  Total Nilai Belanja:
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: 'var(--primary, #ef4444)', fontSize: '14px' }}>
                                  {formatIDR(orderTotal)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setHistoryModalOpen(false)}
                style={{ padding: '8px 20px', background: '#4b5563', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Tutup
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
