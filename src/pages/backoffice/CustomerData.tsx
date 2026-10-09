import React, { useState, useEffect, useMemo } from 'react';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useSalesStore } from '../../store/useSalesStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import { getSocket } from '../../utils/socket';
import { 
  Plus, Search, Edit2, Trash2, X, ShoppingBag, Eye, RefreshCw, 
  Users, ShoppingCart, DollarSign, Store, Calendar, User, 
  CheckCircle2, Phone, MapPin, Copy, Check, MessageSquare,
  LayoutList, LayoutGrid
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Desktop view switch: table or card grid
  const [desktopViewMode, setDesktopViewMode] = useState<'table' | 'grid'>('table');

  // Screen width state for clean desktop/mobile separation
  const [isMobileScreen, setIsMobileScreen] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  }, [fetchCustomers, fetchSales, fetchTransactions]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchCustomers(),
      fetchSales(),
      fetchTransactions()
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'C';
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
      { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
      { bg: '#fef3c7', text: '#d97706', border: '#fde68a' },
      { bg: '#faf5ff', text: '#9333ea', border: '#e9d5ff' },
      { bg: '#fff1f2', text: '#e11d48', border: '#fecaca' },
      { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
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
        items: s.items.map(it => ({
          productId: it.productId,
          name: it.name,
          qty: it.qty,
          price: it.price,
          subtotal: it.subtotal || (it.price * it.qty)
        }))
      }));

    // Orders dari stock mutation store
    const stockOutOrders: CustomerOrder[] = stockTxs
      .filter(st => {
        if (st.type !== 'OUT') return false;
        if (st.customerId && st.customerId === customer.id) return true;
        if (st.customerName && st.customerName.trim().toLowerCase() === (customer.name || '').trim().toLowerCase()) return true;
        if (isRetail && (!st.customerId || st.customerName === 'Umum (Guest)' || (st.customerName || '').trim().toLowerCase() === 'retail' || st.note === 'Penjualan Kasir')) {
          return true;
        }
        return false;
      })
      .map(st => ({
        orderId: st.documentNo || st.id,
        date: st.date,
        total: st.totalValue || (st.items ? st.items.reduce((sum, it) => sum + (it.subtotal || 0), 0) : 0),
        paymentMethod: 'Mutasi Kasir',
        cashier: st.employeeId || 'Sistem',
        items: (st.items || []).map(it => ({
          productId: it.productId,
          name: it.productName || it.productId,
          qty: Math.abs(it.qty),
          price: it.purchasePrice || 0,
          subtotal: it.subtotal || 0
        }))
      }));

    // Gabungkan dan deduplikasi berdasarkan orderId
    const mergedMap = new Map<string, CustomerOrder>();
    [...directOrders, ...salesOrders, ...stockOutOrders].forEach(ord => {
      const existing = mergedMap.get(ord.orderId);
      if (!existing) {
        mergedMap.set(ord.orderId, ord);
      } else {
        mergedMap.set(ord.orderId, {
          ...existing,
          total: Math.max(existing.total || 0, ord.total || 0),
          items: (existing.items && existing.items.length > 0) ? existing.items : (ord.items || [])
        });
      }
    });

    return Array.from(mergedMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getCustomerTotalSpent = (customer: Customer): number => {
    const orders = getCustomerOrders(customer);
    return orders.reduce((sum, o) => sum + (o.total || 0), 0);
  };

  // Metrik KPI
  const metrics = useMemo(() => {
    let retailSpent = 0;
    let retailOrdersCount = 0;
    let wholesaleSpent = 0;
    let wholesaleOrdersCount = 0;

    customers.forEach(c => {
      const isRetail = (c.name || '').trim().toLowerCase() === 'retail';
      const orders = getCustomerOrders(c);
      const spent = orders.reduce((sum, o) => sum + (o.total || 0), 0);

      if (isRetail) {
        retailSpent += spent;
        retailOrdersCount += orders.length;
      } else {
        wholesaleSpent += spent;
        wholesaleOrdersCount += orders.length;
      }
    });

    const totalSpentAll = retailSpent + wholesaleSpent;

    return {
      totalCustomers: customers.length,
      retailSpent,
      retailOrdersCount,
      wholesaleSpent,
      wholesaleOrdersCount,
      totalSpentAll
    };
  }, [customers, sales, stockTxs]);

  // Filter & Search Pelanggan
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    if (filterTab === 'RETAIL') {
      result = result.filter(c => (c.name || '').trim().toLowerCase() === 'retail');
    } else if (filterTab === 'GROSIR') {
      result = result.filter(c => (c.name || '').trim().toLowerCase() !== 'retail');
    } else if (filterTab === 'ACTIVE') {
      result = result.filter(c => getCustomerOrders(c).length > 0);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c => 
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [customers, filterTab, searchTerm, sales, stockTxs]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCustomer.name || !currentCustomer.id) {
      alert('Nama dan ID Pelanggan wajib diisi!');
      return;
    }

    setIsSaving(true);
    try {
      if (modalMode === 'ADD') {
        const payload: Customer = {
          id: currentCustomer.id.trim(),
          name: currentCustomer.name.trim(),
          phone: currentCustomer.phone?.trim() || '',
          address: currentCustomer.address?.trim() || '',
          orders: []
        };
        await addCustomer(payload);
      } else {
        await updateCustomer(currentCustomer as Customer);
      }
      setIsModalOpen(false);
      fetchCustomers();
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
    <div className="bo-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* =====================================================================
          1. HEADER SECTION (DESKTOP & MOBILE COHERENT)
          ===================================================================== */}
      <div className="bo-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '14px', flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title" style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>
            Data Pelanggan & Rekap Order
          </h1>
          <p className="bo-page-subtitle" style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13.5px' }}>
            Kelola data pelanggan retail & grosir beserta riwayat transaksi yang terekap otomatis dan akurat.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Real-time Indicator */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: '#ecfdf5', color: '#059669', padding: '6px 14px',
            borderRadius: '999px', fontSize: '12.5px', fontWeight: 700,
            border: '1px solid #a7f3d0'
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            <span>Real-Time Aktif (Socket.IO)</span>
          </div>

          {/* Refresh Button */}
          <button 
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: '#ffffff', color: '#334155', border: '1px solid #cbd5e1',
              padding: '8px 14px', borderRadius: '10px', fontWeight: 700,
              fontSize: '13px', cursor: isRefreshing ? 'wait' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>{isRefreshing ? 'Memuat...' : 'Segarkan'}</span>
          </button>

          {/* Tambah Pelanggan Button */}
          <button 
            type="button"
            onClick={() => { setModalMode('ADD'); setCurrentCustomer({}); setIsModalOpen(true); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: '#dc2626', color: 'white', padding: '8px 18px',
              borderRadius: '10px', fontWeight: 700, fontSize: '13px',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(220,38,38,0.25)'
            }}
          >
            <Plus size={16} />
            <span>Tambah Pelanggan</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. KPI METRIC CARDS (4 KOLOM DESKTOP)
          ===================================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px', flexShrink: 0 }}>
        
        {/* Metric 1 */}
        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px',
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Pelanggan</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
              {metrics.totalCustomers} <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>terdaftar</span>
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px',
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#ecfdf5', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Store size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Orderan Retail (Eceran)</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#16a34a', marginTop: '2px' }}>
              {metrics.retailOrdersCount} <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Order ({formatIDR(metrics.retailSpent)})</span>
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px',
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShoppingCart size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Orderan Grosir (Partai)</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#d97706', marginTop: '2px' }}>
              {metrics.wholesaleOrdersCount} <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Order ({formatIDR(metrics.wholesaleSpent)})</span>
            </div>
          </div>
        </div>

        {/* Metric 4 */}
        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px',
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#faf5ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <DollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Belanja Seluruhnya</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#9333ea', marginTop: '2px' }}>
              {formatIDR(metrics.totalSpentAll)}
            </div>
          </div>
        </div>

      </div>

      {/* =====================================================================
          3. MAIN CONTENT CONTAINER (FILTER TOOLBAR & DATA PRESENTATION)
          ===================================================================== */}
      <div style={{
        background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0
      }}>
        
        {/* FILTER TOOLBAR */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: '#ffffff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', flexShrink: 0
        }}>
          {/* Segmented Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
            {([
              { id: 'ALL', label: `Semua (${customers.length})` },
              { id: 'RETAIL', label: 'Khusus Retail' },
              { id: 'GROSIR', label: 'Pelanggan Grosir' },
              { id: 'ACTIVE', label: 'Pernah Order' }
            ] as const).map(tab => {
              const isActive = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: isActive ? 800 : 600,
                    border: 'none', cursor: 'pointer',
                    background: isActive ? '#dc2626' : 'transparent',
                    color: isActive ? '#ffffff' : '#475569',
                    boxShadow: isActive ? '0 1px 3px rgba(220,38,38,0.2)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right Toolbar: Search & Desktop View Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Search Box */}
            <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder="Cari nama, telepon, atau alamat..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%', paddingLeft: '36px', paddingRight: searchTerm ? '32px' : '12px',
                  height: '38px', borderRadius: '10px', border: '1px solid #cbd5e1',
                  fontSize: '13px', color: '#0f172a', background: '#ffffff'
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* View Switch on Desktop (Table vs Grid) */}
            {!isMobileScreen && (
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                <button
                  type="button"
                  onClick={() => setDesktopViewMode('table')}
                  style={{
                    border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                    background: desktopViewMode === 'table' ? '#ffffff' : 'transparent',
                    color: desktopViewMode === 'table' ? '#0f172a' : '#64748b',
                    boxShadow: desktopViewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700
                  }}
                  title="Tampilan Tabel"
                >
                  <LayoutList size={15} />
                  <span>Tabel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopViewMode('grid')}
                  style={{
                    border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                    background: desktopViewMode === 'grid' ? '#ffffff' : 'transparent',
                    color: desktopViewMode === 'grid' ? '#0f172a' : '#64748b',
                    boxShadow: desktopViewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700
                  }}
                  title="Tampilan Kartu"
                >
                  <LayoutGrid size={15} />
                  <span>Kartu</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* =====================================================================
            VIEW 1: DESKTOP TABLE VIEW (DEFAULT UNTUK LAYAR DESKTOP / MAC)
            ===================================================================== */}
        {!isMobileScreen && desktopViewMode === 'table' && (
          <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                  <th style={{ padding: '12px 18px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '180px' }}>ID PELANGGAN</th>
                  <th style={{ padding: '12px 18px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PELANGGAN</th>
                  <th style={{ padding: '12px 18px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '170px' }}>KONTAK / WHATSAPP</th>
                  <th style={{ padding: '12px 18px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', maxWidth: '240px' }}>ALAMAT</th>
                  <th style={{ padding: '12px 18px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '130px' }}>TOTAL ORDER</th>
                  <th style={{ padding: '12px 18px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '170px' }}>TOTAL BELANJA</th>
                  <th style={{ padding: '12px 18px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '170px' }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <ShoppingBag size={44} style={{ opacity: 0.2 }} />
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Tidak ada data pelanggan yang sesuai</div>
                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>Coba ubah kata kunci pencarian atau tab filter.</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map(c => {
                    const orders = getCustomerOrders(c);
                    const totalSpent = getCustomerTotalSpent(c);
                    const isRetail = (c.name || '').trim().toLowerCase() === 'retail';
                    const avatarStyle = getAvatarColor(c.name);

                    return (
                      <tr 
                        key={c.id} 
                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* ID Pelanggan dengan Copy Icon */}
                        <td style={{ padding: '14px 18px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: '#f8fafc', padding: '3px 8px', borderRadius: '6px',
                            border: '1px solid #e2e8f0'
                          }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155', fontSize: '11.5px' }}>
                              {c.id.length > 14 ? `${c.id.substring(0, 8)}...${c.id.slice(-4)}` : c.id}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyId(c.id)}
                              title="Salin ID Pelanggan"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
                            >
                              {copiedId === c.id ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>

                        {/* Nama Pelanggan + Avatar + Tipe Tag */}
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
                              background: avatarStyle.bg, color: avatarStyle.text, border: `1px solid ${avatarStyle.border}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: '13px', flexShrink: 0
                            }}>
                              {getInitials(c.name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                {c.name}
                              </div>
                              <div style={{ marginTop: '3px' }}>
                                {isRetail ? (
                                  <span style={{ fontSize: '10.5px', fontWeight: 700, background: '#fff1f2', color: '#e11d48', border: '1px solid #fecaca', padding: '1px 8px', borderRadius: '999px' }}>
                                    RETAIL (ECERAN)
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '10.5px', fontWeight: 700, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 8px', borderRadius: '999px' }}>
                                    GROSIR
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Kontak & Telepon */}
                        <td style={{ padding: '14px 18px', fontSize: '13px' }}>
                          {c.phone && c.phone !== '0' ? (
                            <a
                              href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Chat WhatsApp"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                                padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                                textDecoration: 'none'
                              }}
                            >
                              <MessageSquare size={13} />
                              <span>{c.phone}</span>
                            </a>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>-</span>
                          )}
                        </td>

                        {/* Alamat */}
                        <td style={{ padding: '14px 18px', fontSize: '13px', maxWidth: '240px' }}>
                          {c.address ? (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }} title={c.address}>
                              <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: '2px' }} />
                              <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.address}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>-</span>
                          )}
                        </td>

                        {/* Total Order */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => { setViewCustomer(c); setHistoryModalOpen(true); }}
                            style={{
                              background: orders.length > 0 ? '#eff6ff' : '#f8fafc',
                              color: orders.length > 0 ? '#2563eb' : '#64748b',
                              border: orders.length > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                              borderRadius: '999px', padding: '3px 12px', fontSize: '12px', fontWeight: 700,
                              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}
                            title="Klik untuk lihat rincian order"
                          >
                            <ShoppingBag size={12} />
                            <span>{orders.length} Order</span>
                          </button>
                        </td>

                        {/* Total Belanja */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontSize: '14px', fontWeight: 900, color: totalSpent > 0 ? '#059669' : '#94a3b8' }}>
                          {formatIDR(totalSpent)}
                        </td>

                        {/* Aksi */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {/* Tombol Lihat Riwayat Order */}
                            <button 
                              type="button"
                              onClick={() => { setViewCustomer(c); setHistoryModalOpen(true); }}
                              style={{
                                background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                                padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex',
                                alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700
                              }}
                              title="Lihat Riwayat & Detail Belanja"
                            >
                              <Eye size={13} />
                              <span>Riwayat</span>
                            </button>

                            {/* Tombol Edit */}
                            <button 
                              type="button"
                              onClick={() => { setModalMode('EDIT'); setCurrentCustomer(c); setIsModalOpen(true); }}
                              style={{
                                background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1',
                                padding: '6px 8px', borderRadius: '8px', cursor: 'pointer'
                              }}
                              title="Edit Data Pelanggan"
                            >
                              <Edit2 size={14} />
                            </button>

                            {/* Tombol Hapus */}
                            {!isRetail && (
                              <button 
                                type="button"
                                onClick={() => { 
                                  if (window.confirm(`Hapus data pelanggan "${c.name}"?`)) {
                                    deleteCustomer(c.id).catch((err: any) => {
                                      alert(`Gagal menghapus: ${err?.message || 'Terjadi kesalahan'}`);
                                    });
                                  }
                                }}
                                style={{
                                  background: '#fff1f2', color: '#e11d48', border: '1px solid #fecaca',
                                  padding: '6px 8px', borderRadius: '8px', cursor: 'pointer'
                                }}
                                title="Hapus Pelanggan"
                              >
                                <Trash2 size={14} />
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
        )}

        {/* =====================================================================
            VIEW 2: DESKTOP GRID CARDS VIEW (OPSIONAL VIA TOGGLE DI DESKTOP)
            ===================================================================== */}
        {!isMobileScreen && desktopViewMode === 'grid' && (
          <div style={{
            width: '100%', flex: 1, minHeight: 0, overflowY: 'auto',
            padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '14px'
          }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                <ShoppingBag size={44} style={{ opacity: 0.2, margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Tidak ada data pelanggan yang sesuai</div>
              </div>
            ) : (
              filteredCustomers.map(c => {
                const orders = getCustomerOrders(c);
                const totalSpent = getCustomerTotalSpent(c);
                const isRetail = (c.name || '').trim().toLowerCase() === 'retail';
                const avatarStyle = getAvatarColor(c.name);

                return (
                  <div
                    key={c.id}
                    style={{
                      background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0',
                      padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)', transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                  >
                    {/* Head */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '50%',
                          background: avatarStyle.bg, color: avatarStyle.text, border: `1px solid ${avatarStyle.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: '13px'
                        }}>
                          {getInitials(c.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>{c.name}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>ID: #{c.id}</div>
                        </div>
                      </div>

                      {isRetail ? (
                        <span style={{ fontSize: '10.5px', fontWeight: 700, background: '#fff1f2', color: '#e11d48', padding: '2px 8px', borderRadius: '999px' }}>
                          RETAIL
                        </span>
                      ) : (
                        <span style={{ fontSize: '10.5px', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '2px 8px', borderRadius: '999px' }}>
                          GROSIR
                        </span>
                      )}
                    </div>

                    {/* Contact & Address */}
                    <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#475569' }}>
                      {c.phone && c.phone !== '0' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={13} color="#2563eb" />
                          <span style={{ fontWeight: 600, color: '#2563eb' }}>{c.phone}</span>
                        </div>
                      )}
                      {c.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={13} color="#94a3b8" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Metrics Box */}
                    <div style={{
                      background: '#f8fafc', borderRadius: '10px', padding: '8px 12px',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', border: '1px solid #f1f5f9'
                    }}>
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>TOTAL ORDER</span>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{orders.length} Order</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>TOTAL BELANJA</span>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#059669' }}>{formatIDR(totalSpent)}</div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '6px' }}>
                      <button
                        type="button"
                        onClick={() => { setViewCustomer(c); setHistoryModalOpen(true); }}
                        style={{
                          flex: 1, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                          padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                          fontSize: '12px', fontWeight: 700
                        }}
                      >
                        <Eye size={13} /> Riwayat
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModalMode('EDIT'); setCurrentCustomer(c); setIsModalOpen(true); }}
                        style={{
                          background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1',
                          padding: '7px 10px', borderRadius: '8px', cursor: 'pointer'
                        }}
                      >
                        <Edit2 size={13} />
                      </button>
                      {!isRetail && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Hapus data pelanggan "${c.name}"?`)) {
                              deleteCustomer(c.id).catch((err: any) => {
                                alert(`Gagal menghapus: ${err?.message || 'Terjadi kesalahan'}`);
                              });
                            }
                          }}
                          style={{
                            background: '#fff1f2', color: '#e11d48', border: '1px solid #fecaca',
                            padding: '7px 10px', borderRadius: '8px', cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* =====================================================================
            VIEW 3: MOBILE CARD FEED (HANYA DITAMPILKAN PADA DEVICE MOBILE)
            ===================================================================== */}
        {isMobileScreen && (
          <div className="customer-mobile-list" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', background: 'white', borderRadius: '16px', border: '0.5px solid rgba(60,60,67,0.12)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <ShoppingBag size={40} style={{ opacity: 0.25 }} />
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>Tidak ada data pelanggan yang sesuai</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>Coba ubah kata kunci pencarian atau tab filter.</div>
                </div>
              </div>
            ) : (
              filteredCustomers.map(c => {
                const orders = getCustomerOrders(c);
                const totalSpent = getCustomerTotalSpent(c);
                const isRetail = (c.name || '').trim().toLowerCase() === 'retail';

                return (
                  <div key={c.id} className="mobile-customer-card" style={{ background: '#ffffff', borderRadius: '16px', padding: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    {/* Card Header: Avatar + Name + Type Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%', background: '#eff6ff',
                        color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <User size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{c.name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>ID: #{c.id.length > 16 ? `${c.id.substring(0, 8)}...${c.id.slice(-4)}` : c.id}</div>
                      </div>
                      {isRetail ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '999px' }}>RETAIL</span>
                      ) : (
                        <span style={{ fontSize: '10px', fontWeight: 700, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '999px' }}>GROSIR</span>
                      )}
                    </div>

                    {/* Contact Info (Phone & Address) */}
                    {(c.phone || c.address) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#475569', marginBottom: '10px' }}>
                        {c.phone && c.phone !== '0' && (
                          <a href={`tel:${c.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                            <Phone size={13} />
                            <span>{c.phone}</span>
                          </a>
                        )}
                        {c.address && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MapPin size={13} color="#94a3b8" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Metrics Box (2-Column Proportional) */}
                    <div style={{
                      background: '#f8fafc', borderRadius: '10px', padding: '8px 12px',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', border: '1px solid #f1f5f9', marginBottom: '12px'
                    }}>
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8' }}>TOTAL ORDER</span>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{orders.length} Order</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8' }}>TOTAL BELANJA</span>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>{formatIDR(totalSpent)}</div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button"
                        onClick={() => { setViewCustomer(c); setHistoryModalOpen(true); }}
                        style={{
                          flex: 1, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                          padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer'
                        }}
                      >
                        <Eye size={14} />
                        <span>Lihat Riwayat</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => { setModalMode('EDIT'); setCurrentCustomer(c); setIsModalOpen(true); }}
                        style={{
                          background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1',
                          padding: '8px 12px', borderRadius: '8px', cursor: 'pointer'
                        }}
                      >
                        <Edit2 size={14} />
                      </button>
                      {!isRetail && (
                        <button 
                          type="button"
                          onClick={() => { 
                            if (window.confirm(`Hapus data pelanggan "${c.name}"?`)) {
                              deleteCustomer(c.id).catch((err: any) => {
                                alert(`Gagal menghapus: ${err?.message || 'Terjadi kesalahan'}`);
                              });
                            }
                          }}
                          style={{
                            background: '#fff1f2', color: '#e11d48', border: '1px solid #fecaca',
                            padding: '8px 12px', borderRadius: '8px', cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>

      {/* =====================================================================
          4. MODAL FORM PELANGGAN (TAMBAH / EDIT)
          ===================================================================== */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#0f172a', color: '#ffffff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                {modalMode === 'ADD' ? 'Tambah Pelanggan Baru' : 'Edit Pelanggan'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff' }}><X size={18} /></button>
            </div>
            
            <form onSubmit={handleSave} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>ID PELANGGAN</label>
                <input 
                  type="text" 
                  required
                  placeholder="Misal: PLG-001"
                  disabled={modalMode === 'EDIT'}
                  value={currentCustomer.id || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, id: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', backgroundColor: modalMode === 'EDIT' ? '#f1f5f9' : '#ffffff', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>NAMA LENGKAP</label>
                <input 
                  type="text" 
                  required
                  placeholder="Nama Pelanggan atau Toko"
                  value={currentCustomer.name || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>NO. TELEPON / WA</label>
                <input 
                  type="text" 
                  required
                  placeholder="Contoh: 08123456789"
                  value={currentCustomer.phone || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>ALAMAT</label>
                <textarea 
                  rows={3}
                  placeholder="Alamat domisili atau alamat kirim..."
                  value={currentCustomer.address || ''}
                  onChange={e => setCurrentCustomer({ ...currentCustomer, address: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'none', fontSize: '13px' }}
                />
              </div>

              <button 
                type="submit" 
                disabled={isSaving}
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  background: isSaving ? '#9ca3af' : '#dc2626', 
                  color: 'white', 
                  fontWeight: 700, 
                  border: 'none', 
                  borderRadius: '10px', 
                  cursor: isSaving ? 'not-allowed' : 'pointer', 
                  fontSize: '13.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Data Pelanggan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. MODAL RIWAYAT TRANSAKSI & DETAIL BARANG PERNAH ORDER
          ===================================================================== */}
      {historyModalOpen && viewCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '850px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            
            {/* MODAL HEADER */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', fontSize: '13px', color: '#475569' }}>
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>{viewCustomer.name}</span>
                  {viewCustomer.phone && viewCustomer.phone !== '0' && <span>• Telp: {viewCustomer.phone}</span>}
                  {viewCustomer.address && <span>• {viewCustomer.address}</span>}
                </div>
              </div>

              <button 
                type="button"
                onClick={() => setHistoryModalOpen(false)} 
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* SUMMARY STATS BAR DALAM MODAL */}
            <div style={{ padding: '12px 24px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 700 }}>Total Transaksi:</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{activeOrdersForView.length} Transaksi</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 700 }}>Total Pembelian:</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#059669' }}>
                    {formatIDR(activeOrdersForView.reduce((sum, o) => sum + (o.total || 0), 0))}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} color="#059669" />
                Semua item dan nominal terekap lengkap dari database kasir
              </div>
            </div>
            
            {/* LIST DAFTAR ORDER */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {activeOrdersForView.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '60px 20px' }}>
                  <ShoppingBag size={48} style={{ opacity: 0.25, marginBottom: '12px' }} />
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Belum ada riwayat transaksi</div>
                  <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '4px' }}>
                    Transaksi kasir yang dilakukan oleh pelanggan ini akan otomatis muncul di sini secara real-time.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {activeOrdersForView.map((order, orderIdx) => {
                    const orderTotal = order.total || order.items.reduce((s, it) => s + (it.subtotal || 0), 0);

                    return (
                      <div 
                        key={order.orderId || orderIdx} 
                        style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                      >
                        {/* ORDER CARD HEADER */}
                        <div style={{ background: '#f8fafc', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', background: '#e2e8f0', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                              #{order.orderId}
                            </span>
                            <span style={{ fontSize: '12.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={13} color="#64748b" />
                              {formatDate(order.date)}
                            </span>
                            {order.cashier && (
                              <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <User size={13} /> {order.cashier}
                              </span>
                            )}
                            {order.paymentMethod && (
                              <span style={{ fontSize: '10.5px', fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px' }}>
                                {order.paymentMethod}
                              </span>
                            )}
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block', fontWeight: 700 }}>Total Transaksi</span>
                            <span style={{ fontSize: '15px', fontWeight: 900, color: '#dc2626' }}>
                              {formatIDR(orderTotal)}
                            </span>
                          </div>
                        </div>

                        {/* ORDER ITEMS TABLE */}
                        <div style={{ padding: '12px 16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                          <table style={{ width: '100%', minWidth: '460px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead>
                              <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase' }}>
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
                                  <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                    <td style={{ padding: '8px', color: '#9ca3af' }}>{idx + 1}</td>
                                    <td style={{ padding: '8px', fontWeight: 600, color: '#0f172a' }}>
                                      {item.name}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                                      {item.qty} Pcs
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>
                                      {formatIDR(item.price)}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                                      {formatIDR(item.subtotal || (item.price * item.qty))}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                style={{ padding: '8px 20px', background: '#334155', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
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
