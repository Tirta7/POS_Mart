import React, { useState, useEffect, useMemo } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import { useAuthStore } from '../../store/useAuthStore';
import { 
  ShoppingCart, Plus, Trash2, Check, Search, Camera, X, 
  CreditCard, RefreshCw, MessageSquare, Printer, CheckCircle2, Clock
} from 'lucide-react';
import type { StockTransaction, Supplier } from '../../types';
import BarcodeScannerCamera from '../../components/BarcodeScannerCamera';

interface CartItem {
  productId: string;
  name: string;
  currentStock: number;
  qty: number;
  batchNo: string;
  expiryDate: string;
  purchasePrice: number;
  originalPrice: number;
  sellingPrice: number;
  unit: string;
  subtotal: number;
  showBatchExp?: boolean;
}

type PurchaseTab = 'FORM' | 'HISTORY' | 'DEBT';

const Purchases: React.FC = () => {
  const { 
    products, updateProduct, addTransaction, addProduct, categories, 
    transactions, fetchTransactions, fetchProducts 
  } = useInventoryStore();
  const { suppliers, fetchSuppliers, paySupplierDebt, addSupplier } = useSupplierStore();
  const { currentUser } = useAuthStore();
  
  // Screen detection for desktop vs mobile separation
  const [isMobileScreen, setIsMobileScreen] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<PurchaseTab>('FORM');

  // PO Form states
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [documentNo, setDocumentNo] = useState(() => `PO-${Date.now()}`);
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentTerm, setPaymentTerm] = useState<string>('Tempo 14 Hari (Hutang)');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [items, setItems] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History filters & modal
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [selectedHistoryTx, setSelectedHistoryTx] = useState<StockTransaction | null>(null);

  // Supplier Debt modal
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [selectedDebtSupplier, setSelectedDebtSupplier] = useState<Supplier | null>(null);
  const [debtAmount, setDebtAmount] = useState<number>(0);
  const [debtMethod, setDebtMethod] = useState<string>('Transfer Bank (BCA)');
  const [debtNote, setDebtNote] = useState<string>('');
  const [isPayingDebt, setIsPayingDebt] = useState(false);

  // Quick Add Product modal
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

  // Quick Add Supplier modal
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppContact, setNewSuppContact] = useState('');
  const [newSuppPhone, setNewSuppPhone] = useState('');
  const [newSuppPaymentTerms, setNewSuppPaymentTerms] = useState(14);
  const [newSuppPayable, setNewSuppPayable] = useState('');

  // Initial fetch
  useEffect(() => {
    fetchProducts();
    fetchTransactions();
    fetchSuppliers();
  }, [fetchProducts, fetchTransactions, fetchSuppliers]);

  // Set default selected supplier if none selected and suppliers exist
  useEffect(() => {
    if (!selectedSupplier && suppliers && suppliers.length > 0) {
      setSelectedSupplier(suppliers[0].id);
    }
  }, [suppliers, selectedSupplier]);

  // Calculations & Analytics
  const formatIDR = (num: number) => 'Rp ' + (Number(num) || 0).toLocaleString('id-ID');

  const totalValue = useMemo(() => {
    return items.reduce((sum, item) => sum + item.subtotal, 0);
  }, [items]);

  const totalQty = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  }, [items]);

  // Purchase History (Type === 'IN')
  const purchaseHistory = useMemo(() => {
    return (transactions || [])
      .filter(t => t.type === 'IN')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  // Suppliers with Debt
  const suppliersWithDebt = useMemo(() => {
    return (suppliers || []).filter(s => (s.totalPayable || 0) > 0);
  }, [suppliers]);

  const totalSupplierDebt = useMemo(() => {
    return suppliersWithDebt.reduce((sum, s) => sum + (s.totalPayable || 0), 0);
  }, [suppliersWithDebt]);

  // Monthly Purchases
  const monthlyPurchases = useMemo(() => {
    const now = new Date();
    const currM = now.getMonth();
    const currY = now.getFullYear();
    return purchaseHistory.filter(tx => {
      const d = new Date(tx.date);
      return d.getMonth() === currM && d.getFullYear() === currY;
    });
  }, [purchaseHistory]);

  const totalMonthlySpent = useMemo(() => {
    return monthlyPurchases.reduce((sum, tx) => sum + (Number(tx.totalValue) || 0), 0);
  }, [monthlyPurchases]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase();
    const now = new Date();
    
    return purchaseHistory.filter(tx => {
      if (historyFilter === 'TODAY') {
        const d = new Date(tx.date);
        if (d.toDateString() !== now.toDateString()) return false;
      } else if (historyFilter === 'WEEK') {
        const diffDays = (now.getTime() - new Date(tx.date).getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      } else if (historyFilter === 'MONTH') {
        const d = new Date(tx.date);
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      }

      if (!q) return true;
      const supp = suppliers.find(s => s.id === tx.supplierId);
      const matchDoc = tx.documentNo && tx.documentNo.toLowerCase().includes(q);
      const matchSupp = supp?.name && supp.name.toLowerCase().includes(q);
      const matchItem = tx.items?.some(it => 
        (it.productName && it.productName.toLowerCase().includes(q)) || 
        (it.productId && it.productId.toLowerCase().includes(q))
      );
      return matchDoc || matchSupp || matchItem;
    });
  }, [purchaseHistory, historySearch, historyFilter, suppliers]);

  // Product Search results
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return products.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [products, searchTerm]);

  // Add Item to cart
  const handleAddItem = (product: any) => {
    const existing = items.find(i => i.productId === product.id);
    if (existing) {
      handleItemChange(product.id, 'qty', existing.qty + 1);
      setSearchTerm('');
      return;
    }
    const buyPrice = Number(product.purchasePrice) || 0;
    setItems(prev => [...prev, {
      productId: product.id,
      name: product.name,
      currentStock: product.stock || 0,
      qty: 1,
      batchNo: '',
      expiryDate: '',
      purchasePrice: buyPrice,
      originalPrice: buyPrice,
      sellingPrice: Number(product.sellingPrice) || 0,
      unit: product.unit || 'Pcs',
      subtotal: buyPrice,
      showBatchExp: false
    }]);
    setSearchTerm('');
  };

  // Add Quick Sample Product (for instant testing)
  const handleAddSampleProduct = () => {
    if (products.length > 0) {
      handleAddItem(products[0]);
    } else {
      const sample = {
        id: `SAMPLE-${Date.now()}`,
        name: 'Produk Sampel',
        stock: 10,
        purchasePrice: 10000,
        sellingPrice: 15000,
        unit: 'Pcs'
      };
      handleAddItem(sample);
    }
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
    setItems(prev => prev.filter(i => i.productId !== productId));
  };

  const handleItemChange = (productId: string, field: keyof CartItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.productId === productId) {
        const updated = { ...item, [field]: value };
        if (field === 'qty' || field === 'purchasePrice') {
          const qty = Number(field === 'qty' ? value : item.qty) || 0;
          const price = Number(field === 'purchasePrice' ? value : item.purchasePrice) || 0;
          updated.subtotal = qty * price;
        }
        return updated;
      }
      return item;
    }));
  };

  // Re-order from past PO
  const handleReorder = (tx: StockTransaction) => {
    if (tx.supplierId) {
      setSelectedSupplier(tx.supplierId);
    }
    const newItems: CartItem[] = (tx.items || []).map(it => {
      const prod = products.find(p => p.id === it.productId);
      const buyPrice = it.purchasePrice || prod?.purchasePrice || 0;
      return {
        productId: it.productId,
        name: it.productName || prod?.name || `Produk ${it.productId}`,
        currentStock: prod?.stock || 0,
        qty: it.qty || 1,
        batchNo: it.batchNo || '',
        expiryDate: it.expiryDate || '',
        purchasePrice: buyPrice,
        originalPrice: prod?.purchasePrice || buyPrice,
        sellingPrice: prod?.sellingPrice || 0,
        unit: prod?.unit || 'Pcs',
        subtotal: (it.qty || 1) * buyPrice,
        showBatchExp: Boolean(it.batchNo || it.expiryDate)
      };
    });
    setItems(newItems);
    setDocumentNo(`PO-${Date.now()}`);
    setActiveTab('FORM');
    if (selectedHistoryTx) setSelectedHistoryTx(null);
  };

  // Submit PO
  const handleSubmit = async (e?: React.FormEvent, isDraft = false) => {
    if (e) e.preventDefault();
    if (!selectedSupplier) {
      alert("Pilih supplier terlebih dahulu!");
      return;
    }
    if (items.length === 0) {
      alert("Tambahkan minimal 1 produk belanja!");
      return;
    }
    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      const supp = suppliers.find(s => s.id === selectedSupplier);

      // 1. Catat Transaksi Pembelian (IN)
      const transaction: StockTransaction = {
        id: `TXN-${Date.now()}`,
        type: 'IN',
        date: orderDate ? new Date(orderDate).toISOString() : new Date().toISOString(),
        documentNo: documentNo.trim(),
        supplierId: selectedSupplier,
        employeeId: currentUser.id,
        items: items.map(({ name, currentStock, originalPrice, sellingPrice, unit, showBatchExp, ...rest }) => ({
          ...rest,
          productName: name,
          unit: unit
        })),
        totalValue,
        note: orderNotes ? `${orderNotes} (${paymentTerm})` : `PO dari ${supp?.name || 'Supplier'} (${paymentTerm})`
      };

      await addTransaction(transaction);

      // 2. Update HPP dan stok produk jika bukan draft murni
      for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const oldQty = product.stock;
          const oldPrice = product.purchasePrice || 0;
          const addedQty = Number(item.qty);
          const addedPrice = Number(item.purchasePrice);
          const newTotalQty = oldQty + addedQty;
          
          const newAvgPrice = newTotalQty > 0 
            ? Math.round(((oldQty * oldPrice) + (addedQty * addedPrice)) / newTotalQty)
            : oldPrice;

          await updateProduct(product.id, {
            ...product,
            stock: newTotalQty,
            purchasePrice: newAvgPrice
          });
        }
      }

      alert(isDraft ? "Draf pembelian berhasil disimpan!" : "PO Berhasil Diterbitkan! Stok barang dan hutang supplier telah diperbarui.");
      setItems([]);
      setDocumentNo(`PO-${Date.now()}`);
      setOrderNotes('');
      fetchSuppliers();
      fetchTransactions();
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan saat memproses pembelian.");
    } finally {
      setIsSubmitting(false);
    }
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

  // Quick Add Supplier Form
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuppName.trim()) return;

    try {
      const newSup = {
        name: newSuppName.trim(),
        contact: newSuppContact.trim(),
        phone: newSuppPhone.trim(),
        paymentTermDays: Number(newSuppPaymentTerms) || 14,
        totalPayable: Number(newSuppPayable) || 0
      };

      await addSupplier(newSup);
      alert(`Supplier ${newSuppName} berhasil ditambahkan!`);
      setIsNewSupplierModalOpen(false);
      setNewSuppName('');
      setNewSuppContact('');
      setNewSuppPhone('');
      setNewSuppPayable('');
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      alert("Gagal menambahkan supplier.");
    }
  };

  // Quick Add Product Form
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdBarcode || !newProdName || !newProdSellingPrice) return;
    
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
    handleAddItem(createdProd);
    
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

  return (
    <div 
      className="bo-container" 
      style={isMobileScreen ? {
        overflowY: 'auto', padding: '16px 14px 120px 14px', maxWidth: '780px', margin: '0 auto'
      } : {
        display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'
      }}
    >
      
      {/* =====================================================================
          1. PAGE HEADER DENGAN ICON SQUIRCLE MERAH
          ===================================================================== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '14px',
          background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <ShoppingCart size={22} color="#e11d48" />
        </div>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
            Pembelian (Purchase Order)
          </h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0', lineHeight: 1.4 }}>
            Kelola pesanan pembelian supplier, penerimaan stok, dan buku hutang usaha secara terpadu.
          </p>
        </div>
      </div>

      {/* =====================================================================
          2. KPI METRICS CARDS (3 KOLOM PERSIS MOCKUP)
          ===================================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: isMobileScreen ? '8px' : '14px',
        marginBottom: '14px',
        flexShrink: 0
      }}>
        
        {/* Card 1: BELANJA BULAN INI */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '12px 10px',
          border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '4px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
            BELANJA BULAN INI
          </span>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
            {formatIDR(totalMonthlySpent)}
          </div>
          <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '8px' }}>●</span> {monthlyPurchases.length} Faktur Masuk
          </span>
        </div>

        {/* Card 2: HUTANG (HIGHLIGHTED MERAH DENGAN TITIK MERAH) */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '12px 10px',
          border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: '4px',
          boxShadow: '0 2px 8px rgba(239,68,68,0.06)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase' }}>
              HUTANG
            </span>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#dc2626' }}></span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>
            {formatIDR(totalSupplierDebt)}
          </div>
          <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 500 }}>
            {suppliersWithDebt.length} Vendor Jatuh Tempo
          </span>
        </div>

        {/* Card 3: FAKTUR PO */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '12px 10px',
          border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '4px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
            FAKTUR PO
          </span>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
            {purchaseHistory.length}
          </div>
          <span style={{ fontSize: '10.5px', color: '#10b981', fontWeight: 600 }}>
            Semua Periode
          </span>
        </div>
      </div>

      {/* =====================================================================
          3. SEGMENTED TABS (BUAT PO BARU, RIWAYAT, HUTANG)
          ===================================================================== */}
      <div style={{
        background: '#e9eef5', padding: '4px', borderRadius: '14px',
        display: isMobileScreen ? 'flex' : 'inline-flex', gap: '4px', marginBottom: '14px',
        flexShrink: 0
      }}>
        {/* Tab 1: Buat PO Baru */}
        <button
          type="button"
          onClick={() => setActiveTab('FORM')}
          style={{
            flex: 1, border: 'none',
            background: activeTab === 'FORM' ? '#ffffff' : 'transparent',
            color: activeTab === 'FORM' ? '#dc2626' : '#475569',
            borderRadius: '10px', padding: '8px 6px',
            fontSize: '13px', fontWeight: activeTab === 'FORM' ? 700 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            cursor: 'pointer',
            boxShadow: activeTab === 'FORM' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
          }}
        >
          <Plus size={16} color={activeTab === 'FORM' ? '#dc2626' : '#64748b'} />
          <span>Buat PO Baru</span>
        </button>

        {/* Tab 2: Riwayat */}
        <button
          type="button"
          onClick={() => setActiveTab('HISTORY')}
          style={{
            flex: 1, border: 'none',
            background: activeTab === 'HISTORY' ? '#ffffff' : 'transparent',
            color: activeTab === 'HISTORY' ? '#dc2626' : '#475569',
            borderRadius: '10px', padding: '8px 6px',
            fontSize: '13px', fontWeight: activeTab === 'HISTORY' ? 700 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            cursor: 'pointer',
            boxShadow: activeTab === 'HISTORY' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
          }}
        >
          <Clock size={15} color={activeTab === 'HISTORY' ? '#dc2626' : '#64748b'} />
          <span>Riwayat</span>
          <span style={{
            background: '#e2e8f0', color: '#475569',
            borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700
          }}>
            {purchaseHistory.length}
          </span>
        </button>

        {/* Tab 3: Hutang */}
        <button
          type="button"
          onClick={() => setActiveTab('DEBT')}
          style={{
            flex: 1, border: 'none',
            background: activeTab === 'DEBT' ? '#ffffff' : 'transparent',
            color: activeTab === 'DEBT' ? '#dc2626' : '#475569',
            borderRadius: '10px', padding: '8px 6px',
            fontSize: '13px', fontWeight: activeTab === 'DEBT' ? 700 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            cursor: 'pointer',
            boxShadow: activeTab === 'DEBT' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
          }}
        >
          <CreditCard size={15} color={activeTab === 'DEBT' ? '#dc2626' : '#64748b'} />
          <span>Hutang</span>
          <span style={{
            background: '#dc2626', color: '#ffffff',
            borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700
          }}>
            {suppliersWithDebt.length}
          </span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: FORM BUAT PO BARU
          ===================================================================== */}
      {activeTab === 'FORM' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Card: Detail Pembelian & Faktur */}
          <div style={{
            background: '#ffffff', borderRadius: '16px', padding: '16px',
            border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            {/* Header with red dot & No. Baru button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626', display: 'inline-block' }}></span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Detail Pembelian & Faktur</span>
              </div>
              <button
                type="button"
                onClick={() => setDocumentNo(`PO-${Date.now()}`)}
                style={{
                  background: '#fff5f5', border: '1px solid #fecaca', color: '#dc2626',
                  borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
                }}
              >
                <RefreshCw size={12} /> No. Baru
              </button>
            </div>

            {/* Field: NO. FAKTUR / DOKUMEN PO */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                NO. FAKTUR / DOKUMEN PO
              </label>
              <input
                type="text"
                value={documentNo}
                onChange={e => setDocumentNo(e.target.value)}
                style={{
                  width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: '10px', height: '42px', padding: '0 12px',
                  fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: '#0f172a'
                }}
              />
            </div>

            {/* Field: TANGGAL PEMBELIAN */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                TANGGAL PEMBELIAN
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                    borderRadius: '10px', height: '42px', padding: '0 12px',
                    fontSize: '13.5px', color: '#0f172a'
                  }}
                />
              </div>
            </div>

            {/* Field: PILIH SUPPLIER / VENDOR */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  PILIH SUPPLIER / VENDOR
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewSupplierModalOpen(true)}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: '#dc2626', fontWeight: 700, fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  + Supplier Baru
                </button>
              </div>
              <select
                value={selectedSupplier}
                onChange={e => setSelectedSupplier(e.target.value)}
                style={{
                  width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                  borderRadius: '10px', height: '44px', padding: '0 12px',
                  fontSize: '13.5px', color: '#0f172a', fontWeight: 500
                }}
              >
                {suppliers.length === 0 ? (
                  <option value="">-- Belum ada supplier --</option>
                ) : (
                  suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Hutang: {formatIDR(s.totalPayable || 0)})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Field: KETENTUAN PEMBAYARAN */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                KETENTUAN PEMBAYARAN
              </label>
              <select
                value={paymentTerm}
                onChange={e => setPaymentTerm(e.target.value)}
                style={{
                  width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                  borderRadius: '10px', height: '44px', padding: '0 12px',
                  fontSize: '13.5px', color: '#0f172a', fontWeight: 500
                }}
              >
                <option value="Tempo 14 Hari (Hutang)">Tempo 14 Hari (Hutang)</option>
                <option value="Tempo 7 Hari (Hutang)">Tempo 7 Hari (Hutang)</option>
                <option value="Tempo 30 Hari (Hutang)">Tempo 30 Hari (Hutang)</option>
                <option value="Tunai / Cash (Lunas)">Tunai / Cash (Lunas)</option>
                <option value="Konsinyasi">Konsinyasi (Bagi Hasil)</option>
              </select>
            </div>

            {/* Field: CATATAN FAKTUR (OPSIONAL) */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                CATATAN FAKTUR (OPSIONAL)
              </label>
              <input
                type="text"
                placeholder="No. Surat Jalan, info pengiriman..."
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                style={{
                  width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                  borderRadius: '10px', height: '42px', padding: '0 12px',
                  fontSize: '13.5px', color: '#0f172a'
                }}
              />
            </div>
          </div>

          {/* Card: CARI PRODUK ATAU SCAN BARCODE */}
          <div style={{
            background: '#ffffff', borderRadius: '16px', padding: '16px',
            border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.2px', marginBottom: '10px' }}>
              CARI PRODUK ATAU SCAN BARCODE
            </div>

            <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Ketik nama produk, SKU, atau scan..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                    borderRadius: '10px', height: '44px', paddingLeft: '38px', paddingRight: '12px',
                    fontSize: '13.5px', color: '#0f172a'
                  }}
                />
              </div>

              {/* Green Camera Button */}
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                style={{
                  width: '44px', height: '44px', borderRadius: '10px',
                  background: '#059669', border: 'none', color: '#ffffff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0
                }}
                title="Buka Kamera Barcode"
              >
                <Camera size={18} />
              </button>

              {/* Autocomplete Dropdown */}
              {searchTerm && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: '52px',
                  background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.12)', zIndex: 50, maxHeight: '260px',
                  overflowY: 'auto', marginTop: '6px'
                }}>
                  {filteredProducts.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '8px' }}>Produk tidak ditemukan</div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewProdBarcode(searchTerm);
                          setNewProdName('');
                          setIsNewProductModalOpen(true);
                        }}
                        style={{
                          background: '#dc2626', color: 'white', border: 'none',
                          borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        + Buat Produk Baru
                      </button>
                    </div>
                  ) : (
                    filteredProducts.map(p => (
                      <div
                        key={p.id}
                        onClick={() => handleAddItem(p)}
                        style={{
                          padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>{p.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Stok: {p.stock} • HPP: {formatIDR(p.purchasePrice)}</div>
                        </div>
                        <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 700 }}>+ Tambah</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* =================================================================
              PO ITEMS LIST / EMPTY STATE PERSIS SCREENSHOT 1 & 2
              ================================================================= */}
          {items.length === 0 ? (
            <div style={{
              border: '1.5px dashed #cbd5e1', borderRadius: '16px',
              padding: '36px 16px', background: '#ffffff', textAlign: 'center'
            }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: '#f0f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto', color: '#94a3b8'
              }}>
                <ShoppingCart size={26} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '12px' }}>
                Daftar Barang Belanja Masih Kosong
              </div>
              <div style={{
                fontSize: '12px', color: '#64748b', lineHeight: 1.5,
                maxWidth: '300px', margin: '6px auto 16px auto'
              }}>
                Gunakan kolom pencarian di atas atau tombol scan kamera untuk menambahkan produk yang akan dipesan ke supplier.
              </div>
              <button
                type="button"
                onClick={handleAddSampleProduct}
                style={{
                  background: '#f1f5f9', color: '#334155', border: 'none',
                  borderRadius: '999px', padding: '8px 18px', fontSize: '12.5px', fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Plus size={14} color="#dc2626" /> Tambah Contoh Produk Cepat
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, idx) => {
                const product = products.find(p => p.id === item.productId);
                const sellPrice = product?.sellingPrice || item.sellingPrice || 0;
                const margin = sellPrice > 0 
                  ? (((sellPrice - item.purchasePrice) / sellPrice) * 100).toFixed(0)
                  : null;

                return (
                  <div key={item.productId} style={{
                    background: '#ffffff', borderRadius: '14px', padding: '14px',
                    border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', gap: '10px'
                  }}>
                    {/* Header item */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, paddingRight: '8px' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                          <span style={{ color: '#94a3b8', marginRight: '4px' }}>#{idx + 1}</span>
                          {item.name}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            Stok: {item.currentStock} {item.unit}
                          </span>
                          {sellPrice > 0 && (
                            <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              Jual: {formatIDR(sellPrice)}
                            </span>
                          )}
                          {margin !== null && (
                            <span style={{ 
                              fontSize: '11px', 
                              background: Number(margin) > 0 ? '#dcfce7' : '#fee2e2', 
                              color: Number(margin) > 0 ? '#15803d' : '#b91c1c', 
                              padding: '1px 6px', borderRadius: '4px', fontWeight: 700 
                            }}>
                              Margin: {margin}%
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.productId)}
                        style={{
                          background: '#fee2e2', border: 'none', borderRadius: '8px',
                          width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#ef4444', cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Stepper Qty & Presets */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                        <button
                          type="button"
                          onClick={() => handleItemChange(item.productId, 'qty', Math.max(1, item.qty - 1))}
                          style={{
                            width: '32px', height: '32px', border: 'none', background: '#ffffff',
                            borderRadius: '6px', fontWeight: 700, fontSize: '16px', color: '#0f172a', cursor: 'pointer'
                          }}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={e => handleItemChange(item.productId, 'qty', Math.max(1, Number(e.target.value)))}
                          style={{
                            width: '46px', textAlign: 'center', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '14px', color: '#0f172a'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleItemChange(item.productId, 'qty', item.qty + 1)}
                          style={{
                            width: '32px', height: '32px', border: 'none', background: '#ffffff',
                            borderRadius: '6px', fontWeight: 700, fontSize: '16px', color: '#0f172a', cursor: 'pointer'
                          }}
                        >
                          +
                        </button>
                      </div>

                      {/* Presets */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleItemChange(item.productId, 'qty', item.qty + 5)}
                          style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleItemChange(item.productId, 'qty', item.qty + 10)}
                          style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleItemChange(item.productId, 'qty', item.qty + 24)}
                          style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                        >
                          +24 Dus
                        </button>
                      </div>
                    </div>

                    {/* Harga Beli & Subtotal */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f8fafc', paddingTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>HPP: Rp</span>
                        <input
                          type="number"
                          min="0"
                          value={item.purchasePrice}
                          onChange={e => handleItemChange(item.productId, 'purchasePrice', Number(e.target.value))}
                          style={{
                            width: '100px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '6px',
                            padding: '0 8px', fontWeight: 700, fontSize: '13px'
                          }}
                        />
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>SUBTOTAL</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#dc2626' }}>
                          {formatIDR(item.subtotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* =================================================================
              FIXED STICKY BOTTOM BAR (PERSIS SCREENSHOT 1 & 2)
              ================================================================= */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: '#ffffff', borderTop: '1px solid #f1f5f9',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', padding: '12px 16px',
            zIndex: 100, display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  TOTAL ESTIMASI PO
                </span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                  {formatIDR(totalValue)}
                </div>
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>
                {items.length} Item Dipilih {totalQty > 0 ? `(${totalQty} Unit)` : ''}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleSubmit(undefined, true)}
                disabled={isSubmitting || items.length === 0}
                style={{
                  background: '#f1f5f9', color: '#1e293b', border: 'none',
                  borderRadius: '10px', padding: '12px 18px', fontWeight: 700, fontSize: '14px',
                  cursor: items.length === 0 ? 'not-allowed' : 'pointer', opacity: items.length === 0 ? 0.6 : 1
                }}
              >
                Simpan Draf
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(undefined, false)}
                disabled={isSubmitting || items.length === 0}
                style={{
                  flex: 1, background: '#dc2626', color: '#ffffff', border: 'none',
                  borderRadius: '10px', padding: '12px 20px', fontWeight: 700, fontSize: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  cursor: items.length === 0 ? 'not-allowed' : 'pointer', opacity: items.length === 0 ? 0.6 : 1
                }}
              >
                <Check size={16} /> Terbitkan PO Sekarang
              </button>
            </div>
          </div>

        </div>
      )}

      {/* =====================================================================
          TAB 2: RIWAYAT PO & FAKTUR (DESKTOP TABLE vs MOBILE CARDS)
          ===================================================================== */}
      {activeTab === 'HISTORY' && (
        !isMobileScreen ? (
          /* Desktop Table View */
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
              <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Cari No. PO, Supplier, nama item..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  style={{
                    width: '100%', paddingLeft: '34px', paddingRight: '12px',
                    height: '36px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    fontSize: '12.5px', color: '#0f172a', background: '#ffffff'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Periode</span>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                  {(['ALL', 'TODAY', 'WEEK', 'MONTH'] as const).map(f => {
                    const labels = { ALL: 'Semua', TODAY: 'Hari Ini', WEEK: '7 Hari', MONTH: 'Bulan Ini' };
                    const isActive = historyFilter === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setHistoryFilter(f)}
                        style={{
                          border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px',
                          fontWeight: isActive ? 800 : 600, cursor: 'pointer',
                          background: isActive ? '#ffffff' : 'transparent',
                          color: isActive ? '#dc2626' : '#64748b'
                        }}
                      >
                        {labels[f]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <span style={{
                background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
                borderRadius: '999px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 700
              }}>
                {filteredHistory.length} Faktur Masuk
              </span>
            </div>

            {/* Table */}
            <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '180px' }}>NO. FAKTUR PO</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '160px' }}>TANGGAL & WAKTU</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>SUPPLIER</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '160px' }}>PRODUK & UNIT</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '160px' }}>TOTAL NOMINAL</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '110px' }}>STATUS</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '190px' }}>AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                        <Clock size={40} style={{ opacity: 0.2, margin: '0 auto 8px auto' }} />
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Daftar Riwayat Faktur Pembelian (0)</div>
                        <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>Tidak ada faktur pembelian pada periode yang dipilih.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((tx, idx) => {
                      const supp = suppliers.find(s => s.id === tx.supplierId);
                      const itemCount = tx.items?.length || 0;
                      const unitCount = (tx.items || []).reduce((acc, it) => acc + (it.qty || 0), 0);

                      return (
                        <tr
                          key={tx.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 1 ? '#fafbfc' : 'transparent',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 1 ? '#fafbfc' : 'transparent')}
                        >
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, fontSize: '12.5px', color: '#0f172a' }}>
                            {tx.documentNo}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '12.5px', color: '#475569' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                              {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {new Date(tx.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                            {supp?.name || 'Supplier Tanpa Nama'}
                            {supp?.contact && <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, display: 'block' }}>PIC: {supp.contact}</span>}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12.5px', color: '#475569' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{itemCount}</span> produk ({unitCount} unit)
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, fontSize: '13.5px', color: '#dc2626' }}>
                            {formatIDR(tx.totalValue)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px' }}>
                              MASUK (IN)
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedHistoryTx(tx)}
                                style={{
                                  background: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1',
                                  borderRadius: '8px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                Detail Faktur
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReorder(tx)}
                                style={{
                                  background: '#dc2626', color: '#ffffff', border: 'none',
                                  borderRadius: '8px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                Pesan Lagi
                              </button>
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
        ) : (
          /* Mobile Cards View */
          <div className="mobile-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Search Bar */}
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Cari No. PO, Supplier, nama item..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{
                  width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
                  borderRadius: '12px', height: '42px', paddingLeft: '38px', paddingRight: '12px',
                  fontSize: '13.5px', color: '#0f172a'
                }}
              />
            </div>

            {/* 4 Period Filter Pills */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setHistoryFilter('ALL')}
                style={{
                  border: 'none', borderRadius: '8px', padding: '7px 16px',
                  background: historyFilter === 'ALL' ? '#dc2626' : '#ffffff',
                  color: historyFilter === 'ALL' ? '#ffffff' : '#334155',
                  borderWidth: historyFilter === 'ALL' ? 0 : '1px',
                  borderStyle: 'solid',
                  borderColor: '#e2e8f0',
                  fontSize: '12.5px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('TODAY')}
                style={{
                  border: 'none', borderRadius: '8px', padding: '7px 14px',
                  background: historyFilter === 'TODAY' ? '#dc2626' : '#ffffff',
                  color: historyFilter === 'TODAY' ? '#ffffff' : '#334155',
                  borderWidth: historyFilter === 'TODAY' ? 0 : '1px',
                  borderStyle: 'solid',
                  borderColor: '#e2e8f0',
                  fontSize: '12.5px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('WEEK')}
                style={{
                  border: 'none', borderRadius: '8px', padding: '7px 14px',
                  background: historyFilter === 'WEEK' ? '#dc2626' : '#ffffff',
                  color: historyFilter === 'WEEK' ? '#ffffff' : '#334155',
                  borderWidth: historyFilter === 'WEEK' ? 0 : '1px',
                  borderStyle: 'solid',
                  borderColor: '#e2e8f0',
                  fontSize: '12.5px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('MONTH')}
                style={{
                  border: 'none', borderRadius: '8px', padding: '7px 14px',
                  background: historyFilter === 'MONTH' ? '#dc2626' : '#ffffff',
                  color: historyFilter === 'MONTH' ? '#ffffff' : '#334155',
                  borderWidth: historyFilter === 'MONTH' ? 0 : '1px',
                  borderStyle: 'solid',
                  borderColor: '#e2e8f0',
                  fontSize: '12.5px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Bulan Ini
              </button>
            </div>

            {/* Empty State Box / List */}
            {filteredHistory.length === 0 ? (
              <div style={{
                background: '#ffffff', borderRadius: '16px', padding: '48px 16px',
                border: '1px solid #f1f5f9', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto', color: '#cbd5e1'
                }}>
                  <Clock size={28} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '12px' }}>
                  Daftar Riwayat Faktur Pembelian (0)
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                  Tidak ada faktur pembelian pada periode yang dipilih.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredHistory.map(tx => {
                  const supp = suppliers.find(s => s.id === tx.supplierId);
                  const itemCount = tx.items?.length || 0;
                  const unitCount = (tx.items || []).reduce((acc, it) => acc + (it.qty || 0), 0);

                  return (
                    <div key={tx.id} style={{
                      background: '#ffffff', borderRadius: '14px', padding: '14px',
                      border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                      display: 'flex', flexDirection: 'column', gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '14px', fontFamily: 'monospace', color: '#0f172a' }}>
                            {tx.documentNo}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
                          MASUK (IN)
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                        Supplier: {supp?.name || 'Supplier Tanpa Nama'}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          {itemCount} Produk ({unitCount} Unit)
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: 900, color: '#dc2626' }}>
                          {formatIDR(tx.totalValue)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedHistoryTx(tx)}
                          style={{
                            flex: 1, background: '#f1f5f9', color: '#1e293b', border: 'none',
                            borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          Detail Faktur
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorder(tx)}
                          style={{
                            flex: 1, background: '#dc2626', color: '#ffffff', border: 'none',
                            borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          Pesan Lagi
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )
      )}

      {/* =====================================================================
          TAB 3: HUTANG SUPPLIER (DESKTOP TABLE vs MOBILE CARDS)
          ===================================================================== */}
      {activeTab === 'DEBT' && (
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
                  TOTAL KEWAJIBAN HUTANG (ACCOUNTS PAYABLE)
                </span>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', margin: '4px 0 2px 0' }}>
                  {formatIDR(totalSupplierDebt)}
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  Kewajiban aktif dari total {suppliersWithDebt.length} vendor dengan faktur yang mendekati jatuh tempo.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  onClick={() => fetchSuppliers()}
                  style={{ fontSize: '11.5px', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.1)', padding: '5px 12px', borderRadius: '8px' }}
                >
                  <RefreshCw size={11} /> Segarkan
                </span>
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
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '160px' }}>TEMPO</th>
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
                                setDebtAmount(supp.totalPayable || 0);
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
          /* Mobile Cards View */
          <div className="mobile-cards-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Dark Hero Gradient Banner */}
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

            {/* Section Header: Rincian Tagihan */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={15} color="#dc2626" />
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155', letterSpacing: '0.2px', textTransform: 'uppercase' }}>
                  RINCIAN TAGIHAN PER SUPPLIER
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {suppliersWithDebt.length} Dokumen
              </span>
            </div>

            {/* Supplier Debt Cards */}
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
                          PIC: {supp.contact || '-'} • Telp: {supp.phone || '-'}
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

                    {/* Two Buttons: Chat PIC and Catat Pelunasan */}
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
          MODAL: + SUPPLIER BARU CEPAT
          ===================================================================== */}
      {isNewSupplierModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '440px',
            overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)'
          }}>
            <div style={{
              background: '#dc2626', color: 'white', padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>Tambah Supplier / Vendor Baru</div>
              <button
                type="button"
                onClick={() => setIsNewSupplierModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Nama Supplier *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: CV Sumber Rejeki"
                  value={newSuppName}
                  onChange={e => setNewSuppName(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '40px', padding: '0 10px', fontSize: '13.5px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Nama PIC</label>
                <input
                  type="text"
                  placeholder="Nama Sales / Kontak PIC"
                  value={newSuppContact}
                  onChange={e => setNewSuppContact(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '40px', padding: '0 10px', fontSize: '13.5px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>No. Telepon / WhatsApp</label>
                <input
                  type="tel"
                  placeholder="08123456789"
                  value={newSuppPhone}
                  onChange={e => setNewSuppPhone(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '40px', padding: '0 10px', fontSize: '13.5px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Hari Jatuh Tempo (Default)</label>
                <input
                  type="number"
                  min="0"
                  value={newSuppPaymentTerms}
                  onChange={e => setNewSuppPaymentTerms(Number(e.target.value))}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '40px', padding: '0 10px', fontSize: '13.5px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewSupplierModalOpen(false)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Simpan Supplier
                </button>
              </div>
            </form>
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
          MODAL: DETAIL FAKTUR PO
          ===================================================================== */}
      {selectedHistoryTx && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '580px',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              background: '#0f172a', color: 'white', padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', fontFamily: 'monospace' }}>
                  Faktur {selectedHistoryTx.documentNo}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {new Date(selectedHistoryTx.date).toLocaleString('id-ID')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryTx(null)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: '#334155' }}>
                Supplier: <strong>{suppliers.find(s => s.id === selectedHistoryTx.supplierId)?.name || 'Supplier Rekanan'}</strong>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Item Barang</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Harga</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedHistoryTx.items || []).map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px' }}>{it.productName || it.productId}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{it.qty} {it.unit || ''}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatIDR(it.purchasePrice)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatIDR(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '13.5px' }}>Total Faktur:</span>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#dc2626' }}>
                  {formatIDR(selectedHistoryTx.totalValue)}
                </span>
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                <Printer size={14} style={{ display: 'inline', marginRight: '4px' }} /> Cetak
              </button>
              <button
                type="button"
                onClick={() => handleReorder(selectedHistoryTx)}
                style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Pesan Ulang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: BARCODE SCANNER CAMERA
          ===================================================================== */}
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
            
            if (window.confirm('Produk belum terdaftar. Tambahkan sekarang sebagai produk baru?')) {
              setNewProdBarcode(decodedText);
              setIsNewProductModalOpen(true);
            }
            return null;
          }} 
          onClose={() => setIsScannerOpen(false)} 
        />
      )}

      {/* =====================================================================
          MODAL: TAMBAH PRODUK BARU CEPAT
          ===================================================================== */}
      {isNewProductModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '750px',
            maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              background: '#dc2626', color: 'white', padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>Tambah Produk Baru ke Katalog</div>
              <button
                type="button"
                onClick={() => setIsNewProductModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Barcode / ID *</label>
                  <input
                    type="text"
                    required
                    value={newProdBarcode}
                    onChange={e => setNewProdBarcode(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '38px', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Nama Produk *</label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={e => setNewProdName(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '38px', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Harga Beli (HPP)</label>
                  <input
                    type="number"
                    min="0"
                    value={newProdPurchasePrice}
                    onChange={e => setNewProdPurchasePrice(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '38px', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Harga Jual *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newProdSellingPrice}
                    onChange={e => setNewProdSellingPrice(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '38px', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Kategori</label>
                  <select
                    value={newProdCategory}
                    onChange={e => setNewProdCategory(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '38px', padding: '0 10px', fontSize: '13px' }}
                  >
                    <option value="">Pilih Kategori</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Satuan</label>
                  <select
                    value={newProdUnit}
                    onChange={e => setNewProdUnit(e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', height: '38px', padding: '0 10px', fontSize: '13px' }}
                  >
                    <option value="Pcs">Pcs</option>
                    <option value="Kg">Kg</option>
                    <option value="Dus">Dus</option>
                    <option value="Pack">Pack</option>
                    <option value="Botol">Botol</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewProductModalOpen(false)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Simpan & Tambah ke PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Purchases;
