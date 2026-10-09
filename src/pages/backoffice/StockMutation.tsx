import React, { useMemo, useState, useEffect } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSalesStore } from '../../store/useSalesStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import type { StockTransaction } from '../../types';
import { 
  Package, ArrowUp, ArrowDown, RefreshCcw, RefreshCw, 
  Search, FileText, X, User, Truck, Copy, Filter, Download, Check
} from 'lucide-react';
import { getSocket } from '../../utils/socket';
import { exportMasterExcel } from '../../utils/excelExportImport';

type MutType = 'IN' | 'OUT' | 'ADJUSTMENT';

const TYPE_META: Record<MutType, { label: string; color: string; bg: string; border: string; ArrowIcon: React.ElementType }> = {
  IN: { label: 'Masuk', color: '#16a34a', bg: '#ecfdf5', border: '#bbf7d0', ArrowIcon: ArrowDown },
  OUT: { label: 'Keluar', color: '#e11d48', bg: '#fff1f2', border: '#fecaca', ArrowIcon: ArrowUp },
  ADJUSTMENT: { label: 'Penyesuaian', color: '#d97706', bg: '#fffbeb', border: '#fde68a', ArrowIcon: RefreshCcw },
};

const idr = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const formatMutationDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    return `${day} ${time} WIB`;
  } catch {
    return dateStr;
  }
};

const StockMutation: React.FC = () => {
  const { transactions, products, fetchProducts, fetchTransactions } = useInventoryStore();
  const { employees } = useAuthStore();
  const { sales, fetchSales } = useSalesStore();
  const { customers, fetchCustomers } = useCustomerStore();
  const { suppliers, fetchSuppliers } = useSupplierStore();

  const [filterType, setFilterType] = useState<'ALL' | MutType>('ALL');
  const [period, setPeriod] = useState<'ALL' | 'TODAY' | '7D' | '30D'>('ALL');
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Screen detection for true desktop vs mobile separation
  const [isMobileScreen, setIsMobileScreen] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Detail filter modal state
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'highest-qty' | 'highest-val'>('latest');

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchTransactions(),
        fetchProducts(),
        fetchSales(),
        fetchCustomers(),
        fetchSuppliers(),
      ]);
    } catch (err) {
      console.error('Failed to refresh stock mutation data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData();

    const socket = getSocket();
    setSocketConnected(socket.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const handleDataUpdated = (entity?: string) => {
      if (!entity || entity === 'transactions' || entity === 'stock-transactions' || entity === 'sales' || entity === 'products') {
        fetchTransactions();
        fetchProducts();
        fetchSales();
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('data_updated', handleDataUpdated);
    socket.on('sale_completed', handleDataUpdated);
    socket.on('stock_mutation_updated', handleDataUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('data_updated', handleDataUpdated);
      socket.off('sale_completed', handleDataUpdated);
      socket.off('stock_mutation_updated', handleDataUpdated);
    };
  }, [fetchTransactions, fetchProducts, fetchSales]);

  const getProduct = (id: string) => products.find(p => p.id === id);
  const getProductName = (id: string, fallback?: string) => getProduct(id)?.name || fallback || id;
  const getProductSku = (id: string) => getProduct(id)?.sku || id;

  const getEmployeeName = (id: string) => {
    if (id === 'SYSTEM') return 'Sistem';
    return employees.find(e => e.id === id)?.name || id;
  };

  // Pihak terkait (Pelanggan / Supplier)
  type Party = { kind: 'customer' | 'guest' | 'supplier'; name: string; sub?: string };
  const getParty = (t: StockTransaction): Party | null => {
    if (t.type === 'OUT') {
      const sale = sales.find(s => s.id === t.documentNo);
      const customerId = t.customerId || sale?.customerId;
      const customer = customerId ? customers.find(c => c.id === customerId) : undefined;
      const name = t.customerName || customer?.name;
      if (name) return { kind: 'customer', name, sub: customer?.phone || (customerId ? `ID: ${customerId}` : undefined) };
      if (sale || t.note === 'Penjualan Kasir') return { kind: 'guest', name: 'Umum (Guest)', sub: 'Tanpa data pelanggan' };
      return null;
    }
    if (t.supplierId) {
      const sup = suppliers.find(s => s.id === t.supplierId);
      return { kind: 'supplier', name: sup?.name || t.supplierId, sub: sup?.phone };
    }
    return null;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Base filter for period + search query
  const baseFiltered = useMemo(() => {
    const now = new Date();
    const from =
      period === 'TODAY' ? startOfDay(now)
      : period === '7D' ? startOfDay(now) - 6 * 86400000
      : period === '30D' ? startOfDay(now) - 29 * 86400000
      : 0;

    const q = query.trim().toLowerCase();

    return transactions.filter(t => {
      const tTime = new Date(t.date).getTime();
      if (from > 0 && tTime < from) return false;

      // Custom date range from detail modal
      if (filterDateFrom) {
        const fromCustom = new Date(filterDateFrom).getTime();
        if (tTime < fromCustom) return false;
      }
      if (filterDateTo) {
        const toCustom = new Date(filterDateTo).getTime() + 86400000;
        if (tTime > toCustom) return false;
      }

      if (!q) return true;
      const party = getParty(t);
      return (
        t.documentNo.toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q) ||
        (party?.name || '').toLowerCase().includes(q) ||
        (party?.sub || '').toLowerCase().includes(q) ||
        t.items.some(i => 
          (getProduct(i.productId)?.name || i.productName || i.productId).toLowerCase().includes(q) ||
          i.productId.toLowerCase().includes(q)
        )
      );
    });
  }, [transactions, products, period, query, filterDateFrom, filterDateTo, sales, customers, suppliers]);

  // Sorted and type-filtered
  const sorted = useMemo(() => {
    const res = [...baseFiltered].filter(t => filterType === 'ALL' || t.type === filterType);
    
    res.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === 'highest-qty') {
        const qtyA = a.items.reduce((sum, it) => sum + Math.abs(it.qty), 0);
        const qtyB = b.items.reduce((sum, it) => sum + Math.abs(it.qty), 0);
        return qtyB - qtyA;
      }
      if (sortBy === 'highest-val') {
        return (b.totalValue || 0) - (a.totalValue || 0);
      }
      // default: latest
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return res;
  }, [baseFiltered, filterType, sortBy]);

  // Aggregate statistics
  const count = (type: MutType) => baseFiltered.filter(t => t.type === type).length;
  const sumQty = (type: MutType) =>
    baseFiltered.filter(t => t.type === type).reduce((s, t) => s + t.items.reduce((x, i) => x + (type === 'ADJUSTMENT' ? i.qty : Math.abs(i.qty)), 0), 0);

  const totalLines = useMemo(() => {
    return sorted.reduce((sum, t) => sum + t.items.length, 0);
  }, [sorted]);

  const shownTotals = useMemo(() => {
    let inQty = 0, outQty = 0, inVal = 0, outVal = 0;
    sorted.forEach(t => t.items.forEach(i => {
      if (t.type === 'IN') { inQty += Math.abs(i.qty); inVal += i.subtotal || 0; }
      if (t.type === 'OUT') { outQty += Math.abs(i.qty); outVal += i.subtotal || 0; }
    }));
    return { inQty, outQty, inVal, outVal };
  }, [sorted]);

  const chips: { id: 'ALL' | MutType; label: string; n: number; activeColor?: string }[] = [
    { id: 'ALL', label: 'SEMUA', n: baseFiltered.length },
    { id: 'IN', label: 'MASUK', n: count('IN'), activeColor: '#16a34a' },
    { id: 'OUT', label: 'KELUAR', n: count('OUT'), activeColor: '#dc2626' },
    { id: 'ADJUSTMENT', label: 'PENYESUAIAN', n: count('ADJUSTMENT'), activeColor: '#d97706' },
  ];

  // Excel Export Handler
  const handleExportExcel = () => {
    exportMasterExcel({
      storeName: 'HERO PRO SHOP',
      exportedAt: new Date().toISOString(),
      stockTransactions: transactions,
      products,
      transactions: sales,
      suppliers
    }, `Mutasi_Stok_${new Date().toISOString().split('T')[0]}.xlsx`);

    alert('Laporan Mutasi Stok berhasil diekspor ke Excel!');
  };

  return (
    <div 
      className="bo-container" 
      style={isMobileScreen ? {
        overflowY: 'auto', padding: '16px 14px 110px 14px', maxWidth: '780px', margin: '0 auto'
      } : {
        display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'
      }}
    >
      
      {/* =====================================================================
          1. HEADER SECTION (DESKTOP & MOBILE COHERENT)
          ===================================================================== */}
      <div className="bo-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px', flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title" style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>
            Mutasi Stok
          </h1>
          <p className="bo-page-subtitle" style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13.5px' }}>
            Pantau pergerakan stok (Barang Masuk, Keluar, dan Penyesuaian) secara real-time.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Socket.IO status pill */}
          <div style={{
            background: socketConnected ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${socketConnected ? '#a7f3d0' : '#fde68a'}`,
            color: socketConnected ? '#059669' : '#b45309',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: socketConnected ? '#10b981' : '#f59e0b',
              boxShadow: socketConnected ? '0 0 0 2px rgba(16, 185, 129, 0.25)' : 'none'
            }} />
            <span>{socketConnected ? 'Real-Time Aktif (Socket.IO)' : 'Menghubungkan Socket...'}</span>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={refreshData}
            disabled={isRefreshing}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '7px 14px',
              borderRadius: '10px',
              fontSize: '12.5px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isRefreshing ? 'wait' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            Segarkan
          </button>

          {/* On Desktop, Ekspor Excel button is positioned prominently in the header */}
          {!isMobileScreen && (
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '7px 16px',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
              }}
            >
              <Download size={14} />
              Ekspor Excel
            </button>
          )}
        </div>
      </div>

      {/* =====================================================================
          2. SUMMARY METRIC CARDS (4-COLS FULL WIDTH ON DESKTOP)
          ===================================================================== */}
      <div style={isMobileScreen ? {
        display: 'grid',
        gridAutoFlow: 'column',
        gridAutoColumns: 'minmax(148px, 1fr)',
        overflowX: 'auto',
        gap: '10px',
        marginBottom: '14px',
        paddingBottom: '4px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch'
      } : {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '14px',
        marginBottom: '14px',
        flexShrink: 0
      }}>
        {/* Card 1: TOTAL DOKUMEN */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              TOTAL DOKUMEN
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#3b82f6'
            }}>
              <FileText size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
            {baseFiltered.length}
          </div>
          <span style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '6px' }}>
            mutasi tercatat
          </span>
        </div>

        {/* Card 2: BARANG MASUK */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              BARANG MASUK
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#10b981'
            }}>
              <ArrowDown size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', lineHeight: 1 }}>
            +{sumQty('IN')}
          </div>
          <span style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '6px' }}>
            {count('IN')} dokumen
          </span>
        </div>

        {/* Card 3: BARANG KELUAR */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#e11d48', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              BARANG KELUAR
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#e11d48'
            }}>
              <ArrowUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#dc2626', lineHeight: 1 }}>
            -{sumQty('OUT')}
          </div>
          <span style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '6px' }}>
            {count('OUT')} dokumen
          </span>
        </div>

        {/* Card 4: PENYESUAIAN */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              PENYESUAIAN
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#d97706'
            }}>
              <RefreshCcw size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#b45309', lineHeight: 1 }}>
            {sumQty('ADJUSTMENT')}
          </div>
          <span style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '6px' }}>
            {count('ADJUSTMENT')} dokumen
          </span>
        </div>
      </div>

      {/* =====================================================================
          3. MAIN CONTENT: DESKTOP TABLE VIEW vs MOBILE NATIVE CARDS
          ===================================================================== */}
      {!isMobileScreen ? (
        /* ===================================================================
           DESKTOP VIEW: FULL-WIDTH COMPREHENSIVE DATA TABLE (MODE DESKTOP)
           =================================================================== */
        <div className="desktop-table-view" style={{
          background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0
        }}>
          
          {/* DESKTOP TOOLBAR */}
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: '#ffffff',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', flexShrink: 0
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder="Cari no. dokumen, produk, SKU, pelanggan..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%', paddingLeft: '36px', paddingRight: query ? '32px' : '12px',
                  height: '38px', borderRadius: '10px', border: '1px solid #cbd5e1',
                  fontSize: '13px', color: '#0f172a', background: '#ffffff'
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Periode Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Periode</span>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px' }}>
                {([
                  { id: 'ALL', label: 'Semua' },
                  { id: 'TODAY', label: 'Hari Ini' },
                  { id: '7D', label: '7 Hari' },
                  { id: '30D', label: '30 Hari' }
                ] as const).map(p => {
                  const isActive = period === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPeriod(p.id)}
                      style={{
                        border: 'none', padding: '5px 12px', borderRadius: '7px', fontSize: '12px',
                        fontWeight: isActive ? 700 : 600, cursor: 'pointer',
                        background: isActive ? '#ffffff' : 'transparent',
                        color: isActive ? '#dc2626' : '#64748b',
                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter Jenis Chips */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {chips.map(c => {
                const isActive = filterType === c.id;
                const isRed = c.id === 'OUT';
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFilterType(c.id)}
                    style={{
                      border: 'none', borderRadius: '999px', padding: '5px 12px',
                      fontSize: '11.5px', fontWeight: isActive ? 800 : 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                      background: isActive ? (c.activeColor || '#0f172a') : '#f1f5f9',
                      color: isActive ? '#ffffff' : (isRed ? '#dc2626' : '#475569'),
                      boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <span>{c.label}</span>
                    <span style={{
                      background: isActive ? 'rgba(255,255,255,0.25)' : (isRed ? '#fee2e2' : '#e2e8f0'),
                      color: isActive ? '#ffffff' : (isRed ? '#dc2626' : '#64748b'),
                      padding: '1px 6px', borderRadius: '999px', fontSize: '10.5px'
                    }}>
                      {c.n}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Counter Badge */}
            <span style={{
              background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
              borderRadius: '999px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 700
            }}>
              {sorted.length} dokumen • {totalLines} baris item
            </span>
          </div>

          {/* DESKTOP TABLE */}
          <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '1150px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '160px' }}>TANGGAL & WAKTU</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '180px' }}>NO. DOKUMEN</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '120px' }}>JENIS</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PRODUK & SKU</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '120px' }}>QTY</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '130px' }}>HARGA SATUAN</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '150px' }}>NILAI TOTAL</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '100px' }}>STOK KINI</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '170px' }}>PELANGGAN / SUPPLIER</th>
                  <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '130px' }}>PETUGAS</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Package size={44} style={{ opacity: 0.2 }} />
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Belum ada riwayat mutasi stok</div>
                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>Tidak ada data yang cocok dengan filter atau kata kunci saat ini.</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sorted.map((t) => {
                    const meta = TYPE_META[t.type as MutType] || TYPE_META.OUT;
                    const ArrowIcon = meta.ArrowIcon;
                    const span = t.items.length;
                    const party = getParty(t);
                    const employeeName = getEmployeeName(t.employeeId);

                    return (
                      <React.Fragment key={t.id}>
                        {t.items.map((item, idx) => {
                          const product = getProduct(item.productId);
                          const isFirst = idx === 0;
                          const unit = item.unit || product?.unit || 'Pcs';
                          const unitPrice = item.purchasePrice || (item.qty ? Math.abs((item.subtotal || 0) / item.qty) : 0);
                          const prodName = getProductName(item.productId, item.productName);
                          const prodSku = getProductSku(item.productId);

                          return (
                            <tr
                              key={`${t.id}-${idx}`}
                              style={{
                                borderBottom: idx === span - 1 ? '1px solid #e2e8f0' : '1px dashed #f1f5f9',
                                background: idx % 2 === 1 ? '#fafbfc' : 'transparent',
                                transition: 'background-color 0.15s ease'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 1 ? '#fafbfc' : 'transparent')}
                            >
                              {/* Tanggal & Waktu (Grouped if first item) */}
                              {isFirst && (
                                <td rowSpan={span} style={{ padding: '12px 16px', verticalAlign: 'top', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px' }}>
                                    {new Date(t.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                    {new Date(t.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                  </div>
                                </td>
                              )}

                              {/* No. Dokumen (Grouped if first item) */}
                              {isFirst && (
                                <td rowSpan={span} style={{ padding: '12px 16px', verticalAlign: 'top', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', fontSize: '12px' }}>
                                      {t.documentNo}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(t.documentNo)}
                                      title="Salin No. Dokumen"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
                                    >
                                      {copiedId === t.documentNo ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                                    </button>
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                                    {span} baris item
                                  </div>
                                </td>
                              )}

                              {/* Jenis Mutasi (Grouped if first item) */}
                              {isFirst && (
                                <td rowSpan={span} style={{ padding: '12px 16px', verticalAlign: 'top', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                  <span style={{
                                    background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
                                    padding: '3px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 800,
                                    display: 'inline-flex', alignItems: 'center', gap: '4px'
                                  }}>
                                    <ArrowIcon size={12} />
                                    {meta.label}
                                  </span>
                                </td>
                              )}

                              {/* Produk & SKU */}
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>
                                  {prodName}
                                </div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                                  SKU: {prodSku}
                                  {product?.category && <span style={{ color: '#64748b' }}> • {product.category}</span>}
                                </div>
                              </td>

                              {/* QTY */}
                              <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  fontWeight: 900, fontSize: '14px',
                                  color: t.type === 'OUT' ? '#dc2626' : '#16a34a'
                                }}>
                                  {t.type === 'OUT' ? `-${Math.abs(item.qty)}` : `+${Math.abs(item.qty)}`}
                                </span>{' '}
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{unit}</span>
                              </td>

                              {/* Harga Satuan */}
                              <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                                {unitPrice ? idr(unitPrice) : '-'}
                              </td>

                              {/* Nilai Total */}
                              <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '13.5px', fontWeight: 900, color: '#0f172a' }}>
                                {idr(item.subtotal || 0)}
                              </td>

                              {/* Sisa Stok Kini */}
                              <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {product ? (
                                  <span style={{
                                    fontWeight: 800, fontSize: '12px',
                                    color: product.stock <= 0 ? '#dc2626' : '#334155',
                                    background: product.stock <= 0 ? '#fee2e2' : '#f1f5f9',
                                    padding: '2px 8px', borderRadius: '6px'
                                  }}>
                                    {product.stock} {unit}
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>-</span>
                                )}
                              </td>

                              {/* Pelanggan / Supplier (Grouped if first item) */}
                              {isFirst && (
                                <td rowSpan={span} style={{ padding: '12px 16px', verticalAlign: 'top', borderLeft: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                  {party ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        background: party.kind === 'supplier' ? '#ede9fe' : '#dbeafe',
                                        color: party.kind === 'supplier' ? '#6d28d9' : '#1d4ed8',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                      }}>
                                        {party.kind === 'supplier' ? <Truck size={12} /> : <User size={12} />}
                                      </span>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {party.name}
                                        </div>
                                        <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                          {party.kind === 'supplier' ? 'Supplier' : 'Pelanggan'}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>{t.note || '-'}</span>
                                  )}
                                </td>
                              )}

                              {/* Petugas / Kasir (Grouped if first item) */}
                              {isFirst && (
                                <td rowSpan={span} style={{ padding: '12px 16px', verticalAlign: 'top', borderLeft: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                      width: '22px', height: '22px', borderRadius: '50%',
                                      background: '#e0e7ff', color: '#3730a3', fontSize: '10px',
                                      fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                      {employeeName.charAt(0).toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                                      {employeeName}
                                    </span>
                                  </div>
                                </td>
                              )}

                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* DESKTOP TABLE SUMMARY FOOTER */}
          {sorted.length > 0 && (
            <div style={{
              padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', color: '#64748b'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>Total Ditampilkan:</span>
                <span>Masuk: <strong style={{ color: '#16a34a' }}>+{shownTotals.inQty}</strong> ({idr(shownTotals.inVal)})</span>
                <span>Keluar: <strong style={{ color: '#dc2626' }}>-{shownTotals.outQty}</strong> ({idr(shownTotals.outVal)})</span>
              </div>
              <span style={{ fontWeight: 700, color: '#334155' }}>
                {sorted.length} Dokumen • {totalLines} Baris Item
              </span>
            </div>
          )}

        </div>
      ) : (
        /* ===================================================================
           MOBILE VIEW: NATIVE CARDS FEED & FILTER ACCORDION (MODE MOBILE)
           =================================================================== */
        <div className="mobile-cards-view" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Card Filter Toolbar Mobile */}
          <div style={{
            background: '#ffffff', borderRadius: '16px', padding: '14px',
            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px'
          }}>
            {/* Title row with badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: '#fff1f2', color: '#e11d48',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Package size={16} />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                  Riwayat Transaksi Stok
                </span>
              </div>

              <span style={{
                background: '#f1f5f9', color: '#64748b',
                borderRadius: '999px', padding: '3px 10px', fontSize: '11px', fontWeight: 700
              }}>
                {sorted.length} dokumen • {totalLines} baris item
              </span>
            </div>

            {/* Search input with clear button */}
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Cari no. dokumen, produk, SKU, pelanggan..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                  borderRadius: '10px', height: '40px', paddingLeft: '38px', paddingRight: query ? '34px' : '12px',
                  fontSize: '13px', color: '#0f172a'
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Periode row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', minWidth: '55px' }}>
                PERIODE
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {([
                  { id: 'ALL', label: 'Semua' },
                  { id: 'TODAY', label: 'Hari Ini' },
                  { id: '7D', label: '7 Hari' },
                  { id: '30D', label: '30 Hari' }
                ] as const).map((p) => {
                  const isActive = period === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPeriod(p.id)}
                      style={{
                        border: 'none',
                        borderRadius: '8px',
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: isActive ? 700 : 600,
                        cursor: 'pointer',
                        background: isActive ? '#dc2626' : '#f1f5f9',
                        color: isActive ? '#ffffff' : '#64748b',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter type segmented chips capsule */}
            <div style={{
              background: '#f1f5f9', borderRadius: '12px', padding: '3px',
              display: 'flex', gap: '3px', overflowX: 'auto', scrollbarWidth: 'none'
            }}>
              {chips.map((c) => {
                const isActive = filterType === c.id;
                const isRed = c.id === 'OUT';
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFilterType(c.id)}
                    style={{
                      flex: 1, border: 'none',
                      background: isActive ? '#ffffff' : 'transparent',
                      color: isActive ? (c.activeColor || '#0f172a') : (isRed ? '#dc2626' : '#64748b'),
                      borderRadius: '9px', padding: '6px 8px',
                      fontSize: '11.5px', fontWeight: isActive ? 800 : 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span>{c.label}</span>
                    <span style={{
                      background: isActive ? (c.activeColor || '#0f172a') : (isRed ? '#fee2e2' : '#e2e8f0'),
                      color: isActive ? '#ffffff' : (isRed ? '#dc2626' : '#64748b'),
                      borderRadius: '999px', padding: '1px 6px', fontSize: '10px', fontWeight: 800
                    }}>
                      {c.n}
                    </span>
                  </button>
                );
              })}
            </div>

          </div>

          {/* Mutasi Stok Mobile Cards Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sorted.length === 0 ? (
              <div style={{
                background: '#ffffff', borderRadius: '16px', padding: '40px 16px',
                border: '1px solid #f1f5f9', textAlign: 'center'
              }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px auto', color: '#94a3b8'
                }}>
                  <Package size={24} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '14.5px', color: '#0f172a' }}>
                  Belum Ada Riwayat Mutasi Stok
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Tidak ada transaksi stok yang sesuai dengan filter atau kata kunci saat ini.
                </div>
              </div>
            ) : (
              sorted.map((t) => {
                const meta = TYPE_META[t.type as MutType] || TYPE_META.OUT;
                const ArrowIcon = meta.ArrowIcon;
                const party = getParty(t);
                const employeeName = getEmployeeName(t.employeeId);
                const firstItem = t.items[0];
                const product = firstItem ? getProduct(firstItem.productId) : null;
                const prodName = firstItem ? getProductName(firstItem.productId, firstItem.productName) : 'Produk Tidak Dikenal';
                const prodSku = firstItem ? getProductSku(firstItem.productId) : t.id;
                const unit = firstItem?.unit || product?.unit || 'Pcs';
                const unitPrice = firstItem?.purchasePrice || (firstItem?.qty ? Math.abs((firstItem.subtotal || 0) / firstItem.qty) : 0);
                const totalVal = t.totalValue || (firstItem?.subtotal || 0);

                return (
                  <div
                    key={t.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      border: '1px solid #f1f5f9',
                      borderTop: t.type === 'OUT' ? '3.5px solid #e11d48' : t.type === 'IN' ? '3.5px solid #10b981' : '3.5px solid #f59e0b',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Card Top: Product Name, SKU/ID & Status Badge */}
                    <div style={{ padding: '14px 14px 10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3 style={{
                            fontSize: '14.5px', fontWeight: 800, color: '#0f172a',
                            margin: 0, textTransform: 'uppercase', letterSpacing: '-0.2px',
                            lineHeight: 1.3
                          }}>
                            {prodName}
                          </h3>
                          <div style={{
                            fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace',
                            marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {prodSku}
                          </div>
                        </div>

                        <div style={{
                          background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
                          padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0
                        }}>
                          <ArrowIcon size={12} />
                          {meta.label}
                        </div>
                      </div>
                    </div>

                    {/* Key-Value Rows (Tanggal & No. Dokumen) */}
                    <div style={{ padding: '0 14px 10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                          TANGGAL
                        </span>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '12.5px' }}>
                          {formatMutationDate(t.date)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                          NO. DOKUMEN
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            background: '#f1f5f9', color: '#0f172a', fontFamily: 'monospace',
                            fontWeight: 800, fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px'
                          }}>
                            {t.documentNo}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(t.documentNo)}
                            title="Salin No. Dokumen"
                            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#94a3b8' }}
                          >
                            {copiedId === t.documentNo ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                          </button>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            ({t.items.length} item)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Divider Line */}
                    <div style={{ borderTop: '0.5px dashed #e2e8f0', margin: '0 14px' }} />

                    {/* Key-Value Rows (Qty, Harga Satuan, Nilai Total) */}
                    <div style={{ padding: '10px 14px 12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Jumlah Qty */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: t.type === 'OUT' ? '#dc2626' : '#059669', textTransform: 'uppercase' }}>
                          JUMLAH (QTY)
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: t.type === 'OUT' ? '#dc2626' : '#059669' }}>
                          {t.type === 'OUT' ? `-${Math.abs(firstItem?.qty || 0)}` : `+${Math.abs(firstItem?.qty || 0)}`} {unit}
                        </span>
                      </div>

                      {/* Harga Satuan */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                          HARGA SATUAN
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                          {unitPrice ? idr(unitPrice) : '-'}
                        </span>
                      </div>

                      {/* Nilai Total */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                          NILAI TOTAL
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                          {idr(totalVal)}
                        </span>
                      </div>
                    </div>

                    {/* Card Footer: Pelanggan / Supplier / Petugas */}
                    {(party || employeeName) && (
                      <div style={{
                        background: '#fafbfc', borderTop: '1px solid #f1f5f9',
                        padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {party ? (
                            <>
                              <span style={{
                                width: '20px', height: '20px', borderRadius: '50%',
                                background: party.kind === 'supplier' ? '#ede9fe' : '#dbeafe',
                                color: party.kind === 'supplier' ? '#6d28d9' : '#1d4ed8',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                              }}>
                                {party.kind === 'supplier' ? <Truck size={10} /> : <User size={10} />}
                              </span>
                              <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                                {party.name}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {t.note || 'Mutasi Penjualan Kasir'}
                            </span>
                          )}
                        </div>

                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Petugas: <strong>{employeeName}</strong>
                        </span>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>

          {/* Sticky Bottom Action Bar Mobile */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: '#ffffff', borderTop: '1px solid #f1f5f9',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', padding: '10px 14px',
            zIndex: 100, display: 'flex', gap: '10px', alignItems: 'center'
          }}>
            <button
              type="button"
              onClick={() => setIsDetailModalOpen(true)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#1e293b',
                borderRadius: '10px',
                padding: '0 16px',
                height: '42px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                flex: 1
              }}
            >
              <Filter size={15} color="#475569" />
              Filter Detail
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '0 18px',
                height: '42px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                flex: 1.4,
                boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
              }}
            >
              <Download size={15} />
              Ekspor Laporan (Excel)
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. MODAL FILTER DETAIL (DRAWER)
          ===================================================================== */}
      {isDetailModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, padding: '16px'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px',
            overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              background: '#0f172a', color: '#ffffff', padding: '14px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={16} /> Filter Detail Mutasi Stok
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Rentang Tanggal Khusus
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    style={{
                      flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px',
                      height: '38px', padding: '0 8px', fontSize: '12.5px', color: '#0f172a'
                    }}
                  />
                  <span style={{ color: '#94a3b8' }}>—</span>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    style={{
                      flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px',
                      height: '38px', padding: '0 8px', fontSize: '12.5px', color: '#0f172a'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Urutkan Berdasarkan
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  style={{
                    width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px',
                    height: '38px', padding: '0 10px', fontSize: '13px', background: '#ffffff', color: '#0f172a'
                  }}
                >
                  <option value="latest">Tanggal Terbaru (Desc)</option>
                  <option value="oldest">Tanggal Terlama (Asc)</option>
                  <option value="highest-qty">Kuantitas Terbanyak</option>
                  <option value="highest-val">Nilai Total Terbesar</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setFilterDateFrom('');
                    setFilterDateTo('');
                    setSortBy('latest');
                    setQuery('');
                    setPeriod('ALL');
                    setFilterType('ALL');
                    setIsDetailModalOpen(false);
                  }}
                  style={{
                    flex: 1, background: '#f1f5f9', border: '1px solid #e2e8f0',
                    color: '#64748b', borderRadius: '8px', height: '40px',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  style={{
                    flex: 1, background: '#dc2626', border: 'none',
                    color: '#ffffff', borderRadius: '8px', height: '40px',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Terapkan Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StockMutation;
