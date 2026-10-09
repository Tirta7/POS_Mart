import React, { useState, useMemo, useEffect } from 'react';
import { useSalesStore } from '../../store/useSalesStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import ReceiptModal from '../../components/ReceiptModal';
import type { SalesTransaction } from '../../types';
import type { ReceiptOptions } from '../../utils/receipt';
import { 
  TrendingUp, AlertTriangle, DollarSign, Search, 
  CreditCard, CheckCircle2, Printer, Copy, Download, 
  FileSpreadsheet, RefreshCw, X, MessageSquare,
  Package, Check
} from 'lucide-react';
import { exportMasterExcel } from '../../utils/excelExportImport';

const Reports: React.FC = () => {
  const { sales, fetchSales } = useSalesStore();
  const { products, fetchProducts } = useInventoryStore();
  const { suppliers, fetchSuppliers, paySupplierDebt } = useSupplierStore();
  const { customers } = useCustomerStore();
  const { appName, taxEnabled, taxRate } = useSettingsStore();

  // Screen detection: strictly separate Desktop mode from Mobile mode
  const [isMobileScreen, setIsMobileScreen] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchSales();
    fetchProducts();
    fetchSuppliers();
  }, [fetchSales, fetchProducts, fetchSuppliers]);

  const [activeTab, setActiveTab] = useState<'sales' | 'low-stock' | 'supplier-debts'>('sales');
  const [reprint, setReprint] = useState<{ sale: SalesTransaction; options: ReceiptOptions } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [paymentMethod, setPaymentMethod] = useState('ALL');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest'>('latest');

  // Supplier Debt modal
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [selectedDebtSupplier, setSelectedDebtSupplier] = useState<any | null>(null);
  const [debtAmount, setDebtAmount] = useState<number>(0);
  const [debtMethod, setDebtMethod] = useState<string>('Transfer Bank (BCA)');
  const [debtNote, setDebtNote] = useState<string>('');
  const [isPayingDebt, setIsPayingDebt] = useState(false);

  // Export choice modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const formatIDR = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const setPresetRange = (preset: 'ALL' | 'TODAY' | '7D' | '30D') => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === '7D') {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (preset === '30D') {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    }
  };

  // Compute enriched sales with Customer Name and Profit Margin
  const enrichedSales = useMemo(() => {
    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    const customerPhoneMap = new Map(customers.map(c => [c.id, c.phone]));
    const productMap = new Map(products.map(p => [p.id, p]));

    return sales.map(sale => {
      const customerName = sale.customerId 
        ? customerMap.get(sale.customerId) || sale.customerName || 'Umum (Guest)' 
        : sale.customerName || 'Umum (Guest)';

      const customerPhone = sale.customerId ? customerPhoneMap.get(sale.customerId) || '' : '';

      let totalPurchasePrice = 0;
      (sale.items || []).forEach(item => {
        const product = productMap.get(item.productId);
        const unitCost = product ? product.purchasePrice : 0;
        totalPurchasePrice += unitCost * item.qty;
      });

      const profitMargin = (sale.subtotal || sale.total) - totalPurchasePrice;

      return {
        ...sale,
        customerName,
        customerPhone,
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
        (sale.customerName && sale.customerName.toLowerCase().includes(lowerQuery)) ||
        (sale.employeeName && sale.employeeName.toLowerCase().includes(lowerQuery)) ||
        (sale.items || []).some(it => it.name && it.name.toLowerCase().includes(lowerQuery))
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
  const totalRevenue = enrichedSales.reduce((sum, sale) => sum + (sale.total || sale.subtotal || 0), 0);
  const totalTransactions = enrichedSales.length;
  const totalProfit = enrichedSales.reduce((sum, sale) => sum + sale.profitMargin, 0);
  const totalSubtotal = enrichedSales.reduce((sum, sale) => sum + (sale.subtotal || sale.total || 0), 0);
  const avgPerNota = totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0;
  const marginPct = totalSubtotal > 0 ? (totalProfit / totalSubtotal) * 100 : 0;

  // Filtered Totals for Table Footer
  const filteredTotals = useMemo(() => {
    const rev = filteredSales.reduce((sum, s) => sum + (s.total || s.subtotal || 0), 0);
    const prof = filteredSales.reduce((sum, s) => sum + s.profitMargin, 0);
    return { rev, prof };
  }, [filteredSales]);

  // Low Stock Items
  const lowStockItems = useMemo(() => {
    return products
      .filter(p => {
        const available = p.stock - (p.reserved || 0);
        const min = p.minStock ?? 1;
        return available <= min;
      })
      .sort((a, b) => (a.stock - (a.reserved || 0)) - (b.stock - (b.reserved || 0)));
  }, [products]);

  const topLowStockItem = lowStockItems.length > 0 ? lowStockItems[0] : null;

  // Suppliers with Debt
  const suppliersWithDebt = useMemo(() => {
    return suppliers.filter(s => (s.totalPayable || 0) > 0);
  }, [suppliers]);

  const totalSupplierDebt = useMemo(() => {
    return suppliersWithDebt.reduce((sum, s) => sum + (s.totalPayable || 0), 0);
  }, [suppliersWithDebt]);

  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || 'A';

  // Export Excel Function
  const handleExportData = () => {
    setIsExportModalOpen(true);
  };

  const handleDownloadExcel = () => {
    exportMasterExcel({
      storeName: appName || 'HERO PRO SHOP',
      exportedAt: new Date().toISOString(),
      analytics: {
        totalSalesAmount: totalRevenue,
        totalTransactions: totalTransactions,
        averageBasketSize: avgPerNota,
        estimatedProfitValue: totalProfit,
        totalSupplierDebt: totalSupplierDebt
      },
      products,
      transactions: sales,
      suppliers
    });
    setIsExportModalOpen(false);
  };

  // Pay Debt Submit
  const handlePayDebtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtSupplier) return;
    if (debtAmount <= 0) {
      alert("Masukkan nominal pembayaran yang valid!");
      return;
    }

    setIsPayingDebt(true);
    try {
      await paySupplierDebt(
        selectedDebtSupplier.id,
        debtAmount,
        `${debtMethod}: ${debtNote || 'Pelunasan Faktur Supplier'}`
      );
      alert(`Pembayaran hutang ke ${selectedDebtSupplier.name} sebesar ${formatIDR(debtAmount)} berhasil dicatat!`);
      setIsDebtModalOpen(false);
      setSelectedDebtSupplier(null);
      setDebtAmount(0);
      setDebtNote('');
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      alert("Gagal mencatat pembayaran hutang.");
    } finally {
      setIsPayingDebt(false);
    }
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
          1. PAGE HEADER SECTION
          ===================================================================== */}
      <div className="bo-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="bo-page-title" style={{ fontSize: isMobileScreen ? '20px' : '24px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
              Laporan & Analitik
            </h1>
            <span style={{
              background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#16a34a',
              padding: '3px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '5px'
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }} />
              Live Synced
            </span>
          </div>
          <p className="bo-page-subtitle" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
            Pantau performa penjualan, pergerakan stok, dan keuntungan toko Anda secara real-time.
          </p>
        </div>

        {/* Action buttons on desktop */}
        {!isMobileScreen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => { fetchSales(); fetchProducts(); fetchSuppliers(); }}
              style={{
                background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155',
                padding: '8px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            >
              <RefreshCw size={13} />
              Segarkan
            </button>

            <button
              type="button"
              onClick={handleExportData}
              style={{
                background: '#0f172a', color: '#ffffff', border: 'none',
                borderRadius: '10px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
              }}
            >
              <Download size={14} />
              Ekspor Laporan (Excel/PDF)
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          2. ANALYTICS KPI CARDS (4-COLS FULL WIDTH ON DESKTOP)
          ===================================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobileScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: isMobileScreen ? '10px' : '14px',
        marginBottom: '14px',
        flexShrink: 0
      }}>
        {/* Card 1: TOTAL PENDAPATAN */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: isMobileScreen ? '14px' : '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              TOTAL PENDAPATAN
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#10b981'
            }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '18px' : '22px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
            {formatIDR(totalRevenue)}
          </div>
          <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
            rata-rata: <strong>{formatIDR(avgPerNota)}</strong> / nota
          </span>
        </div>

        {/* Card 2: TOTAL LABA BERSIH */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: isMobileScreen ? '14px' : '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              TOTAL LABA BERSIH
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#d97706'
            }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '18px' : '22px', fontWeight: 900, color: '#16a34a', lineHeight: 1.1 }}>
            {formatIDR(totalProfit)}
          </div>
          <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
            Margin Bersih: <strong style={{ color: '#16a34a' }}>{marginPct.toFixed(1)}%</strong>
          </span>
        </div>

        {/* Card 3: TOTAL TRANSAKSI */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: isMobileScreen ? '14px' : '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              TOTAL TRANSAKSI
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#3b82f6'
            }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '18px' : '22px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
            {totalTransactions} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Nota</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#16a34a', marginTop: '6px', fontWeight: 700 }}>
            ● 100% Lunas Terverifikasi
          </span>
        </div>

        {/* Card 4: KEWAJIBAN HUTANG SUPPLIER */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: isMobileScreen ? '14px' : '16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#e11d48', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              HUTANG SUPPLIER
            </span>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#e11d48'
            }}>
              <CreditCard size={18} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '18px' : '22px', fontWeight: 900, color: '#dc2626', lineHeight: 1.1 }}>
            {formatIDR(totalSupplierDebt)}
          </div>
          <span style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '6px' }}>
            {suppliersWithDebt.length} Vendor jatuh tempo
          </span>
        </div>
      </div>

      {/* =====================================================================
          3. SEGMENTED TABS (PENJUALAN, PERINGATAN STOK, HUTANG SUPPLIER)
          ===================================================================== */}
      <div style={{
        background: '#f1f5f9', padding: '4px', borderRadius: '12px',
        display: isMobileScreen ? 'flex' : 'inline-flex', gap: '4px', marginBottom: '14px', flexShrink: 0
      }}>
        {/* Tab 1: Laporan Penjualan */}
        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          style={{
            flex: isMobileScreen ? 1.2 : 'initial', border: 'none',
            background: activeTab === 'sales' ? '#ffffff' : 'transparent',
            color: activeTab === 'sales' ? '#dc2626' : '#475569',
            borderRadius: '9px', padding: '7px 16px',
            fontSize: '12.5px', fontWeight: activeTab === 'sales' ? 800 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            cursor: 'pointer',
            boxShadow: activeTab === 'sales' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <span>Laporan Penjualan</span>
          <span style={{
            background: activeTab === 'sales' ? '#dc2626' : '#e2e8f0',
            color: activeTab === 'sales' ? '#ffffff' : '#64748b',
            borderRadius: '999px', padding: '1px 7px', fontSize: '10.5px', fontWeight: 700
          }}>
            {filteredSales.length}
          </span>
        </button>

        {/* Tab 2: Peringatan Stok */}
        <button
          type="button"
          onClick={() => setActiveTab('low-stock')}
          style={{
            flex: isMobileScreen ? 1.1 : 'initial', border: 'none',
            background: activeTab === 'low-stock' ? '#ffffff' : 'transparent',
            color: activeTab === 'low-stock' ? '#dc2626' : '#475569',
            borderRadius: '9px', padding: '7px 16px',
            fontSize: '12.5px', fontWeight: activeTab === 'low-stock' ? 800 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            cursor: 'pointer',
            boxShadow: activeTab === 'low-stock' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <span>Peringatan Stok</span>
          {lowStockItems.length > 0 && (
            <span style={{
              background: '#fee2e2', color: '#dc2626',
              borderRadius: '999px', padding: '1px 7px', fontSize: '10.5px', fontWeight: 800
            }}>
              {lowStockItems.length}
            </span>
          )}
        </button>

        {/* Tab 3: Hutang Supplier */}
        <button
          type="button"
          onClick={() => setActiveTab('supplier-debts')}
          style={{
            flex: isMobileScreen ? 1.1 : 'initial', border: 'none',
            background: activeTab === 'supplier-debts' ? '#ffffff' : 'transparent',
            color: activeTab === 'supplier-debts' ? '#dc2626' : '#475569',
            borderRadius: '9px', padding: '7px 16px',
            fontSize: '12.5px', fontWeight: activeTab === 'supplier-debts' ? 800 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            cursor: 'pointer',
            boxShadow: activeTab === 'supplier-debts' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <span>Hutang Supplier</span>
          {suppliersWithDebt.length > 0 && (
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#dc2626' }} />
          )}
        </button>
      </div>

      {/* =====================================================================
          TAB 1: LAPORAN PENJUALAN
          ===================================================================== */}
      {activeTab === 'sales' && (
        !isMobileScreen ? (
          /* -----------------------------------------------------------------
             DESKTOP VIEW: FULL-WIDTH COMPREHENSIVE DATA TABLE (MODE DESKTOP)
             ----------------------------------------------------------------- */
          <div className="desktop-table-view" style={{
            background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0
          }}>
            {/* Desktop Table Toolbar */}
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#ffffff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', flexShrink: 0
            }}>
              {/* Search input */}
              <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Cari invoice, pelanggan, kasir..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', paddingLeft: '34px', paddingRight: searchQuery ? '30px' : '10px',
                    height: '36px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    fontSize: '12.5px', color: '#0f172a', background: '#ffffff'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Date Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Periode</span>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setPresetRange('ALL')}
                    style={{
                      border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px',
                      fontWeight: !startDate && !endDate ? 800 : 600, cursor: 'pointer',
                      background: !startDate && !endDate ? '#ffffff' : 'transparent',
                      color: !startDate && !endDate ? '#dc2626' : '#64748b'
                    }}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetRange('TODAY')}
                    style={{
                      border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px',
                      fontWeight: startDate === todayStr && endDate === todayStr ? 800 : 600, cursor: 'pointer',
                      background: startDate === todayStr && endDate === todayStr ? '#ffffff' : 'transparent',
                      color: startDate === todayStr && endDate === todayStr ? '#dc2626' : '#64748b'
                    }}
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetRange('7D')}
                    style={{
                      border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px',
                      fontWeight: 600, cursor: 'pointer', background: 'transparent', color: '#64748b'
                    }}
                  >
                    7 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetRange('30D')}
                    style={{
                      border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px',
                      fontWeight: 600, cursor: 'pointer', background: 'transparent', color: '#64748b'
                    }}
                  >
                    30 Hari
                  </button>
                </div>
              </div>

              {/* Custom Date Inputs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    border: '1px solid #cbd5e1', borderRadius: '8px',
                    height: '34px', padding: '0 8px', fontSize: '12px', color: '#0f172a'
                  }}
                />
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    border: '1px solid #cbd5e1', borderRadius: '8px',
                    height: '34px', padding: '0 8px', fontSize: '12px', color: '#0f172a'
                  }}
                />
              </div>

              {/* Payment Method filter */}
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{
                  border: '1px solid #cbd5e1', borderRadius: '8px',
                  height: '34px', padding: '0 10px', fontSize: '12px', background: '#ffffff', color: '#1e293b'
                }}
              >
                <option value="ALL">Semua Metode Bayar</option>
                <option value="TUNAI">TUNAI</option>
                <option value="QRIS">QRIS</option>
                <option value="KARTU KREDIT">KARTU KREDIT</option>
                <option value="KARTU DEBIT">KARTU DEBIT</option>
              </select>

              {/* Sort by */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'latest' | 'oldest')}
                style={{
                  border: '1px solid #cbd5e1', borderRadius: '8px',
                  height: '34px', padding: '0 10px', fontSize: '12px', background: '#ffffff', color: '#1e293b'
                }}
              >
                <option value="latest">Terbaru (Desc)</option>
                <option value="oldest">Terlama (Asc)</option>
              </select>

              {/* Counter Badge */}
              <span style={{
                background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
                borderRadius: '999px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 700
              }}>
                {filteredSales.length} Nota Terbit
              </span>
            </div>

            {/* Desktop Table View */}
            <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '170px' }}>NO. INVOICE</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '150px' }}>TANGGAL & WAKTU</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '150px' }}>KASIR</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '170px' }}>PELANGGAN</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>ITEMS DIBELI</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '120px' }}>METODE</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '140px' }}>TOTAL OMZET</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '150px' }}>LABA BERSIH</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '90px' }}>STATUS</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '110px' }}>AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <FileSpreadsheet size={44} style={{ opacity: 0.2 }} />
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Data Penjualan Tidak Ditemukan</div>
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>Tidak ada transaksi penjualan yang cocok dengan filter atau rentang tanggal saat ini.</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale, idx) => {
                      const cashier = sale.employeeName || 'Administrator';
                      const marginPercent = sale.subtotal ? (sale.profitMargin / sale.subtotal) * 100 : 0;
                      const itemCount = (sale.items || []).reduce((acc, it) => acc + (it.qty || 1), 0);

                      const methodColor = 
                        sale.paymentMethod === 'TUNAI' ? { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' } :
                        sale.paymentMethod === 'QRIS' ? { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' } :
                        { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };

                      return (
                        <tr
                          key={sale.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 1 ? '#fafbfc' : 'transparent',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 1 ? '#fafbfc' : 'transparent')}
                        >
                          {/* No. Invoice */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', fontSize: '12px' }}>
                                {sale.id}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(sale.id)}
                                title="Salin No. Invoice"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
                              >
                                {copiedId === sale.id ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                              </button>
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px' }}>
                              {itemCount} unit item
                            </div>
                          </td>

                          {/* Tanggal & Waktu */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '12.5px' }}>
                              {new Date(sale.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                              {new Date(sale.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                            </div>
                          </td>

                          {/* Kasir */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '26px', height: '26px', borderRadius: '50%',
                                background: '#e0e7ff', color: '#4338ca', fontWeight: 800, fontSize: '11px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                              }}>
                                {initials(cashier)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a' }}>{cashier}</div>
                                <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>{sale.employeeId || 'ID #Kasir'}</div>
                              </div>
                            </div>
                          </td>

                          {/* Pelanggan */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '26px', height: '26px', borderRadius: '50%',
                                background: sale.customerName && sale.customerName !== 'Umum (Guest)' ? '#fef3c7' : '#f1f5f9',
                                color: sale.customerName && sale.customerName !== 'Umum (Guest)' ? '#b45309' : '#64748b',
                                fontWeight: 800, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                              }}>
                                {initials(sale.customerName || 'U')}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                                  {sale.customerName || 'Umum (Guest)'}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                  {sale.customerPhone || (sale.customerId ? `ID: ${sale.customerId.slice(0, 8)}...` : 'Tanpa Member')}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Items Dibeli */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {(sale.items || []).slice(0, 2).map((it, i) => (
                                <div key={i} style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 800, color: '#0f172a' }}>{it.qty}x</span>
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{it.name}</span>
                                </div>
                              ))}
                              {(sale.items || []).length > 2 && (
                                <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
                                  +{(sale.items || []).length - 2} produk lainnya...
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Metode Bayar */}
                          <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: methodColor.bg, color: methodColor.text, border: `1px solid ${methodColor.border}`,
                              padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800
                            }}>
                              {sale.paymentMethod || 'TUNAI'}
                            </span>
                          </td>

                          {/* Total Omzet */}
                          <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 900, fontSize: '13.5px', color: '#0f172a' }}>
                              {formatIDR(sale.total || sale.subtotal || 0)}
                            </div>
                          </td>

                          {/* Laba Bersih */}
                          <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 900, fontSize: '13px', color: '#16a34a' }}>
                              +{formatIDR(sale.profitMargin || 0)}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#059669', fontWeight: 700 }}>
                              Margin {marginPercent.toFixed(1)}%
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{
                              background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 800,
                              padding: '2px 8px', borderRadius: '6px'
                            }}>
                              LUNAS
                            </span>
                          </td>

                          {/* Aksi: Cetak Nota */}
                          <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => setReprint({ sale, options: { storeName: appName, customerName: sale.customerName, taxEnabled, taxRate } })}
                              style={{
                                background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0f172a',
                                borderRadius: '8px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer'
                              }}
                              title="Cetak Ulang Struk"
                            >
                              <Printer size={13} /> Cetak
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Desktop Table Summary Footer */}
            {filteredSales.length > 0 && (
              <div style={{
                padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', color: '#64748b'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <span style={{ fontWeight: 800, color: '#0f172a' }}>Ringkasan Sesi:</span>
                  <span>Total Omzet: <strong style={{ color: '#0f172a' }}>{formatIDR(filteredTotals.rev)}</strong></span>
                  <span>Total Laba: <strong style={{ color: '#16a34a' }}>+{formatIDR(filteredTotals.prof)}</strong></span>
                </div>
                <span style={{ fontWeight: 700, color: '#334155' }}>
                  {filteredSales.length} Transaksi Selesai
                </span>
              </div>
            )}
          </div>
        ) : (
          /* -----------------------------------------------------------------
             MOBILE VIEW: NATIVE CARDS FEED & FILTER ACCORDION (MODE MOBILE)
             ----------------------------------------------------------------- */
          <div className="mobile-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Search & Filter Controls Card */}
            <div style={{
              background: '#ffffff', borderRadius: '16px', padding: '14px',
              border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex', flexDirection: 'column', gap: '10px'
            }}>
              {/* Search Input */}
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Cari nama pelanggan atau ID Transaksi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                    borderRadius: '10px', height: '42px', paddingLeft: '38px', paddingRight: '12px',
                    fontSize: '13px', color: '#0f172a'
                  }}
                />
              </div>

              {/* Date Range Picker with Clear button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid #e2e8f0', borderRadius: '10px',
                    height: '38px', padding: '0 8px', fontSize: '12.5px', color: '#0f172a'
                  }}
                />
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid #e2e8f0', borderRadius: '10px',
                    height: '38px', padding: '0 8px', fontSize: '12.5px', color: '#0f172a'
                  }}
                />
                {(startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    style={{
                      background: '#fff1f2', border: '1px solid #fecaca', color: '#e11d48',
                      borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Dropdown Filters (2 Kolom) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%', border: '1px solid #e2e8f0', borderRadius: '10px',
                    height: '38px', padding: '0 10px', fontSize: '13px', background: '#ffffff', color: '#1e293b'
                  }}
                >
                  <option value="ALL">Semua Metode</option>
                  <option value="TUNAI">TUNAI</option>
                  <option value="QRIS">QRIS</option>
                  <option value="KARTU KREDIT">KARTU KREDIT</option>
                  <option value="KARTU DEBIT">KARTU DEBIT</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'latest' | 'oldest')}
                  style={{
                    width: '100%', border: '1px solid #e2e8f0', borderRadius: '10px',
                    height: '38px', padding: '0 10px', fontSize: '13px', background: '#ffffff', color: '#1e293b'
                  }}
                >
                  <option value="latest">Terbaru (Desc)</option>
                  <option value="oldest">Terlama (Asc)</option>
                </select>
              </div>
            </div>

            {/* Restock Alert Banner */}
            {topLowStockItem && (
              <div style={{
                background: '#fff8f6', border: '1px solid #fee2e2', borderRadius: '14px',
                padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: '12px'
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: '#e11d48', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ffffff', flexShrink: 0
                }}>
                  <AlertTriangle size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                      {lowStockItems.length} Produk Perlu Restock
                    </span>
                    <span style={{
                      background: '#dc2626', color: '#ffffff', fontSize: '10px', fontWeight: 800,
                      padding: '2px 8px', borderRadius: '4px'
                    }}>
                      {topLowStockItem.stock <= 0 ? 'STOK HABIS' : 'STOK TIPIS'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {topLowStockItem.name} (Sisa: <strong style={{ color: '#dc2626' }}>{topLowStockItem.stock} {topLowStockItem.unit}</strong>)
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <a
                      href="#/backoffice/purchases"
                      style={{
                        background: '#ffffff', border: '1px solid #fecaca', color: '#dc2626',
                        borderRadius: '999px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 700,
                        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      Buat PO Restock →
                    </a>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Min. stok: {topLowStockItem.minStock || 1} {topLowStockItem.unit}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredSales.length === 0 ? (
                <div style={{
                  background: '#ffffff', borderRadius: '16px', padding: '36px 16px',
                  border: '1px solid #f1f5f9', textAlign: 'center'
                }}>
                  <div style={{ color: '#64748b', fontWeight: 700, fontSize: '14px' }}>Data penjualan tidak ditemukan</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Coba ubah rentang tanggal atau kata kunci pencarian.
                  </div>
                </div>
              ) : (
                filteredSales.map((sale) => {
                  const cashier = sale.employeeName || 'Administrator';
                  const pct = sale.subtotal ? (sale.profitMargin / sale.subtotal) * 100 : 0;

                  return (
                    <div key={sale.id} style={{
                      background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
                    }}>
                      {/* Card Header with Invoice ID */}
                      <div style={{
                        padding: '12px 14px', borderBottom: '1px solid #f8fafc',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbfc'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '13.5px', fontFamily: 'monospace', color: '#0f172a' }}>
                            {sale.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(sale.id)}
                            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#94a3b8' }}
                            title="Salin No. Transaksi"
                          >
                            {copiedId === sale.id ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                          </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            background: '#dcfce7', color: '#15803d', fontSize: '10.5px', fontWeight: 800,
                            padding: '2px 8px', borderRadius: '6px'
                          }}>
                            LUNAS
                          </span>
                          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                            {new Date(sale.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* Card Body: Kasir & Pelanggan */}
                      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                            KASIR
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '26px', height: '26px', borderRadius: '50%',
                              background: '#dbeafe', color: '#2563eb', fontWeight: 700, fontSize: '11px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              {initials(cashier)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a' }}>{cashier}</div>
                              <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>{sale.employeeId || 'dd242b65'}</div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                            PELANGGAN
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '26px', height: '26px', borderRadius: '50%',
                              background: '#fef3c7', color: '#b45309', fontWeight: 700, fontSize: '11px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              {initials(sale.customerName || 'U')}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {sale.customerName}
                              </div>
                              <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                {sale.customerPhone || 'Tanpa Kontak'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Items List */}
                      <div style={{ padding: '0 14px 12px 14px' }}>
                        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {(sale.items || []).map((it, idx2) => (
                            <div key={idx2} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{it.qty}x</span>
                                <span style={{ color: '#334155' }}>{it.name}</span>
                              </div>
                              <span style={{ fontWeight: 600, color: '#64748b' }}>
                                {formatIDR(it.subtotal || it.price * it.qty)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Card Footer: Total, Margin, & Action */}
                      <div style={{
                        padding: '12px 14px', borderTop: '1px solid #f1f5f9',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff'
                      }}>
                        <div>
                          <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
                            {sale.paymentMethod || 'TUNAI'} • Margin: <strong style={{ color: '#16a34a' }}>{pct.toFixed(1)}% (+{formatIDR(sale.profitMargin)})</strong>
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                            {formatIDR(sale.total || sale.subtotal)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setReprint({ sale, options: { storeName: appName, customerName: sale.customerName, taxEnabled, taxRate } })}
                          style={{
                            background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0f172a',
                            borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer'
                          }}
                        >
                          <Printer size={13} /> Cetak Struk
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Mobile Fixed Sticky Bottom Action Bar */}
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: '#ffffff', borderTop: '1px solid #f1f5f9',
              boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', padding: '12px 16px',
              zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  RINGKASAN SESI
                </span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  {filteredSales.length} Transaksi Diproses
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportData}
                style={{
                  background: '#0f172a', color: '#ffffff', border: 'none',
                  borderRadius: '10px', padding: '10px 18px', fontSize: '13px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
                }}
              >
                <Download size={14} /> Ekspor PDF/Excel
              </button>
            </div>
          </div>
        )
      )}

      {/* =====================================================================
          TAB 2: PERINGATAN STOK
          ===================================================================== */}
      {activeTab === 'low-stock' && (
        !isMobileScreen ? (
          /* Desktop Low-Stock Table */
          <div className="desktop-table-view" style={{
            background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0
          }}>
            {/* Header info */}
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: '#fff8f6',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={18} color="#e11d48" />
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                  Daftar Produk Di Bawah Batas Minimum Stok ({lowStockItems.length} Produk)
                </span>
              </div>
              <a
                href="#/backoffice/purchases"
                style={{
                  background: '#dc2626', color: '#ffffff', borderRadius: '8px', padding: '6px 14px',
                  fontSize: '12px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Package size={14} /> Buat PO Pembelian Massal
              </a>
            </div>

            {/* Table */}
            <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '160px' }}>SKU / BARCODE</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>NAMA PRODUK</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '160px' }}>KATEGORI</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '120px' }}>SISA STOK</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '110px' }}>MIN. STOK</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '140px' }}>HARGA BELI (HPP)</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '130px' }}>STATUS</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '150px' }}>AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                        <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto 8px auto' }} />
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Kondisi Stok Aman</div>
                        <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>Tidak ada produk yang berada di bawah batas minimum persediaan.</div>
                      </td>
                    </tr>
                  ) : (
                    lowStockItems.map((p, idx) => {
                      const isOutOfStock = p.stock <= 0;
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 1 ? '#fafbfc' : 'transparent',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 1 ? '#fafbfc' : 'transparent')}
                        >
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, fontSize: '12px', color: '#0f172a' }}>
                            {p.sku || p.barcode || p.id.slice(0, 10)}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                            {p.name}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '12.5px', color: '#64748b' }}>
                            {p.category || '-'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              fontWeight: 900, fontSize: '13px',
                              color: isOutOfStock ? '#dc2626' : '#b45309',
                              background: isOutOfStock ? '#fee2e2' : '#fef3c7',
                              padding: '3px 10px', borderRadius: '6px'
                            }}>
                              {p.stock} {p.unit || 'Pcs'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>
                            {p.minStock ?? 1} {p.unit || 'Pcs'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontSize: '12.5px', color: '#334155' }}>
                            {formatIDR(p.purchasePrice || 0)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              background: isOutOfStock ? '#dc2626' : '#f59e0b',
                              color: '#ffffff', fontSize: '10.5px', fontWeight: 800,
                              padding: '2px 8px', borderRadius: '4px'
                            }}>
                              {isOutOfStock ? 'STOK HABIS' : 'STOK MENIPIS'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <a
                              href="#/backoffice/purchases"
                              style={{
                                background: '#ffffff', border: '1px solid #fecaca', color: '#dc2626',
                                borderRadius: '8px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 700,
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              Buat PO Restock →
                            </a>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Mobile Low-Stock Cards */
          <div className="mobile-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {lowStockItems.length === 0 ? (
              <div style={{
                background: '#ffffff', borderRadius: '16px', padding: '36px 16px',
                border: '1px solid #f1f5f9', textAlign: 'center'
              }}>
                <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Kondisi Stok Aman</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Tidak ada produk di bawah batas minimum stok.</div>
              </div>
            ) : (
              lowStockItems.map(p => (
                <div key={p.id} style={{
                  background: '#ffffff', borderRadius: '14px', padding: '14px',
                  border: '1px solid #fee2e2', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                  display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>{p.name}</div>
                      <div style={{ fontSize: '11.5px', color: '#94a3b8', fontFamily: 'monospace' }}>SKU: {p.sku || p.barcode || p.id}</div>
                    </div>
                    <span style={{
                      background: p.stock <= 0 ? '#dc2626' : '#f59e0b',
                      color: 'white', fontSize: '10px', fontWeight: 800,
                      padding: '2px 8px', borderRadius: '4px'
                    }}>
                      {p.stock <= 0 ? 'HABIS' : 'MENIPIS'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff8f6', padding: '8px 10px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Sisa: <strong style={{ color: '#dc2626', fontSize: '13.5px' }}>{p.stock} {p.unit || 'Pcs'}</strong> (Min: {p.minStock ?? 1})
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                      HPP: {formatIDR(p.purchasePrice || 0)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <a
                      href="#/backoffice/purchases"
                      style={{
                        background: '#dc2626', color: 'white', textDecoration: 'none',
                        borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      <Package size={13} /> Buat PO Pembelian
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        )
      )}

      {/* =====================================================================
          TAB 3: HUTANG SUPPLIER
          ===================================================================== */}
      {activeTab === 'supplier-debts' && (
        !isMobileScreen ? (
          /* Desktop Supplier Debts Table */
          <div className="desktop-table-view" style={{
            background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0
          }}>
            {/* Dark Hero Header Banner */}
            <div style={{
              background: 'linear-gradient(135deg, #0b0f19 0%, #1e1b4b 55%, #3b0712 100%)',
              padding: '16px 20px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
            }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.4px', color: '#cbd5e1', textTransform: 'uppercase' }}>
                  TOTAL KEWAJIBAN HUTANG DAGANG (ACCOUNTS PAYABLE)
                </span>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', margin: '4px 0 2px 0' }}>
                  {formatIDR(totalSupplierDebt)}
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  Kewajiban pembayaran aktif kepada {suppliersWithDebt.length} vendor supplier.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  background: 'rgba(239, 68, 68, 0.25)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)',
                  padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700
                }}>
                  {suppliersWithDebt.length} Tagihan Aktif
                </span>
              </div>
            </div>

            {/* Debts Table */}
            <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>NAMA SUPPLIER / VENDOR</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '150px' }}>TERMIN JATUH TEMPO</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '220px' }}>KONTAK & PIC</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '170px' }}>TOTAL HUTANG (RP)</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '240px' }}>AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliersWithDebt.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                        <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto 8px auto' }} />
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Semua Tagihan Supplier Lunas</div>
                        <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>Tidak ada hutang supplier yang jatuh tempo saat ini.</div>
                      </td>
                    </tr>
                  ) : (
                    suppliersWithDebt.map((supp, idx) => (
                      <tr
                        key={supp.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 1 ? '#fafbfc' : 'transparent',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 1 ? '#fafbfc' : 'transparent')}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>{supp.name}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>ID: {supp.id}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: '#fff1f2', color: '#e11d48',
                            fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px'
                          }}>
                            Tempo {supp.paymentTermDays || 14} Hari
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#334155' }}>
                            PIC: {supp.contact || 'Petugas Vendor'}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Telp: {supp.phone || '-'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, fontSize: '15px', color: '#dc2626' }}>
                            {formatIDR(supp.totalPayable || 0)}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <a
                              href={`https://wa.me/${(supp.phone || '').replace(/[^0-9]/g, '')}?text=Halo%20${encodeURIComponent(supp.name)},%20kami%20dari%20toko%20ingin%20konfirmasi%20pembayaran%20faktur...`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: '#ffffff', border: '1px solid #cbd5e1', color: '#1e293b',
                                borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700,
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px'
                              }}
                            >
                              <MessageSquare size={13} color="#16a34a" /> Chat WA
                            </a>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDebtSupplier(supp);
                                debtAmount || setDebtAmount(supp.totalPayable || 0);
                                setIsDebtModalOpen(true);
                              }}
                              style={{
                                background: '#dc2626', color: '#ffffff', border: 'none',
                                borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700,
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'
                              }}
                            >
                              <CreditCard size={13} /> Catat Pelunasan
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Mobile Supplier Debts Cards */
          <div className="mobile-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #0b0f19 0%, #1e1b4b 55%, #3b0712 100%)',
              borderRadius: '16px', padding: '16px 18px', color: '#ffffff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.3px', color: '#cbd5e1', textTransform: 'uppercase' }}>
                  TOTAL KEWAJIBAN HUTANG (ACCOUNTS PAYABLE)
                </span>
                <span style={{
                  background: 'rgba(239, 68, 68, 0.25)', color: '#fca5a5',
                  padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700
                }}>
                  {suppliersWithDebt.length} Tagihan Aktif
                </span>
              </div>

              <div style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', margin: '6px 0 2px 0' }}>
                {formatIDR(totalSupplierDebt)}
              </div>

              <div style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                Dari total {suppliersWithDebt.length} vendor dengan faktur yang mendekati jatuh tempo.
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '0.5px solid rgba(255,255,255,0.15)', paddingTop: '10px', marginTop: '12px'
              }}>
                <span
                  onClick={() => fetchSuppliers()}
                  style={{ fontSize: '11px', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={11} /> Segarkan Data
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Sinkron: Real-time
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {suppliersWithDebt.length === 0 ? (
                <div style={{
                  background: '#ffffff', borderRadius: '16px', padding: '36px 16px',
                  border: '1px solid #f1f5f9', textAlign: 'center'
                }}>
                  <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Semua Tagihan Lunas</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Tidak ada hutang supplier yang jatuh tempo.</div>
                </div>
              ) : (
                suppliersWithDebt.map(supp => (
                  <div
                    key={supp.id}
                    style={{
                      background: '#ffffff', borderRadius: '16px', padding: '16px',
                      border: '1px solid #fee2e2', boxShadow: '0 2px 8px rgba(239,68,68,0.04)',
                      display: 'flex', flexDirection: 'column', gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{
                          background: '#fff1f2', color: '#e11d48',
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px'
                        }}>
                          Tempo {supp.paymentTermDays || 14} Hari
                        </span>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                          {supp.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          PIC: {supp.contact || 'Petugas Vendor'} • Telp: {supp.phone || '-'}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', display: 'block' }}>
                          TOTAL HUTANG
                        </span>
                        <span style={{ fontSize: '18px', fontWeight: 900, color: '#dc2626' }}>
                          {formatIDR(supp.totalPayable || 0)}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <a
                        href={`https://wa.me/${(supp.phone || '').replace(/[^0-9]/g, '')}?text=Halo%20${encodeURIComponent(supp.name)},%20kami%20dari%20toko%20ingin%20konfirmasi%20pembayaran%20faktur...`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          flex: 1, background: '#ffffff', border: '1px solid #cbd5e1',
                          color: '#1e293b', borderRadius: '999px', padding: '10px 14px',
                          fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                        }}
                      >
                        <MessageSquare size={15} color="#16a34a" /> Chat PIC
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDebtSupplier(supp);
                          setDebtAmount(supp.totalPayable || 0);
                          setIsDebtModalOpen(true);
                        }}
                        style={{
                          flex: 1, background: '#dc2626', color: '#ffffff', border: 'none',
                          borderRadius: '999px', padding: '10px 14px',
                          fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          boxShadow: '0 4px 12px rgba(220,38,38,0.2)'
                        }}
                      >
                        <CreditCard size={15} color="#ffffff" /> Catat Pelunasan
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      )}

      {/* =====================================================================
          MODAL: PILIHAN EKSPOR PDF / EXCEL
          ===================================================================== */}
      {isExportModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '420px',
            overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              background: '#0f172a', color: 'white', padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>Ekspor Laporan & Analitik</div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Pilih format dokumen untuk mengekspor data performa toko Anda:
              </p>

              <button
                type="button"
                onClick={handleDownloadExcel}
                style={{
                  background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px',
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px',
                  cursor: 'pointer', textAlign: 'left'
                }}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>Microsoft Excel (.xlsx)</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Lengkap dengan sheet penjualan, stok & analitik</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsExportModalOpen(false);
                  window.print();
                }}
                style={{
                  background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px',
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px',
                  cursor: 'pointer', textAlign: 'left'
                }}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Printer size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>Cetak PDF / Print Ringkasan</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Simpan format dokumen cetak siap arsip</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: CATAT PELUNASAN HUTANG SUPPLIER
          ===================================================================== */}
      {isDebtModalOpen && selectedDebtSupplier && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '440px',
            overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              background: '#1e1b4b', padding: '16px 20px', color: 'white',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>Catat Pembayaran Hutang</div>
              <button
                type="button"
                onClick={() => setIsDebtModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePayDebtSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>SUPPLIER:</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{selectedDebtSupplier.name}</div>
                <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 700, marginTop: '2px' }}>
                  Sisa Hutang: {formatIDR(selectedDebtSupplier.totalPayable || 0)}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>NOMINAL PEMBAYARAN (RP)</label>
                <input
                  type="number"
                  min="1"
                  max={selectedDebtSupplier.totalPayable || 999999999}
                  value={debtAmount}
                  onChange={e => setDebtAmount(Number(e.target.value))}
                  required
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '40px', padding: '0 10px', fontSize: '15px', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>METODE PEMBAYARAN</label>
                <select
                  value={debtMethod}
                  onChange={e => setDebtMethod(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '40px', padding: '0 10px', fontSize: '13.5px' }}
                >
                  <option value="Transfer Bank (BCA)">Transfer Bank (BCA)</option>
                  <option value="Transfer Bank (Mandiri)">Transfer Bank (Mandiri)</option>
                  <option value="Transfer Bank (BRI)">Transfer Bank (BRI)</option>
                  <option value="Tunai / Kas Toko">Tunai / Kas Toko</option>
                  <option value="Cek / Bilyet Giro">Cek / Bilyet Giro</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>CATATAN / NO. REFERENSI</label>
                <input
                  type="text"
                  placeholder="Contoh: Ref TRF-BCA-10293"
                  value={debtNote}
                  onChange={e => setDebtNote(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '40px', padding: '0 10px', fontSize: '13.5px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsDebtModalOpen(false)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPayingDebt}
                  style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {isPayingDebt ? 'Menyimpan...' : 'Konfirmasi Pelunasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          RECEIPT MODAL (CETAK ULANG STRUK)
          ===================================================================== */}
      {reprint && (
        <ReceiptModal
          sale={reprint.sale}
          options={reprint.options}
          onClose={() => setReprint(null)}
        />
      )}

    </div>
  );
};

export default Reports;
