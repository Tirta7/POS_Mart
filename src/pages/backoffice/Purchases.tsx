import React, { useState, useEffect, useMemo } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import { useAuthStore } from '../../store/useAuthStore';
import { 
  ShoppingCart, Plus, Trash2, Check, Search, Camera, X, 
  CreditCard, RefreshCw, MessageSquare, Printer, CheckCircle2, Clock, Pencil
} from 'lucide-react';
import type { StockTransaction, Supplier } from '../../types';
import BarcodeScannerCamera from '../../components/BarcodeScannerCamera';
import { printPurchaseInvoiceA4 } from '../../utils/distributorInvoice';
import { getProductImage } from '../../utils/defaultProductImage';

interface CartItem {
  key: string; // productId::variantId|new:nama  (unik per baris belanja)
  productId: string;
  name: string;
  variantId?: string;
  variantName?: string;
  isNewVariant?: boolean; // varian belum terdaftar -> dibuat otomatis saat PO diterbitkan
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

const makeKey = (productId: string, variantId?: string, newName?: string) =>
  `${productId}::${variantId || (newName ? 'new:' + newName.trim().toLowerCase() : '')}`;

const PO_DRAFT_URL = '/api/saas/drafts/purchase-po';
const DRAFT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' };

type PurchaseTab = 'FORM' | 'HISTORY' | 'DEBT';

const Purchases: React.FC = () => {
  const { 
    products, addTransaction, addProduct, categories, 
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

  // Ubah supplier faktur (single / massal)
  const [supplierEditIds, setSupplierEditIds] = useState<string[] | null>(null);
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editOnCredit, setEditOnCredit] = useState(true);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [supplierEditError, setSupplierEditError] = useState('');
  const [poErrors, setPoErrors] = useState<string[]>([]);
  const [poNotice, setPoNotice] = useState<string>('');

  // Variant picker (muncul saat produk punya varian)
  const [variantPickerProduct, setVariantPickerProduct] = useState<any | null>(null);
  const [newVariantInput, setNewVariantInput] = useState('');
  const [variantPickerError, setVariantPickerError] = useState('');

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

  // Muat draf PO yang tersimpan di server (jika ada)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(PO_DRAFT_URL, { headers: DRAFT_HEADERS });
        if (!res.ok) return;
        const draft = await res.json();
        if (cancelled || !draft || !Array.isArray(draft.items) || draft.items.length === 0) return;
        setItems(draft.items);
        if (draft.selectedSupplier) setSelectedSupplier(draft.selectedSupplier);
        if (draft.documentNo) setDocumentNo(draft.documentNo);
        if (draft.orderDate) setOrderDate(draft.orderDate);
        if (draft.paymentTerm) setPaymentTerm(draft.paymentTerm);
        if (draft.orderNotes) setOrderNotes(draft.orderNotes);
        setPoNotice('Draf PO sebelumnya dimuat. Periksa kembali sebelum diterbitkan.');
      } catch (err) {
        console.error('Gagal memuat draf PO:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // Tambah satu baris belanja (produk biasa, varian terdaftar, atau varian baru)
  const addCartLine = (
    product: any,
    variant?: { id: string; name: string; stock: number; purchasePrice?: number; sellingPrice?: number },
    newVariantName?: string
  ) => {
    const key = makeKey(product.id, variant?.id, newVariantName);
    const existing = items.find(i => i.key === key);
    if (existing) {
      handleItemChange(key, 'qty', existing.qty + 1);
      return;
    }
    const buyPrice = Number(variant?.purchasePrice ?? product.purchasePrice) || 0;
    setItems(prev => [...prev, {
      key,
      productId: product.id,
      name: product.name,
      variantId: variant?.id,
      variantName: variant?.name || (newVariantName ? newVariantName.trim() : undefined),
      isNewVariant: !variant && !!newVariantName,
      currentStock: variant ? variant.stock : (newVariantName ? 0 : (product.stock || 0)),
      qty: 1,
      batchNo: '',
      expiryDate: '',
      purchasePrice: buyPrice,
      originalPrice: buyPrice,
      sellingPrice: Number(variant?.sellingPrice ?? product.sellingPrice) || 0,
      unit: product.unit || 'Pcs',
      subtotal: buyPrice,
      showBatchExp: false
    }]);
  };

  // Add Item to cart
  const handleAddItem = (product: any) => {
    setSearchTerm('');
    setPoErrors([]);
    setPoNotice('');
    if ((product.variants || []).length > 0) {
      // Produk bervarian -> pilih varian dulu (atau input varian baru)
      setVariantPickerError('');
      setNewVariantInput('');
      setVariantPickerProduct(product);
      return;
    }
    addCartLine(product);
  };

  const handlePickExistingVariant = (variant: any) => {
    if (!variantPickerProduct) return;
    addCartLine(variantPickerProduct, variant);
    setVariantPickerError('');
  };

  const handleAddNewVariant = () => {
    if (!variantPickerProduct) return;
    const name = newVariantInput.trim();
    if (!name) {
      setVariantPickerError('Nama varian baru wajib diisi.');
      return;
    }
    if (name.length > 60) {
      setVariantPickerError('Nama varian maksimal 60 karakter.');
      return;
    }
    // Nama sama dengan varian yang sudah ada -> pakai varian itu (hindari duplikat)
    const same = (variantPickerProduct.variants || []).find((v: any) => v.name.trim().toLowerCase() === name.toLowerCase());
    if (same) {
      addCartLine(variantPickerProduct, same);
    } else {
      addCartLine(variantPickerProduct, undefined, name);
    }
    setNewVariantInput('');
    setVariantPickerError('');
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

  const handleRemoveItem = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  const handleItemChange = (key: string, field: keyof CartItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.key === key) {
        const updated = { ...item, [field]: value };
        if (field === 'qty' || field === 'purchasePrice') {
          const qty = Number(field === 'qty' ? value : item.qty) || 0;
          const price = Number(field === 'purchasePrice' ? value : item.purchasePrice) || 0;
          updated.subtotal = Math.round(qty * price);
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
      const variant = it.variantId ? prod?.variants?.find(v => v.id === it.variantId) : undefined;
      // Varian dulu pernah ada tetapi sudah dihapus -> dibuat ulang sebagai varian baru (berdasarkan nama)
      const newName = !variant && it.variantName ? it.variantName : undefined;
      const buyPrice = it.purchasePrice || variant?.purchasePrice || prod?.purchasePrice || 0;
      return {
        key: makeKey(it.productId, variant?.id, newName),
        productId: it.productId,
        name: it.productName || prod?.name || `Produk ${it.productId}`,
        variantId: variant?.id,
        variantName: variant?.name || newName,
        isNewVariant: !!newName,
        currentStock: variant ? variant.stock : (newName ? 0 : (prod?.stock || 0)),
        qty: it.qty || 1,
        batchNo: it.batchNo || '',
        expiryDate: it.expiryDate || '',
        purchasePrice: buyPrice,
        originalPrice: prod?.purchasePrice || buyPrice,
        sellingPrice: prod?.sellingPrice || 0,
        unit: prod?.unit || 'Pcs',
        subtotal: Math.round((it.qty || 1) * buyPrice),
        showBatchExp: Boolean(it.batchNo || it.expiryDate)
      };
    });
    setItems(newItems);
    setDocumentNo(`PO-${Date.now()}`);
    setPoErrors([]);
    setActiveTab('FORM');
    if (selectedHistoryTx) setSelectedHistoryTx(null);
  };

  const handleDeleteTransaction = async (id: string) => {
    if (confirm('Yakin ingin membatalkan faktur pembelian ini? Stok barang akan dikembalikan (dikurangi) dan hutang ke supplier akan dihapus.')) {
      try {
        await useInventoryStore.getState().deleteTransaction(id);
        alert('Faktur pembelian berhasil dibatalkan dan stok dikembalikan.');
        // fetchProducts & fetchTransactions is already called in the store
      } catch (err: any) {
        alert(err.message || 'Gagal membatalkan faktur pembelian.');
      }
    }
  };

  const openSupplierEdit = (ids: string[]) => {
    const first = purchaseHistory.find(t => t.id === ids[0]);
    setSupplierEditIds(ids);
    setEditSupplierId(ids.length === 1 && first?.supplierId ? first.supplierId : '');
    setEditOnCredit(first?.supplierId ? first.onCredit !== false : true);
    setSupplierEditError('');
  };

  const handleSaveSupplierEdit = async () => {
    if (!supplierEditIds) return;
    if (!editSupplierId) {
      setSupplierEditError('Pilih supplier tujuan terlebih dahulu.');
      return;
    }
    setIsSavingSupplier(true);
    setSupplierEditError('');
    try {
      await useInventoryStore.getState().updateTransactionSupplier(supplierEditIds, editSupplierId, editOnCredit);
      await Promise.all([fetchSuppliers(), fetchTransactions()]);
      setSupplierEditIds(null);
      setSelectedHistoryTx(null);
    } catch (err: any) {
      setSupplierEditError(err?.message || 'Gagal mengubah supplier.');
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // Validasi lengkap form PO sebelum diterbitkan
  const validatePO = (): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Langkah 1: Faktur
    if (!selectedSupplier) errors.push('Supplier belum dipilih.');
    else if (!suppliers.some(s => s.id === selectedSupplier)) errors.push('Supplier yang dipilih tidak valid. Muat ulang halaman.');

    const doc = documentNo.trim();
    if (!doc) {
      errors.push('No. Faktur / Dokumen PO wajib diisi.');
    } else if ((transactions || []).some(t => t.type === 'IN' && t.supplierId && (t.documentNo || '').trim().toLowerCase() === doc.toLowerCase())) {
      errors.push(`No. Faktur "${doc}" sudah pernah dipakai. Klik "No. Baru" atau gunakan nomor lain.`);
    }

    if (!orderDate) {
      errors.push('Tanggal faktur wajib diisi.');
    } else {
      const d = new Date(orderDate);
      const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
      if (isNaN(d.getTime())) errors.push('Tanggal faktur tidak valid.');
      else if (d.getTime() > endToday.getTime()) errors.push('Tanggal faktur tidak boleh di masa depan.');
    }

    // Langkah 2: Barang
    if (items.length === 0) errors.push('Tambahkan minimal 1 barang belanja.');

    const seen = new Set<string>();
    items.forEach((it, i) => {
      const label = `Barang #${i + 1} (${it.name}${it.variantName ? ' - ' + it.variantName : ''})`;
      const product = products.find(p => p.id === it.productId);
      if (!product) {
        errors.push(`${label}: produk tidak ditemukan di katalog (mungkin sudah dihapus).`);
        return;
      }
      if (seen.has(it.key)) errors.push(`${label}: muncul dua kali.`);
      seen.add(it.key);

      const qty = Number(it.qty);
      const price = Number(it.purchasePrice);
      if (!Number.isFinite(qty) || qty <= 0) errors.push(`${label}: jumlah harus lebih dari 0.`);
      if (!Number.isFinite(price) || price <= 0) errors.push(`${label}: harga beli harus lebih dari 0.`);

      // Langkah 3: Varian
      const hasVariants = (product.variants || []).length > 0;
      if (hasVariants && !it.variantId && !(it.isNewVariant && it.variantName?.trim())) {
        errors.push(`${label}: produk ini memiliki varian, pilih varian terlebih dahulu.`);
      }
      if (!hasVariants && it.isNewVariant) {
        if ((product.stock || 0) > 0) errors.push(`${label}: produk belum punya varian tetapi masih ada stok ${product.stock}. Atur varian dahulu di Manajemen Stok.`);
      }
      if (it.variantId && !(product.variants || []).some(v => v.id === it.variantId)) {
        errors.push(`${label}: varian sudah dihapus. Hapus baris ini lalu tambahkan ulang.`);
      }

      if (it.expiryDate) {
        const exp = new Date(it.expiryDate);
        if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) warnings.push(`${label}: tanggal kedaluwarsa sudah lewat.`);
      }
      const base = Number(it.originalPrice) || 0;
      if (base > 0 && price > 0 && Math.abs(price - base) / base > 0.5) {
        warnings.push(`${label}: harga beli ${formatIDR(price)} berbeda >50% dari HPP ${formatIDR(base)}.`);
      }
    });

    return { errors, warnings };
  };

  // Simpan draf PO di server (stok & hutang TIDAK berubah)
  const handleSaveDraft = async () => {
    setPoNotice('');
    if (items.length === 0) {
      setPoErrors(['Tambahkan minimal 1 barang untuk disimpan sebagai draf.']);
      return;
    }
    try {
      const res = await fetch(PO_DRAFT_URL, {
        method: 'POST',
        headers: DRAFT_HEADERS,
        body: JSON.stringify({ selectedSupplier, documentNo, orderDate, paymentTerm, orderNotes, items })
      });
      if (!res.ok) throw new Error('Server menolak penyimpanan draf.');
      setPoErrors([]);
      setPoNotice('Draf PO tersimpan. Stok dan hutang belum berubah sampai PO diterbitkan.');
    } catch (err: any) {
      setPoErrors([err?.message || 'Gagal menyimpan draf.']);
    }
  };

  // Submit PO
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;
    setPoNotice('');
    if (!currentUser) {
      setPoErrors(['Sesi login tidak ditemukan. Silakan login ulang.']);
      return;
    }

    const { errors, warnings } = validatePO();
    if (errors.length > 0) {
      setPoErrors(errors);
      return;
    }
    setPoErrors([]);

    const supp = suppliers.find(s => s.id === selectedSupplier);
    const onCredit = !paymentTerm.toLowerCase().startsWith('tunai');
    const newVariantCount = items.filter(i => i.isNewVariant).length;

    const summary = [
      `Terbitkan PO ${documentNo.trim()}?`,
      '',
      `Supplier : ${supp?.name || '-'}`,
      `Barang   : ${items.length} baris (${totalQty} unit)`,
      `Total    : ${formatIDR(totalValue)}`,
      `Pembayaran: ${paymentTerm}${onCredit ? ' → menambah hutang supplier' : ' → tidak menambah hutang'}`,
      newVariantCount > 0 ? `Varian baru: ${newVariantCount} varian akan didaftarkan otomatis` : '',
      warnings.length > 0 ? `\nPerhatian:\n- ${warnings.join('\n- ')}` : '',
      '',
      'Stok barang akan bertambah setelah PO diterbitkan.'
    ].filter(l => l !== '').join('\n');
    if (!window.confirm(summary)) return;

    setIsSubmitting(true);
    try {
      const transaction: StockTransaction = {
        id: `TXN-${Date.now()}`,
        type: 'IN',
        date: new Date(orderDate).toISOString(),
        documentNo: documentNo.trim(),
        supplierId: selectedSupplier,
        employeeId: currentUser.id,
        items: items.map(it => ({
          productId: it.productId,
          variantId: it.variantId,
          variantName: it.variantName,
          newVariantName: it.isNewVariant ? it.variantName : undefined,
          productName: it.name,
          unit: it.unit,
          qty: Number(it.qty),
          batchNo: it.batchNo,
          expiryDate: it.expiryDate,
          purchasePrice: Number(it.purchasePrice),
          subtotal: Math.round(Number(it.qty) * Number(it.purchasePrice))
        })),
        totalValue,
        note: orderNotes ? `${orderNotes} (${paymentTerm})` : `PO dari ${supp?.name || 'Supplier'} (${paymentTerm})`,
        onCredit
      };

      // Server menambah stok (+varian baru), menghitung HPP rata-rata, dan menambah hutang dalam SATU transaksi database.
      await addTransaction(transaction);

      // Hapus draf yang tersimpan (jika ada)
      fetch(PO_DRAFT_URL, { method: 'POST', headers: DRAFT_HEADERS, body: JSON.stringify(null) }).catch(() => {});

      setItems([]);
      setDocumentNo(`PO-${Date.now()}`);
      setOrderNotes('');
      setPoNotice(`PO ${transaction.documentNo} berhasil diterbitkan. Stok${newVariantCount > 0 ? ', varian baru' : ''}${onCredit ? ' dan hutang supplier' : ''} telah diperbarui.`);
      await Promise.all([fetchSuppliers(), fetchTransactions(), fetchProducts()]);
    } catch (err: any) {
      console.error(err);
      setPoErrors([err?.message || 'Terjadi kesalahan saat memproses pembelian.']);
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
      image: newProdImage ? getProductImage(newProdImage) : ''
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
          1. PAGE HEADER (konsisten dengan halaman back-office lain)
          ===================================================================== */}
      <div className="bo-page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title">Pembelian (Purchase Order)</h1>
          <p className="bo-page-subtitle">Kelola pesanan pembelian supplier, penerimaan stok, dan buku hutang usaha secara terpadu.</p>
        </div>
        <div className="bo-header-actions">
          {activeTab !== 'FORM' && (
            <button className="bo-btn bo-btn-primary" onClick={() => setActiveTab('FORM')}>
              <Plus size={16} /> Buat PO Baru
            </button>
          )}
        </div>
      </div>

      {/* =====================================================================
          2. RINGKASAN (KPI) — satu baris ringkas
          ===================================================================== */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: isMobileScreen ? '8px' : '12px', marginBottom: '14px', flexShrink: 0
      }}>
        {[
          { label: 'Belanja Bulan Ini', value: formatIDR(totalMonthlySpent), sub: `${monthlyPurchases.length} faktur masuk`, color: '#0f172a', subColor: '#64748b', border: '#e5e7eb' },
          { label: 'Total Hutang', value: formatIDR(totalSupplierDebt), sub: `${suppliersWithDebt.length} vendor berhutang`, color: '#dc2626', subColor: '#dc2626', border: '#fecaca' },
          { label: 'Faktur PO', value: String(purchaseHistory.length), sub: 'Semua periode', color: '#0f172a', subColor: '#059669', border: '#e5e7eb' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#ffffff', border: `1px solid ${k.border}`, borderRadius: '12px',
            padding: isMobileScreen ? '10px' : '12px 16px', minWidth: 0
          }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{k.label}</div>
            <div style={{ fontSize: isMobileScreen ? '15px' : '19px', fontWeight: 800, color: k.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '2px 0' }}>{k.value}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: k.subColor }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* =====================================================================
          3. TAB (gaya sama dengan filter kategori di halaman lain)
          ===================================================================== */}
      <div className="categories-bar" style={{ flexShrink: 0 }}>
        <button className={`cat-btn ${activeTab === 'FORM' ? 'active' : ''}`} onClick={() => setActiveTab('FORM')}>
          <Plus size={16} /> Buat PO Baru
        </button>
        <button className={`cat-btn ${activeTab === 'HISTORY' ? 'active' : ''}`} onClick={() => setActiveTab('HISTORY')}>
          <Clock size={16} /> Riwayat
          <span style={{ opacity: 0.75, fontSize: '0.75rem' }}>{purchaseHistory.length}</span>
        </button>
        <button className={`cat-btn ${activeTab === 'DEBT' ? 'active' : ''}`} onClick={() => setActiveTab('DEBT')}>
          <CreditCard size={16} /> Hutang
          {suppliersWithDebt.length > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: '999px', padding: '0 7px', fontSize: '0.7rem', fontWeight: 700 }}>
              {suppliersWithDebt.length}
            </span>
          )}
        </button>
      </div>

      {/* =====================================================================
          TAB 1: FORM BUAT PO BARU
          Desktop : kiri = barang belanja, kanan = detail faktur + ringkasan (sticky)
          Mobile  : detail faktur -> barang belanja -> bar total di bawah
          ===================================================================== */}
      {activeTab === 'FORM' && (() => {
        const lbl: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.2px' };
        const ctl: React.CSSProperties = { width: '100%', height: '38px', boxSizing: 'border-box' };

        const invoiceCard = (
          <div className="bo-card" style={{ marginBottom: 0 }}>
            <div className="bo-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="bo-card-title" style={{ margin: 0 }}>Detail Faktur</h3>
              <button
                type="button"
                onClick={() => setDocumentNo(`PO-${Date.now()}`)}
                className="bo-btn bo-btn-secondary"
                style={{ height: '30px', padding: '0 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} /> No. Baru
              </button>
            </div>
            <div style={{ padding: '14px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>No. Faktur / Dokumen PO</label>
                <input className="bo-input" type="text" value={documentNo} onChange={e => setDocumentNo(e.target.value)}
                  style={{ ...ctl, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700 }} />
              </div>
              <div>
                <label style={lbl}>Tanggal</label>
                <input className="bo-input" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={ctl} />
              </div>
              <div>
                <label style={lbl}>Pembayaran</label>
                <select className="bo-input" value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} style={ctl}>
                  <option value="Tempo 14 Hari (Hutang)">Tempo 14 Hari</option>
                  <option value="Tempo 7 Hari (Hutang)">Tempo 7 Hari</option>
                  <option value="Tempo 30 Hari (Hutang)">Tempo 30 Hari</option>
                  <option value="Tunai / Cash (Lunas)">Tunai / Cash (Lunas)</option>
                  <option value="Konsinyasi">Konsinyasi (Bagi Hasil)</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={lbl}>Supplier / Vendor</label>
                  <button type="button" onClick={() => setIsNewSupplierModalOpen(true)}
                    style={{ background: 'none', border: 'none', padding: 0, marginBottom: '4px', color: 'var(--primary, #dc2626)', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                    + Supplier Baru
                  </button>
                </div>
                <select className="bo-input" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} style={ctl}>
                  {suppliers.length === 0 ? (
                    <option value="">-- Belum ada supplier --</option>
                  ) : (
                    suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (Hutang: {formatIDR(s.totalPayable || 0)})</option>
                    ))
                  )}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Catatan (opsional)</label>
                <input className="bo-input" type="text" placeholder="No. surat jalan, info pengiriman..." value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)} style={ctl} />
              </div>
            </div>
          </div>
        );

        const summaryCard = (
          <div className="bo-card" style={{ marginBottom: 0 }}>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {poErrors.length > 0 && (
                <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 12px', maxHeight: '160px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#b91c1c', marginBottom: '4px' }}>
                    Periksa {poErrors.length} hal berikut sebelum menerbitkan PO:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#991b1b', lineHeight: 1.5 }}>
                    {poErrors.map((er, i) => <li key={i}>{er}</li>)}
                  </ul>
                </div>
              )}
              {poErrors.length === 0 && poNotice && (
                <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: '#166534', lineHeight: 1.5 }}>
                  {poNotice}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Estimasi PO</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>{formatIDR(totalValue)}</div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                  {items.length} item{totalQty > 0 ? ` • ${totalQty} unit` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="bo-btn bo-btn-secondary"
                  onClick={() => handleSaveDraft()}
                  disabled={isSubmitting || items.length === 0}
                  style={{ opacity: items.length === 0 ? 0.55 : 1, cursor: items.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  Simpan Draf
                </button>
                <button
                  type="button"
                  className="bo-btn bo-btn-primary"
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting || items.length === 0}
                  style={{ flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: items.length === 0 ? 0.55 : 1, cursor: items.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  <Check size={16} /> Terbitkan PO
                </button>
              </div>
            </div>
          </div>
        );

        const stepBtn: React.CSSProperties = { width: '28px', height: '28px', border: 'none', background: '#ffffff', borderRadius: '6px', fontWeight: 700, fontSize: '15px', color: '#0f172a', cursor: 'pointer' };
        const qtyStepper = (item: CartItem) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
            <button type="button" style={stepBtn} onClick={() => handleItemChange(item.key, 'qty', Math.max(0.001, Math.round((item.qty - 1) * 1000) / 1000))}>-</button>
            <input
              type="number" min="0.001" step="any" value={item.qty}
              onChange={e => handleItemChange(item.key, 'qty', Math.max(0.001, Number(e.target.value)))}
              style={{ width: '56px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}
            />
            <button type="button" style={stepBtn} onClick={() => handleItemChange(item.key, 'qty', Math.round((item.qty + 1) * 1000) / 1000)}>+</button>
          </div>
        );
        const priceInput = (item: CartItem) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Rp</span>
            <input
              className="bo-input" type="number" min="0" value={item.purchasePrice}
              onChange={e => handleItemChange(item.key, 'purchasePrice', Number(e.target.value))}
              style={{ width: '104px', height: '32px', padding: '0 8px', fontWeight: 700, fontSize: '13px' }}
            />
          </div>
        );
        const delBtn = (item: CartItem) => (
          <button type="button" onClick={() => handleRemoveItem(item.key)} title="Hapus item"
            style={{ width: '30px', height: '30px', borderRadius: '7px', border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Trash2 size={14} />
          </button>
        );
        const itemTitle = (item: CartItem) => (
          <>
            {item.name}
            {item.variantName && (
              <span style={{ marginLeft: '6px', fontSize: '11px', background: '#f5f3ff', color: '#7c3aed', padding: '1px 7px', borderRadius: '4px', fontWeight: 700 }}>
                {item.variantName}
              </span>
            )}
            {item.isNewVariant && (
              <span style={{ marginLeft: '4px', fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                VARIAN BARU
              </span>
            )}
          </>
        );
        const itemMeta = (item: CartItem) => {
          const product = products.find(p => p.id === item.productId);
          const sellPrice = item.sellingPrice || product?.sellingPrice || 0;
          const margin = sellPrice > 0 ? (((sellPrice - item.purchasePrice) / sellPrice) * 100).toFixed(0) : null;
          return (
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                Stok: {item.currentStock} {item.unit} → {Math.round((item.currentStock + (Number(item.qty) || 0)) * 1000) / 1000}
              </span>
              {sellPrice > 0 && (
                <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  Jual: {formatIDR(sellPrice)}
                </span>
              )}
              {margin !== null && (
                <span style={{ fontSize: '11px', background: Number(margin) > 0 ? '#dcfce7' : '#fee2e2', color: Number(margin) > 0 ? '#15803d' : '#b91c1c', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  Margin: {margin}%
                </span>
              )}
            </div>
          );
        };

        const itemsCard = (
          <div className="bo-card" style={{ marginBottom: 0 }}>
            <div className="bo-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 className="bo-card-title" style={{ margin: 0 }}>
                <ShoppingCart size={18} style={{ color: 'var(--primary)' }} /> Barang Belanja
                <span className="bo-badge bo-badge-red" style={{ backgroundColor: 'var(--primary)', color: 'white', marginLeft: '8px' }}>{items.length} Item</span>
              </h3>
            </div>

            {/* Pencarian produk / scan barcode */}
            <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', position: 'relative', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  className="bo-input" type="text"
                  placeholder="Cari nama produk, SKU, atau scan barcode..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{ width: '100%', height: '38px', paddingLeft: '34px', boxSizing: 'border-box', backgroundColor: '#f9fafb' }}
                />
              </div>
              <button type="button" onClick={() => setIsScannerOpen(true)} title="Buka Kamera Barcode"
                style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#059669', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <Camera size={17} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewProdBarcode('');
                  setNewProdSku('');
                  setNewProdName(searchTerm.trim());
                  setNewProdSellingPrice('');
                  setNewProdPurchasePrice('');
                  setNewProdWholesalePrice('');
                  setNewProdMinStock('');
                  setNewProdImage('');
                  setIsNewProductModalOpen(true);
                }}
                className="bo-btn bo-btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '38px',
                  padding: '0 14px',
                  fontWeight: 700,
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                  borderRadius: '8px',
                  flexShrink: 0
                }}
                title="Daftarkan barang baru yang belum ada di katalog produk"
              >
                <Plus size={16} /> + Barang Baru
              </button>

              {searchTerm && (
                <div style={{
                  position: 'absolute', top: '100%', left: '16px', right: '62px',
                  background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.12)', zIndex: 50, maxHeight: '260px', overflowY: 'auto', marginTop: '-4px'
                }}>
                  {filteredProducts.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '8px' }}>Produk tidak ditemukan</div>
                      <button type="button" className="bo-btn bo-btn-primary"
                        onClick={() => { setNewProdBarcode(searchTerm); setNewProdName(''); setIsNewProductModalOpen(true); }}>
                        + Buat Produk Baru
                      </button>
                    </div>
                  ) : (
                    filteredProducts.map(p => (
                      <div key={p.id} onClick={() => handleAddItem(p)}
                        style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>{p.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Stok: {p.stock} • HPP: {formatIDR(p.purchasePrice)}
                            {(p.variants || []).length > 0 && (
                              <span style={{ marginLeft: '6px', background: '#f5f3ff', color: '#7c3aed', padding: '0 6px', borderRadius: '4px', fontWeight: 700 }}>
                                {(p.variants || []).length} varian
                              </span>
                            )}
                          </div>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--primary, #dc2626)', fontWeight: 700 }}>+ Tambah</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: '#94a3b8' }}>
                  <ShoppingCart size={24} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '12px' }}>Daftar barang belanja masih kosong</div>
                <div style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.5, maxWidth: '320px', margin: '6px auto 14px' }}>
                  Gunakan kolom pencarian atau scan kamera untuk menambahkan produk yang akan dipesan ke supplier.
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProdBarcode('');
                      setNewProdSku('');
                      setNewProdName('');
                      setNewProdSellingPrice('');
                      setNewProdPurchasePrice('');
                      setNewProdWholesalePrice('');
                      setNewProdMinStock('');
                      setNewProdImage('');
                      setIsNewProductModalOpen(true);
                    }}
                    className="bo-btn bo-btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={14} /> + Daftarkan Barang Baru
                  </button>
                  <button type="button" onClick={handleAddSampleProduct} className="bo-btn bo-btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Tambah Contoh Produk Cepat
                  </button>
                </div>
              </div>
            ) : !isMobileScreen ? (
              <div className="bo-table-container" style={{ overflowX: 'auto' }}>
                <table className="bo-table" style={{ width: '100%', minWidth: '640px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>#</th>
                      <th>Produk</th>
                      <th style={{ textAlign: 'center' }}>Jumlah</th>
                      <th>Harga Beli</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                      <th style={{ width: '44px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.key}>
                        <td style={{ color: '#94a3b8', fontWeight: 700 }}>{idx + 1}</td>
                        <td>
                          <div className="bo-table-bold">{itemTitle(item)}</div>
                          {itemMeta(item)}
                        </td>
                        <td style={{ textAlign: 'center' }}>{qtyStepper(item)}</td>
                        <td>{priceInput(item)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>{formatIDR(item.subtotal)}</td>
                        <td style={{ textAlign: 'center' }}>{delBtn(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {items.map((item, idx) => (
                  <div key={item.key} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                          <span style={{ color: '#94a3b8', marginRight: '4px' }}>#{idx + 1}</span>{itemTitle(item)}
                        </div>
                        {itemMeta(item)}
                      </div>
                      {delBtn(item)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      {qtyStepper(item)}
                      {priceInput(item)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>SUBTOTAL</span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#dc2626' }}>{formatIDR(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

        if (isMobileScreen) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {invoiceCard}
              {itemsCard}
              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, background: '#ffffff', borderTop: '1px solid #e5e7eb',
                boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', zIndex: 100
              }}>
                {summaryCard}
              </div>
            </div>
          );
        }

        return (
          <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '16px',
            alignItems: 'start', flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: '8px'
          }}>
            <div>{itemsCard}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: 0 }}>
              {invoiceCard}
              {summaryCard}
            </div>
          </div>
        );
      })()}

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
              {(() => {
                const unnamed = filteredHistory.filter(t => !suppliers.some(s => s.id === t.supplierId));
                if (unnamed.length === 0) return null;
                return (
                  <button type="button" onClick={() => openSupplierEdit(unnamed.map(t => t.id))}
                    style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '999px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer' }}>
                    Atur Supplier {unnamed.length} Faktur Tanpa Nama
                  </button>
                );
              })()}
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
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '240px' }}>AKSI</th>
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
                              <button
                                type="button"
                                onClick={() => openSupplierEdit([tx.id])}
                                style={{
                                  background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                                  borderRadius: '8px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer'
                                }}
                                title="Ubah Supplier"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(tx.id)}
                                style={{
                                  background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca',
                                  borderRadius: '8px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer'
                                }}
                                title="Batal & Hapus"
                              >
                                <Trash2 size={14} />
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
                        <button
                          type="button"
                          onClick={() => openSupplierEdit([tx.id])}
                          style={{
                            background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                            borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                          }}
                          title="Ubah Supplier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTransaction(tx.id)}
                          style={{
                            background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca',
                            borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                          }}
                          title="Batal & Hapus"
                        >
                          <Trash2 size={14} />
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
                        <td style={{ padding: '8px' }}>
                          {it.productName || it.productId}
                          {it.variantName && (
                            <span style={{ marginLeft: '6px', fontSize: '11px', background: '#f5f3ff', color: '#7c3aed', padding: '1px 7px', borderRadius: '4px', fontWeight: 700 }}>{it.variantName}</span>
                          )}
                        </td>
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
                onClick={() => {
                  const sName = suppliers.find(s => s.id === selectedHistoryTx.supplierId)?.name || 'Supplier Rekanan';
                  printPurchaseInvoiceA4({
                    id: selectedHistoryTx.id,
                    documentNo: selectedHistoryTx.documentNo,
                    date: selectedHistoryTx.date,
                    supplierName: sName,
                    totalValue: selectedHistoryTx.totalValue,
                    items: selectedHistoryTx.items || []
                  });
                }}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#1e40af'
                }}
              >
                <Printer size={15} /> Cetak Faktur A4 / PO
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

      {supplierEditIds && (() => {
        const targets = purchaseHistory.filter(t => supplierEditIds.includes(t.id));
        const total = targets.reduce((s, t) => s + (Number(t.totalValue) || 0), 0);
        const removeBy = new Map<string, number>();
        targets.forEach(t => {
          if (t.supplierId && t.onCredit !== false && suppliers.some(s => s.id === t.supplierId)) {
            removeBy.set(t.supplierId, (removeBy.get(t.supplierId) || 0) + (Number(t.totalValue) || 0));
          }
        });
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}
            onClick={() => !isSavingSupplier && setSupplierEditIds(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Ubah Supplier Faktur</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    {targets.length === 1 ? targets[0].documentNo : `${targets.length} faktur dipilih`}
                  </div>
                </div>
                <button type="button" onClick={() => setSupplierEditIds(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
              </div>

              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', color: '#334155' }}>
                  Total nilai faktur: <b style={{ color: '#dc2626' }}>{formatIDR(total)}</b>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Supplier tujuan</label>
                  <select className="bo-input" value={editSupplierId} onChange={e => { setEditSupplierId(e.target.value); setSupplierEditError(''); }}
                    style={{ width: '100%', height: '38px', boxSizing: 'border-box' }}>
                    <option value="">-- Pilih supplier --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} (Hutang: {formatIDR(s.totalPayable || 0)})</option>)}
                  </select>
                  {suppliers.length === 0 && (
                    <div style={{ marginTop: '4px', fontSize: '11.5px', color: '#b45309' }}>Belum ada supplier. Tambahkan di menu Data Supplier terlebih dahulu.</div>
                  )}
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#0f172a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editOnCredit} onChange={e => setEditOnCredit(e.target.checked)} style={{ marginTop: '2px' }} />
                  <span>
                    <b>Catat sebagai hutang</b> ke supplier tujuan
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Hilangkan centang jika faktur sudah dibayar tunai / lunas.</span>
                  </span>
                </label>

                <div style={{ border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', lineHeight: 1.6, color: '#334155' }}>
                  <div style={{ fontWeight: 800, marginBottom: '2px' }}>Dampak pada hutang:</div>
                  {[...removeBy.entries()].map(([sid, amt]) => (
                    <div key={sid} style={{ color: '#b91c1c' }}>− {formatIDR(amt)} dari {suppliers.find(s => s.id === sid)?.name}</div>
                  ))}
                  {editSupplierId && editOnCredit ? (
                    <div style={{ color: '#15803d' }}>+ {formatIDR(total)} ke {suppliers.find(s => s.id === editSupplierId)?.name}</div>
                  ) : (
                    <div style={{ color: '#64748b' }}>Tidak ada hutang yang ditambahkan.</div>
                  )}
                </div>

                {supplierEditError && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 600 }}>{supplierEditError}</div>}
              </div>

              <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" disabled={isSavingSupplier} onClick={() => setSupplierEditIds(null)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Batal</button>
                <button type="button" disabled={isSavingSupplier} onClick={handleSaveSupplierEdit}
                  style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', opacity: isSavingSupplier ? 0.6 : 1 }}>
                  {isSavingSupplier ? 'Menyimpan...' : 'Simpan & Pindahkan Hutang'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          MODAL: PILIH VARIAN (varian terdaftar atau varian BARU yang baru datang)
          ===================================================================== */}
      {variantPickerProduct && (() => {
        const livePicked = new Set(items.filter(i => i.productId === variantPickerProduct.id).map(i => i.key));
        const liveProduct = products.find(p => p.id === variantPickerProduct.id) || variantPickerProduct;
        const variants: any[] = liveProduct.variants || [];
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}
            onClick={() => setVariantPickerProduct(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '460px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Pilih Varian Barang Datang</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{liveProduct.name}</div>
                </div>
                <button type="button" onClick={() => setVariantPickerProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
              </div>

              <div style={{ padding: '12px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Varian terdaftar</div>
                {variants.map(v => {
                  const picked = livePicked.has(makeKey(liveProduct.id, v.id));
                  return (
                    <button key={v.id} type="button" onClick={() => handlePickExistingVariant(v)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', border: picked ? '1.5px solid #7c3aed' : '1px solid #e2e8f0', background: picked ? '#f5f3ff' : '#ffffff', cursor: 'pointer', textAlign: 'left' }}>
                      <span>
                        <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>{v.name}</span>
                        <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Stok saat ini: {v.stock} {liveProduct.unit}</span>
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: picked ? '#7c3aed' : 'var(--primary, #dc2626)' }}>{picked ? '✓ Di keranjang (+1)' : '+ Tambah'}</span>
                    </button>
                  );
                })}

                <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', marginBottom: '6px' }}>Varian baru (belum terdaftar)</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="bo-input" type="text" maxLength={60}
                      placeholder="mis. Merah, Hijau, XL..."
                      value={newVariantInput}
                      onChange={e => { setNewVariantInput(e.target.value); setVariantPickerError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewVariant(); } }}
                      style={{ flex: 1, height: '38px', boxSizing: 'border-box' }}
                    />
                    <button type="button" onClick={handleAddNewVariant}
                      style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', padding: '0 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                      + Varian Baru
                    </button>
                  </div>
                  {variantPickerError && <div style={{ marginTop: '6px', fontSize: '12px', color: '#b91c1c', fontWeight: 600 }}>{variantPickerError}</div>}
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                    Varian baru otomatis terdaftar di aplikasi (Manajemen Stok & Kasir) begitu PO diterbitkan.
                  </div>
                </div>
              </div>

              <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setVariantPickerProduct(null)}
                  style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 20px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                  Selesai
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Barcode / ID *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const randomCode = 'BRG-' + Math.floor(100000 + Math.random() * 900000);
                        setNewProdBarcode(randomCode);
                        if (!newProdSku) setNewProdSku(randomCode);
                      }}
                      style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    >
                      ⚡ Acak Otomatis
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 899123456789 atau BRG-102"
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
