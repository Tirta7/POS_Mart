import React, { useMemo, useState, useEffect } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSalesStore } from '../../store/useSalesStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import type { StockTransaction } from '../../types';
import { Package, ArrowUpRight, ArrowDownRight, RefreshCcw, Search, FileText, X, User, Truck } from 'lucide-react';
import { getSocket } from '../../utils/socket';

type MutType = 'IN' | 'OUT' | 'ADJUSTMENT';

const TYPE_META: Record<MutType, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  IN: { label: 'Masuk', color: '#047857', bg: '#d1fae5', Icon: ArrowDownRight },
  OUT: { label: 'Keluar', color: '#b91c1c', bg: '#fee2e2', Icon: ArrowUpRight },
  ADJUSTMENT: { label: 'Penyesuaian', color: '#b45309', bg: '#fef3c7', Icon: RefreshCcw },
};

const idr = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

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
  const [newlyAddedDoc, setNewlyAddedDoc] = useState<string | null>(null);

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

  // Muat data saat pertama kali halaman dibuka & pasang listener real-time Socket.IO
  useEffect(() => {
    refreshData();

    const socket = getSocket();
    setSocketConnected(socket.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const handleDataUpdated = (entity?: string) => {
      console.log('[StockMutation] Realtime update event:', entity);
      if (!entity || entity === 'transactions' || entity === 'stock-transactions' || entity === 'sales' || entity === 'products') {
        fetchTransactions();
        fetchProducts();
        fetchSales();
      }
    };

    const handleMutationEvent = (data?: any) => {
      console.log('[StockMutation] Realtime mutation event:', data);
      fetchTransactions();
      fetchProducts();
      fetchSales();
      const doc = data?.documentNo || data?.receiptNumber;
      if (doc) {
        setNewlyAddedDoc(doc);
        setTimeout(() => setNewlyAddedDoc(null), 5000);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('data_updated', handleDataUpdated);
    socket.on('sale_completed', handleMutationEvent);
    socket.on('stock_mutation_updated', handleMutationEvent);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('data_updated', handleDataUpdated);
      socket.off('sale_completed', handleMutationEvent);
      socket.off('stock_mutation_updated', handleMutationEvent);
    };
  }, []);

  const getProduct = (id: string) => products.find(p => p.id === id);
  const getProductName = (id: string, fallback?: string) => getProduct(id)?.name || fallback || id;
  const getEmployeeName = (id: string) => {
    if (id === 'SYSTEM') return 'Sistem';
    return employees.find(e => e.id === id)?.name || id;
  };

  // Pihak terkait: pelanggan (penjualan kasir) atau supplier (penerimaan/pembelian)
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

  const formatQty = (type: string, qty: number) => {
    if (type === 'OUT') return `-${Math.abs(qty)}`;
    if (type === 'IN') return `+${Math.abs(qty)}`;
    return qty > 0 ? `+${qty}` : String(qty);
  };
  const qtyColor = (type: string, qty: number) => {
    if (type === 'OUT') return '#dc2626';
    if (type === 'IN') return '#059669';
    return qty < 0 ? '#dc2626' : '#059669';
  };

  // Filter periode + pencarian (tanpa filter jenis, supaya hitungan chip tetap akurat)
  const baseFiltered = useMemo(() => {
    const now = new Date();
    const from =
      period === 'TODAY' ? startOfDay(now)
      : period === '7D' ? startOfDay(now) - 6 * 86400000
      : period === '30D' ? startOfDay(now) - 29 * 86400000
      : 0;
    const q = query.trim().toLowerCase();
    return transactions.filter(t => {
      if (new Date(t.date).getTime() < from) return false;
      if (!q) return true;
      const party = getParty(t);
      return (
        t.documentNo.toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q) ||
        (party?.name || '').toLowerCase().includes(q) ||
        (party?.sub || '').toLowerCase().includes(q) ||
        t.items.some(i => (products.find(p => p.id === i.productId)?.name || i.productName || i.productId).toLowerCase().includes(q) || i.productId.toLowerCase().includes(q))
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, products, period, query, sales, customers, suppliers]);

  const sorted = useMemo(
    () => [...baseFiltered]
      .filter(t => filterType === 'ALL' || t.type === filterType)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [baseFiltered, filterType]
  );

  const count = (type: MutType) => baseFiltered.filter(t => t.type === type).length;
  const sumQty = (type: MutType) =>
    baseFiltered.filter(t => t.type === type).reduce((s, t) => s + t.items.reduce((x, i) => x + (type === 'ADJUSTMENT' ? i.qty : Math.abs(i.qty)), 0), 0);

  const adjNet = sumQty('ADJUSTMENT');

  const summary = [
    { label: 'Total Dokumen', value: String(baseFiltered.length), sub: 'mutasi tercatat', color: '#1e40af', bg: '#eff6ff', Icon: FileText },
    { label: 'Barang Masuk', value: '+' + sumQty('IN'), sub: `${count('IN')} dokumen`, color: '#047857', bg: '#ecfdf5', Icon: ArrowDownRight },
    { label: 'Barang Keluar', value: '-' + sumQty('OUT'), sub: `${count('OUT')} dokumen`, color: '#b91c1c', bg: '#fef2f2', Icon: ArrowUpRight },
    { label: 'Penyesuaian', value: (adjNet > 0 ? '+' : '') + adjNet, sub: `${count('ADJUSTMENT')} dokumen (netto)`, color: '#b45309', bg: '#fffbeb', Icon: RefreshCcw },
  ];

  const chips: { id: 'ALL' | MutType; label: string; n: number }[] = [
    { id: 'ALL', label: 'SEMUA', n: baseFiltered.length },
    { id: 'IN', label: 'MASUK', n: count('IN') },
    { id: 'OUT', label: 'KELUAR', n: count('OUT') },
    { id: 'ADJUSTMENT', label: 'PENYESUAIAN', n: count('ADJUSTMENT') },
  ];

  // Total pada data yang sedang ditampilkan (untuk footer)
  const shown = useMemo(() => {
    let items = 0, inQty = 0, outQty = 0, inVal = 0, outVal = 0;
    sorted.forEach(t => t.items.forEach(i => {
      items += 1;
      if (t.type === 'IN') { inQty += Math.abs(i.qty); inVal += i.subtotal || 0; }
      if (t.type === 'OUT') { outQty += Math.abs(i.qty); outVal += i.subtotal || 0; }
    }));
    return { items, inQty, outQty, inVal, outVal };
  }, [sorted]);

  const th: React.CSSProperties = { whiteSpace: 'nowrap' };
  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';

  return (
    <div className="bo-container">
      <div className="bo-page-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="bo-page-title">Mutasi Stok</h1>
          <p className="bo-page-subtitle">Pantau pergerakan stok (Barang Masuk, Keluar, dan Penyesuaian).</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Status Socket.IO Real-Time */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            background: socketConnected ? '#ecfdf5' : '#fffbeb',
            color: socketConnected ? '#059669' : '#b45309',
            border: `1px solid ${socketConnected ? '#a7f3d0' : '#fde68a'}`,
            transition: 'all 0.2s ease'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: socketConnected ? '#10b981' : '#f59e0b',
              boxShadow: socketConnected ? '0 0 0 2px rgba(16, 185, 129, 0.3)' : 'none',
              display: 'inline-block'
            }} />
            <span>{socketConnected ? 'Real-Time Aktif (Socket.IO)' : 'Menghubungkan Socket...'}</span>
          </div>

          {/* Tombol Segarkan Manual */}
          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="bo-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: isRefreshing ? 'wait' : 'pointer'
            }}
            title="Segarkan data mutasi stok dari server"
          >
            <RefreshCcw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            {isRefreshing ? 'Memuat...' : 'Segarkan'}
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="r-grid-4 r-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '14px', flexShrink: 0 }}>
        {summary.map(c => (
          <div key={c.label} className="r-stat" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: `4px solid ${c.color}` }}>
            <div className="r-stat-icon" style={{ width: '38px', height: '38px', borderRadius: '10px', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <c.Icon size={19} color={c.color} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="r-stat-label" style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span className="r-stat-value" style={{ fontSize: '21px', fontWeight: 800, color: c.color, lineHeight: 1.2 }}>{c.value}</span>
                <span className="r-stat-sub" style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bo-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: 0 }}>
        <div className="bo-card-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h3 className="bo-card-title" style={{ margin: 0 }}>
            <Package size={20} style={{ color: 'var(--primary)' }} />
            Riwayat Transaksi Stok
          </h3>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>{sorted.length} dokumen • {shown.items} baris item</span>
        </div>

        {/* Toolbar pencarian & periode */}
        <div className="r-toolbar" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '10px 18px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
          <div style={{ position: 'relative', flex: '1 1 320px', minWidth: '260px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              className="bo-input"
              placeholder="Cari no. dokumen, produk, SKU, pelanggan, supplier, atau keterangan..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '34px', paddingRight: query ? '32px' : undefined, backgroundColor: 'white', height: '36px', fontSize: '13px' }}
            />
            {query && (
              <button onClick={() => setQuery('')} title="Hapus pencarian" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Periode */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Periode</span>
            <div style={{ display: 'inline-flex', background: '#eef0f3', borderRadius: '9px', padding: '3px', gap: '2px' }}>
              {([
                { id: 'ALL', label: 'Semua' },
                { id: 'TODAY', label: 'Hari Ini' },
                { id: '7D', label: '7 Hari' },
                { id: '30D', label: '30 Hari' },
              ] as const).map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    padding: '5px 12px',
                    borderRadius: '7px',
                    fontSize: '12px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    background: period === p.id ? 'white' : 'transparent',
                    color: period === p.id ? 'var(--primary)' : '#6b7280',
                    boxShadow: period === p.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    transition: 'all .15s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {(query || period !== 'ALL' || filterType !== 'ALL') && (
            <button
              onClick={() => { setQuery(''); setPeriod('ALL'); setFilterType('ALL'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#dc2626', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}
            >
              <X size={13} /> Reset
            </button>
          )}
        </div>

        {/* Filter jenis */}
        <div className="categories-bar" style={{ flexShrink: 0 }}>
          {chips.map(c => (
            <button
              key={c.id}
              className={`cat-btn ${filterType === c.id ? 'active' : ''}`}
              onClick={() => setFilterType(c.id)}
            >
              {c.label}
              <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>{c.n}</span>
            </button>
          ))}
        </div>

        <div className="bo-table-container" style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <style>{`
            .mut-table th { padding: 9px 14px !important; font-size: 11px !important; letter-spacing: 0.4px; position: sticky; top: 0; z-index: 1; background: #f9fafb; }
            .mut-table td { padding: 8px 14px !important; font-size: 13px; line-height: 1.35; }
            .mut-table tbody tr:hover td { background: #f8fafc !important; }
          `}</style>
          <table className="bo-table mut-table" style={{ width: '100%', minWidth: '1050px' }}>
            <thead>
              <tr>
                <th style={th}>Tanggal</th>
                <th style={th}>No. Dokumen</th>
                <th style={th}>Jenis</th>
                <th>Produk</th>
                <th style={{ ...th, textAlign: 'center' }}>Qty</th>
                <th style={{ ...th, textAlign: 'right' }}>Harga Satuan</th>
                <th style={{ ...th, textAlign: 'right' }}>Nilai</th>
                <th style={{ ...th, textAlign: 'center' }}>Stok Kini</th>
                <th>Keterangan</th>
                <th>Pelanggan / Supplier</th>
                <th style={th}>Oleh</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '56px 20px', color: '#6b7280' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={26} color="#9ca3af" />
                      </div>
                      <div style={{ fontWeight: 700, color: '#374151' }}>Belum ada riwayat mutasi stok</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', maxWidth: '360px' }}>
                        {transactions.length === 0
                          ? 'Mutasi tercatat otomatis saat penerimaan barang (GR), restock, penjualan kasir, atau koreksi stok.'
                          : 'Tidak ada data yang cocok dengan filter/pencarian saat ini.'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map((t, ti) => {
                  const meta = TYPE_META[t.type as MutType];
                  const span = t.items.length;
                  const d = new Date(t.date);
                  const isNew = newlyAddedDoc && t.documentNo === newlyAddedDoc;
                  const zebra = isNew ? '#ecfdf5' : ti % 2 === 1 ? '#fcfcfd' : 'transparent';
                  const cellTop: React.CSSProperties = { verticalAlign: 'top', borderTop: isNew ? '2px solid #10b981' : '1px solid #e5e7eb', background: zebra, transition: 'background-color 0.5s ease' };
                  const itemBorder = (first: boolean) => (first ? (isNew ? '2px solid #10b981' : '1px solid #e5e7eb') : '1px dashed #eee');
                  const employeeName = getEmployeeName(t.employeeId);
                  const party = getParty(t);
                  const partyStyle = party
                    ? party.kind === 'supplier'
                      ? { color: '#6d28d9', bg: '#ede9fe', label: 'Supplier' }
                      : party.kind === 'customer'
                        ? { color: '#1d4ed8', bg: '#dbeafe', label: 'Pelanggan' }
                        : { color: '#6b7280', bg: '#f3f4f6', label: 'Umum' }
                    : null;
                  return (
                    <React.Fragment key={t.id}>
                      {t.items.map((item, idx) => {
                        const product = getProduct(item.productId);
                        const first = idx === 0;
                        const unit = item.unit || product?.unit || '';
                        const unitPrice = item.qty ? Math.abs((item.subtotal || 0) / item.qty) : 0;
                        const itemCell: React.CSSProperties = { borderTop: itemBorder(first), background: zebra };
                        return (
                          <tr key={t.id + ':' + idx}>
                            {first && (
                              <>
                                <td rowSpan={span} style={{ ...cellTop, whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 700 }}>{d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</div>
                                </td>
                                <td rowSpan={span} style={{ ...cellTop, whiteSpace: 'nowrap' }}>
                                  <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#374151', fontSize: '12px' }}>{t.documentNo}</div>
                                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{span} item</div>
                                </td>
                                <td rowSpan={span} style={cellTop}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', color: meta.color, background: meta.bg, padding: '3px 10px 3px 8px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700 }}>
                                    <meta.Icon size={12} /> {meta.label}
                                  </span>
                                </td>
                              </>
                            )}
                            <td className="r-card-title" style={itemCell}>
                              <div style={{ fontWeight: 600, color: '#111827' }}>{getProductName(item.productId, item.productName)}</div>
                              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                {product?.sku || item.productId}
                                {product?.category && <span> • {product.category}</span>}
                                {item.batchNo && <span> • Batch: {item.batchNo}</span>}
                              </div>
                            </td>
                            <td style={{ ...itemCell, textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ fontWeight: 800, fontSize: '14px', color: qtyColor(t.type, item.qty) }}>{formatQty(t.type, item.qty)}</span>{' '}
                              <span style={{ fontSize: '11px', color: '#9ca3af' }}>{unit}</span>
                            </td>
                            <td style={{ ...itemCell, textAlign: 'right', whiteSpace: 'nowrap', color: '#6b7280' }}>
                              {unitPrice ? idr(unitPrice) : '-'}
                            </td>
                            <td style={{ ...itemCell, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: '#111827' }}>
                              {idr(item.subtotal)}
                            </td>
                            <td style={{ ...itemCell, textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {product ? (
                                <span style={{ fontWeight: 700, color: '#374151' }}>
                                  {product.stock} <span style={{ fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}>{unit}</span>
                                </span>
                              ) : <span style={{ color: '#d1d5db' }}>-</span>}
                            </td>
                            {first && (
                              <>
                                <td rowSpan={span} style={{ ...cellTop, color: '#6b7280', fontSize: '12px' }}>{t.note || '-'}</td>
                                <td rowSpan={span} style={{ ...cellTop, whiteSpace: 'nowrap' }}>
                                  {party && partyStyle ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: partyStyle.bg, color: partyStyle.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {party.kind === 'supplier' ? <Truck size={13} /> : <User size={13} />}
                                      </span>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span style={{ fontWeight: 600, color: party.kind === 'guest' ? '#9ca3af' : '#111827', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{party.name}</span>
                                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '0 6px', borderRadius: '999px', background: partyStyle.bg, color: partyStyle.color }}>{partyStyle.label}</span>
                                        </div>
                                        {party.sub && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{party.sub}</div>}
                                      </div>
                                    </div>
                                  ) : <span style={{ color: '#d1d5db' }}>-</span>}
                                </td>
                                <td rowSpan={span} style={{ ...cellTop, whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e0e7ff', color: '#3730a3', fontSize: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {initials(employeeName)}
                                    </span>
                                    <span style={{ color: '#374151', fontWeight: 500 }}>{employeeName}</span>
                                  </div>
                                </td>
                              </>
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

        {/* Ringkasan data yang ditampilkan */}
        {sorted.length > 0 && (
          <div className="r-summary-bar" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap', padding: '10px 18px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '12px', color: '#6b7280' }}>
            <span style={{ fontWeight: 700, color: '#374151' }}>Total ditampilkan</span>
            <span>Masuk: <b style={{ color: '#059669' }}>+{shown.inQty}</b> <span style={{ color: '#9ca3af' }}>({idr(shown.inVal)})</span></span>
            <span>Keluar: <b style={{ color: '#dc2626' }}>-{shown.outQty}</b> <span style={{ color: '#9ca3af' }}>({idr(shown.outVal)})</span></span>
            <span style={{ marginLeft: 'auto' }}>{sorted.length} dokumen • {shown.items} item</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockMutation;
