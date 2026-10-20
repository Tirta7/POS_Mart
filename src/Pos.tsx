import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, Printer, ShoppingBag, Truck, Package, ShoppingCart,
  CreditCard, QrCode, Banknote, Ticket, Trash2, PauseCircle,
  LayoutGrid, Plus, Minus, X, LogOut, Camera, ChevronUp, Settings2,
  Grid, List, Tag, Edit3, Check,
  AlertCircle, RefreshCw, ChevronDown, CheckCircle2, Layers,
  Clock, Monitor
} from 'lucide-react';
import './index.css';
import { useNavigate, Link } from 'react-router-dom';

import { useSettingsStore } from './store/useSettingsStore';
import { useInventoryStore } from './store/useInventoryStore';
import { useCustomerStore } from './store/useCustomerStore';
import { useHoldStore } from './store/useHoldStore';
import { useSalesStore } from './store/useSalesStore';
import { useAuthStore } from './store/useAuthStore';
import { usePrinterStore } from './store/usePrinterStore';
import BarcodeScannerCamera from './components/BarcodeScannerCamera';
import { sendSaleNotification } from './utils/pushNotification';
import ReceiptModal from './components/ReceiptModal';
import type { SalesTransaction } from './types';
import ShiftLabel from './components/ShiftLabel';
import type { ReceiptOptions } from './utils/receipt';
import { getProductImage, handleProductImageError } from './utils/defaultProductImage';
import { sound } from './utils/audioFeedback';
import BarcodeLabelModal from './components/BarcodeLabelModal';
import UnregisteredProductModal from './components/UnregisteredProductModal';
import { sendCfdUpdate, subscribeCfd } from './utils/cfdSync';
import CfdLauncherModal from './components/CfdLauncherModal';

/** Tanggal & jam real-time (mengikuti jam perangkat), diperbarui tiap detik. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const date = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':');
  return <>{date}, {time}</>;
}

function App() {
  const { appName, appLogo, taxEnabled, taxRate, roundingUnit } = useSettingsStore();
  const { products: storeProducts, categories, reserveStock, releaseReservedStock } = useInventoryStore();
  const { addSale, sales } = useSalesStore();
  const todayTxCount = sales.filter(s => new Date(s.date).toDateString() === new Date().toDateString()).length;
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // State & kontrol Printer Kasir
  const {
    isConnected: isPrinterConnected,
    isConnecting: isPrinterConnecting,
    deviceName: printerDeviceName,
    deviceId: printerDeviceId,
    paperWidth: printerPaperWidth,
    reconnectSavedDevice,
    connect: connectPrinter,
    disconnect: disconnectPrinter,
    testPrint: testPrintPrinter,
    disconnectAlert,
    clearDisconnectAlert
  } = usePrinterStore();

  const [printerMenuOpen, setPrinterMenuOpen] = useState(false);
  const [cashierPrinterNotice, setCashierPrinterNotice] = useState<{
    type: 'error' | 'warning' | 'success';
    message: string;
  } | null>(null);
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const printerMenuRef = useRef<HTMLDivElement>(null);
  const prevConnectedRef = useRef(isPrinterConnected);

  // Pantau perubahan koneksi printer & berikan notifikasi kasir real-time
  useEffect(() => {
    if (prevConnectedRef.current && !isPrinterConnected) {
      setCashierPrinterNotice({
        type: 'error',
        message: `Koneksi printer kasir (${printerDeviceName || 'Thermal'}) terputus! Periksa daya printer atau klik tombol Sambungkan.`
      });
    } else if (!prevConnectedRef.current && isPrinterConnected) {
      setCashierPrinterNotice({
        type: 'success',
        message: `Printer kasir (${printerDeviceName || 'Thermal'}) berhasil terhubung!`
      });
      const timer = setTimeout(() => {
        setCashierPrinterNotice(prev => prev?.type === 'success' ? null : prev);
      }, 3500);
      return () => clearTimeout(timer);
    }
    prevConnectedRef.current = isPrinterConnected;
  }, [isPrinterConnected, printerDeviceName]);

  // Pantau disconnectAlert dari usePrinterStore
  useEffect(() => {
    if (disconnectAlert) {
      setCashierPrinterNotice({
        type: 'error',
        message: disconnectAlert
      });
    }
  }, [disconnectAlert]);

  // Click-outside listener untuk menutup menu popover printer
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (printerMenuRef.current && !printerMenuRef.current.contains(e.target as Node)) {
        setPrinterMenuOpen(false);
      }
    };
    if (printerMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [printerMenuOpen]);


  
  const [activeCat, setActiveCat] = useState('all');
  const [orderType, setOrderType] = useState('DINE_IN');
  const [cart, setCart] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSelectPopupOpen, setCustomerSelectPopupOpen] = useState(false);
  const { customers, addOrderToCustomer } = useCustomerStore();
  const { heldOrders, holdOrder, removeHeldOrder } = useHoldStore();
  const [paymentMethod, setPaymentMethod] = useState('TUNAI');
  const [tenderedStr, setTenderedStr] = useState('');
  const [holdListOpen, setHoldListOpen] = useState(false);
  const [orderCounter, setOrderCounter] = useState(52);
  const [cfdModalOpen, setCfdModalOpen] = useState(false);

  // Wholesale / Tempo State
  const [tempoType, setTempoType] = useState<'ZERO_DP' | 'DP'>('ZERO_DP');
  const [tempoDpStr, setTempoDpStr] = useState<string>('');
  const [tempoDueDate, setTempoDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [tempoNotes, setTempoNotes] = useState<string>('Pelunasan saat barang sampai');
  
  // Weight Popup State
  const [weightPopupOpen, setWeightPopupOpen] = useState(false);
  const [weightProduct, setWeightProduct] = useState<any>(null);
  const [weightInput, setWeightInput] = useState<number | string>('');

  // Variant Popup State (produk dengan varian: pilih varian dulu sebelum masuk keranjang)
  const [variantProduct, setVariantProduct] = useState<any>(null);

  // Multi-tier Modal State (Dus, Lusin/Renceng/Slop, Eceran)
  const [tierModalProduct, setTierModalProduct] = useState<{
    product: any;
    customQty: number;
  } | null>(null);

  // Payment Popup State
  const [paymentPopupOpen, setPaymentPopupOpen] = useState(false);

  // Struk yang baru dicetak (pratinjau + cetak ulang)
  const [receipt, setReceipt] = useState<{ sale: SalesTransaction; options: ReceiptOptions } | null>(null);

  // Camera Scanner State
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // View Mode: 'grid' (standar foto), 'compact' (ringkas hemat ruang), 'list' (daftar cepat)
  const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>(() => {
    try {
      return (localStorage.getItem('pos_view_mode') as 'grid' | 'compact' | 'list') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleViewModeChange = (mode: 'grid' | 'compact' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('pos_view_mode', mode);
    } catch {}
  };

  // State Ubah Harga Manual (Harga Khusus)
  const [customPriceModalOpen, setCustomPriceModalOpen] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<any>(null);
  const [customPriceInput, setCustomPriceInput] = useState<string>('');
  const [customPriceNoteInput, setCustomPriceNoteInput] = useState<string>('');
  const [customPriceApplyQty, setCustomPriceApplyQty] = useState<'all' | 'split'>('all');

  const openCustomPriceModal = (item: any) => {
    setEditingCartItem(item);
    setCustomPriceInput(String(item.price || 0));
    setCustomPriceNoteInput(item.customPriceNote || (item.isCustomPrice ? 'Harga Khusus' : ''));
    setCustomPriceApplyQty('all');
    setCustomPriceModalOpen(true);
  };

  const handleSaveCustomPrice = () => {
    if (!editingCartItem) return;
    const newPrice = Math.max(0, parseInt(customPriceInput.replace(/\D/g, '') || '0', 10));
    const origPrice = editingCartItem.originalPrice != null ? editingCartItem.originalPrice : editingCartItem.price;
    const isDifferent = newPrice !== origPrice;

    setCart(prev => {
      // Jika user memilih untuk memisahkan 1 pcs (saat qty > 1)
      if (customPriceApplyQty === 'split' && editingCartItem.qty > 1 && isDifferent) {
        const remainingQty = Math.round((editingCartItem.qty - 1) * 1000) / 1000;
        
        // Cek apakah sudah ada baris harga normal lain untuk produk & varian ini
        const existingNormal = prev.find(i => 
          i.cartId !== editingCartItem.cartId && 
          sameLine(i, editingCartItem) && 
          !i.isCustomPrice && 
          i.price === origPrice
        );

        let nextCart = prev.map(item => {
          if (item.cartId === editingCartItem.cartId) {
            return {
              ...item,
              qty: 1,
              price: newPrice,
              originalPrice: origPrice,
              isCustomPrice: true,
              customPriceNote: customPriceNoteInput.trim() || 'Harga Khusus'
            };
          }
          if (existingNormal && item.cartId === existingNormal.cartId) {
            return {
              ...item,
              qty: Math.round((item.qty + remainingQty) * 1000) / 1000
            };
          }
          return item;
        });

        if (!existingNormal) {
          nextCart.push({
            ...editingCartItem,
            cartId: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            qty: remainingQty,
            price: origPrice,
            originalPrice: origPrice,
            isCustomPrice: false,
            customPriceNote: ''
          });
        }

        return nextCart;
      }

      // Terapkan ke seluruh kuantitas di baris ini
      return prev.map(item => {
        if (item.cartId === editingCartItem.cartId) {
          return {
            ...item,
            price: newPrice,
            originalPrice: origPrice,
            isCustomPrice: isDifferent,
            customPriceNote: isDifferent ? (customPriceNoteInput.trim() || 'Harga Khusus') : ''
          };
        }
        return item;
      });
    });

    setCustomPriceModalOpen(false);
    setEditingCartItem(null);
  };

  const handleResetCustomPrice = () => {
    if (!editingCartItem) return;
    const storeItem = storeProducts.find(p => p.id === editingCartItem.id);
    const standardPrice = storeItem ? resolvePrice(storeItem, editingCartItem.variantId, orderType) : (editingCartItem.originalPrice || editingCartItem.price);

    setCart(prev => {
      // Cek apakah sudah ada baris harga normal lain untuk produk ini
      const existingNormalLine = prev.find(i => 
        i.cartId !== editingCartItem.cartId && 
        sameLine(i, editingCartItem) && 
        !i.isCustomPrice && 
        i.price === standardPrice
      );

      if (existingNormalLine) {
        // Gabungkan ke baris normal yang sudah ada
        return prev
          .filter(i => i.cartId !== editingCartItem.cartId)
          .map(i => i.cartId === existingNormalLine.cartId 
            ? { ...i, qty: Math.round((i.qty + editingCartItem.qty) * 1000) / 1000 } 
            : i
          );
      }

      return prev.map(item => {
        if (item.cartId === editingCartItem.cartId) {
          return {
            ...item,
            price: standardPrice,
            originalPrice: standardPrice,
            isCustomPrice: false,
            customPriceNote: ''
          };
        }
        return item;
      });
    });

    setCustomPriceModalOpen(false);
    setEditingCartItem(null);
  };

  // State Dialog Konfirmasi Harga Grosir Otomatis
  interface WholesalePromptData {
    cartId: string;
    name: string;
    variantName?: string;
    unit: string;
    qty: number;
    minWholesaleQty: number;
    normalPrice: number;
    wholesalePrice: number;
  }
  const [wholesalePrompt, setWholesalePrompt] = useState<WholesalePromptData | null>(null);
  const [declinedWholesaleCartIds, setDeclinedWholesaleCartIds] = useState<Set<string>>(new Set());

  const handleAcceptWholesale = () => {
    if (!wholesalePrompt) return;
    const { cartId, wholesalePrice, minWholesaleQty, unit, name } = wholesalePrompt;
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        return {
          ...item,
          price: wholesalePrice,
          isCustomPrice: true,
          customPriceNote: `Harga Grosir (Min ${minWholesaleQty} ${unit})`
        };
      }
      return item;
    }));
    sound.playSuccessChime();
    setToastNotice({
      type: 'success',
      message: `Harga Grosir ${formatIDR(wholesalePrice)} diterapkan untuk ${name}`
    });
    setWholesalePrompt(null);
  };

  const handleDeclineWholesale = () => {
    if (!wholesalePrompt) return;
    const { cartId } = wholesalePrompt;
    setDeclinedWholesaleCartIds(prev => {
      const next = new Set(prev);
      next.add(cartId);
      return next;
    });
    setWholesalePrompt(null);
  };


  // Mobile: keranjang tampil sebagai bottom sheet (gaya iOS)
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  // Perangkat sentuh (HP/tablet): jangan auto-focus search agar keyboard tidak langsung muncul
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  // Tutup sheet otomatis jika keranjang kosong (setelah bayar / hold / hapus semua)
  useEffect(() => {
    if (cart.length === 0) setCartSheetOpen(false);
  }, [cart.length]);

  // Varian multiplier saat discan dengan perkalian (misal 5*kode)
  const [pendingVariantQty, setPendingVariantQty] = useState<number>(1);

  // Floating Toast notification
  const [toastNotice, setToastNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Point 7: Modal Pendaftaran Produk Baru saat Barcode tak ditemukan (Form Lengkap)
  const [quickRegModalOpen, setQuickRegModalOpen] = useState(false);
  const [quickRegBarcode, setQuickRegBarcode] = useState('');
  const [quickRegQty, setQuickRegQty] = useState<number>(1);

  // Point 8: Modal Cetak Label Stiker Bluetooth / Browser (Single & Bulk)
  const [labelModalProduct, setLabelModalProduct] = useState<any | null>(null);
  const [labelModalProducts, setLabelModalProducts] = useState<any[] | null>(null);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelPickerSearch, setLabelPickerSearch] = useState('');
  const [labelPickerCategory, setLabelPickerCategory] = useState('ALL');
  const [selectedLabelProductIds, setSelectedLabelProductIds] = useState<string[]>([]);

  // Auto-dismiss toast notice
  useEffect(() => {
    if (toastNotice) {
      const timer = setTimeout(() => setToastNotice(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [toastNotice]);

  const CATEGORIES = [
    { id: 'all', name: cart.length > 0 ? 'PESANAN' : 'SEMUA (ALL)', icon: <LayoutGrid size={16} /> },
    ...categories.map(cat => ({
      id: cat.toLowerCase(),
      name: cat.toUpperCase(),
      icon: <Package size={16} />
    }))
  ];

  // Harga efektif: harga varian jika diisi, jika kosong ikut harga produk induk.
  // Tipe GROSIR memakai harga grosir (varian -> induk), lainnya memakai harga jual.
  const resolvePrice = (p: any, variantId: string | undefined | null, type: string) => {
    const v = variantId ? (p.variants || []).find((x: any) => x.id === variantId) : null;
    const sell = v?.sellingPrice && v.sellingPrice > 0 ? v.sellingPrice : p.sellingPrice;
    const wholesale = v?.wholesalePrice && v.wholesalePrice > 0 ? v.wholesalePrice : p.wholesalePrice;
    return type === 'TAKEAWAY' && wholesale ? wholesale : sell;
  };

  // Available stock = physical stock - reserved
  const PRODUCTS = storeProducts.filter(p => p.isActive !== false).map((p, i) => {
    const availableStock = p.stock - (p.reserved || 0);
    const minStock = p.minStock ?? 10;
    const isLowStock = availableStock <= minStock;
    const variants = (p.variants || []).map(v => ({
      id: v.id,
      name: v.name,
      barcode: v.barcode || '',
      sku: v.sku || '',
      image: v.image || '',
      price: resolvePrice(p, v.id, orderType),
      wholesalePrice: v.wholesalePrice && v.wholesalePrice > 0 ? v.wholesalePrice : (p.wholesalePrice || 0),
      minWholesaleQty: v.minWholesaleQty && v.minWholesaleQty > 0 ? v.minWholesaleQty : (p.minWholesaleQty || 0),
      availableStock: v.stock - (v.reserved || 0),
    }));
    
    return {
      id: p.id,
      sku: p.sku || '',
      barcode: p.barcode || p.sku || '',
      name: p.name,
      price: resolvePrice(p, null, orderType),
      wholesalePrice: p.wholesalePrice || 0,
      minWholesaleQty: p.minWholesaleQty || 0,
      type: p.category,
      unit: p.unit || 'Pcs',
      badge: (i + 1).toString().padStart(2, '0'),
      img: getProductImage(p.image),
      tag: isLowStock ? 'STOK TIPIS' : (i === 0 ? 'BESTSELLER' : ''),
      tagColor: isLowStock ? 'promo' : '',
      availableStock: availableStock,  // actual available stock
      rawStock: p.stock,
      variants,
      boxBarcode: p.boxBarcode || '',
      boxCapacity: p.boxCapacity || 1,
      boxPrice: p.boxPrice || 0,
      midUnitName: p.midUnitName || '',
      midBarcode: p.midBarcode || '',
      midCapacity: p.midCapacity || 0,
      midPrice: p.midPrice || 0,
      retailBarcode: p.retailBarcode || '',
    };
  });

  // Automatically update prices in the cart if the order type changes (kecuali item dengan harga khusus manual)
  useEffect(() => {
    setCart(prev => prev.map(item => {
      if (item.isCustomPrice) return item;
      const storeItem = storeProducts.find(p => p.id === item.id);
      if (storeItem) {
        const standardPrice = resolvePrice(storeItem, item.variantId, orderType);
        return { ...item, price: standardPrice, originalPrice: standardPrice };
      }
      return item;
    }));
  }, [orderType, storeProducts]);

  const subtotal = cart.reduce((sum, item) => sum + (Math.round(item.price * item.qty)), 0);
  const tax = taxEnabled ? Math.round(subtotal * (taxRate / 100)) : 0;
  const totalBeforeRounding = subtotal + tax;
  const total = roundingUnit > 0 ? Math.ceil(totalBeforeRounding / roundingUnit) * roundingUnit : totalBeforeRounding;
  const rounding = total - totalBeforeRounding;
  const tendered = parseInt(tenderedStr || '0', 10);
  const change = tendered - total;

  const formatIDR = (num: number) => {
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  // Synchronize state with Customer Facing Display (CFD) in real-time
  const emitCfdState = useCallback((override?: any) => {
    const cfdItems = cart.map(item => ({
      id: String(item.id),
      cartId: item.cartId || `${item.id}-${item.selectedVariant?.id || 'std'}`,
      name: item.name,
      variantName: item.variantName || item.selectedVariant?.name || '',
      barcode: item.barcode || '',
      sku: item.sku || '',
      price: item.price,
      originalPrice: item.originalPrice,
      qty: item.qty,
      unit: item.unit || 'Pcs',
      subtotal: Math.round(item.price * item.qty),
      img: item.img || null,
      isCustomPrice: item.isCustomPrice,
      customPriceNote: item.customPriceNote,
    }));

    const totalQty = cart.reduce((sum, item) => sum + (item.qty || 1), 0);

    const payload = {
      tenantId: 'TID-DEMO-123',
      storeName: appName,
      storeLogo: appLogo,
      cashierName: currentUser?.name || 'Kasir',
      orderNumber: orderCounter,
      orderType,
      customerName: selectedCustomer?.name || null,
      items: cfdItems,
      itemCount: cfdItems.length,
      totalQty,
      subtotal,
      tax,
      taxRate,
      taxEnabled,
      rounding,
      total,
      paymentState: {
        isOpen: paymentPopupOpen,
        method: paymentMethod,
        tendered: tendered,
        change: change,
        tempoType,
        tempoDp: Math.max(0, parseInt(tempoDpStr.replace(/\D/g, '') || '0', 10)),
        tempoDueDate,
        isCompleted: false,
        ...(override?.paymentState || {}),
      },
      lastUpdated: Date.now(),
      ...override,
    };

    sendCfdUpdate(payload);
  }, [cart, appName, appLogo, currentUser, orderCounter, orderType, selectedCustomer, subtotal, tax, taxRate, taxEnabled, rounding, total, paymentPopupOpen, paymentMethod, tendered, change, tempoType, tempoDpStr, tempoDueDate]);

  // Synchronize CFD on every state change
  useEffect(() => {
    emitCfdState();
  }, [emitCfdState]);

  // Respond when customer tablet connects or requests sync
  useEffect(() => {
    const unsubscribe = subscribeCfd(
      () => {},
      () => {
        emitCfdState();
      }
    );
    return () => unsubscribe();
  }, [emitCfdState]);

  const handleNumpad = (val: string) => {
    if (val === 'C') {
      setTenderedStr('');
    } else {
      setTenderedStr(prev => prev === '0' ? val : prev + val);
    }
  };

  const updateQty = (cartId: string, delta: number) => {
    let promptCandidate: WholesalePromptData | null = null;
    setCart(prev => {
      const targetItem = prev.find(i => i.cartId === cartId);
      if (!targetItem) return prev;

      const newQty = Math.max(0.01, Math.round((targetItem.qty + delta) * 1000) / 1000);
      
      // Total stok fisik produk ini yang terpakai di baris-baris LAIN di keranjang
      const otherLinesBaseUnits = prev
        .filter(i => i.id === targetItem.id && (i.variantId || null) === (targetItem.variantId || null) && i.cartId !== cartId)
        .reduce((sum, i) => sum + (i.qty * (i.tierMultiplier || 1)), 0);

      const thisMultiplier = targetItem.tierMultiplier || 1;
      if (otherLinesBaseUnits + (newQty * thisMultiplier) > targetItem.availableStock) {
        sound.playScanError();
        alert(`Stok tidak mencukupi! Total di keranjang setara ${Math.round((otherLinesBaseUnits + (newQty * thisMultiplier)) * 1000) / 1000} ${targetItem.unit || 'Pcs'}, melebihi stok tersedia (${targetItem.availableStock} ${targetItem.unit || 'Pcs'}).`);
        return prev;
      }

      const minW = targetItem.minWholesaleQty || 0;
      const wPrice = targetItem.wholesalePrice || 0;
      const normalP = targetItem.originalPrice || targetItem.price;

      // Jika sebelumnya dapat harga grosir otomatis namun qty diturunkan di bawah minimum grosir
      if (targetItem.isCustomPrice && targetItem.customPriceNote?.toLowerCase().includes('harga grosir') && minW > 0 && newQty < minW) {
        return prev.map(item => item.cartId === cartId ? {
          ...item,
          qty: newQty,
          price: normalP,
          isCustomPrice: false,
          customPriceNote: ''
        } : item);
      }

      // Jika qty mencapai atau melebihi minimum grosir dan saat ini belum berharga grosir
      if (
        minW > 0 &&
        wPrice > 0 &&
        wPrice < normalP &&
        targetItem.price > wPrice &&
        newQty >= minW &&
        !declinedWholesaleCartIds.has(cartId)
      ) {
        promptCandidate = {
          cartId,
          name: targetItem.name,
          variantName: targetItem.variantName,
          unit: targetItem.unit || 'Pcs',
          qty: newQty,
          minWholesaleQty: minW,
          normalPrice: normalP,
          wholesalePrice: wPrice
        };
      }

      return prev.map(item => item.cartId === cartId ? { ...item, qty: newQty } : item);
    });

    if (promptCandidate) {
      setWholesalePrompt(promptCandidate);
    }
  };

  const setQtyValue = (cartId: string, value: number) => {
    let promptCandidate: WholesalePromptData | null = null;
    setCart(prev => {
      const targetItem = prev.find(i => i.cartId === cartId);
      if (!targetItem) return prev;

      const safeVal = Math.max(0, value);
      const otherLinesBaseUnits = prev
        .filter(i => i.id === targetItem.id && (i.variantId || null) === (targetItem.variantId || null) && i.cartId !== cartId)
        .reduce((sum, i) => sum + (i.qty * (i.tierMultiplier || 1)), 0);

      const thisMultiplier = targetItem.tierMultiplier || 1;
      if (otherLinesBaseUnits + (safeVal * thisMultiplier) > targetItem.availableStock) {
        sound.playScanError();
        alert(`Stok tidak mencukupi! Hanya tersedia ${targetItem.availableStock} ${targetItem.unit || 'Pcs'}`);
        return prev;
      }

      const minW = targetItem.minWholesaleQty || 0;
      const wPrice = targetItem.wholesalePrice || 0;
      const normalP = targetItem.originalPrice || targetItem.price;

      // Jika sebelumnya dapat harga grosir otomatis namun qty diturunkan di bawah minimum grosir
      if (targetItem.isCustomPrice && targetItem.customPriceNote?.toLowerCase().includes('harga grosir') && minW > 0 && safeVal < minW) {
        return prev.map(item => item.cartId === cartId ? {
          ...item,
          qty: safeVal,
          price: normalP,
          isCustomPrice: false,
          customPriceNote: ''
        } : item);
      }

      // Jika qty mencapai atau melebihi minimum grosir dan saat ini belum berharga grosir
      if (
        minW > 0 &&
        wPrice > 0 &&
        wPrice < normalP &&
        targetItem.price > wPrice &&
        safeVal >= minW &&
        !declinedWholesaleCartIds.has(cartId)
      ) {
        promptCandidate = {
          cartId,
          name: targetItem.name,
          variantName: targetItem.variantName,
          unit: targetItem.unit || 'Pcs',
          qty: safeVal,
          minWholesaleQty: minW,
          normalPrice: normalP,
          wholesalePrice: wPrice
        };
      }

      return prev.map(item => item.cartId === cartId ? { ...item, qty: safeVal } : item);
    });

    if (promptCandidate) {
      setWholesalePrompt(promptCandidate);
    }
  };

  const removeRow = (cartId: string) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const sameLine = (a: any, b: any) =>
    a.id === b.id &&
    (a.variantId || null) === (b.variantId || null) &&
    (a.tierType || 'RETAIL') === (b.tierType || 'RETAIL');

  const addTierToCart = (product: any, tier: 'BOX' | 'MID' | 'RETAIL', customQty: number = 1) => {
    let tierMultiplier = 1;
    let tierUnit = product.unit || 'Pcs';
    let tierPrice = product.price;
    let tierBarcode = product.retailBarcode || product.barcode;

    if (tier === 'BOX') {
      tierMultiplier = product.boxCapacity && product.boxCapacity > 0 ? product.boxCapacity : 1;
      tierUnit = 'Dus';
      tierPrice = product.boxPrice && product.boxPrice > 0 ? product.boxPrice : (product.price * tierMultiplier);
      tierBarcode = product.boxBarcode || product.barcode;
    } else if (tier === 'MID') {
      tierMultiplier = product.midCapacity && product.midCapacity > 0 ? product.midCapacity : 1;
      tierUnit = product.midUnitName || 'Renceng';
      tierPrice = product.midPrice && product.midPrice > 0 ? product.midPrice : (product.price * tierMultiplier);
      tierBarcode = product.midBarcode || product.barcode;
    } else {
      // RETAIL
      tierMultiplier = 1;
      tierUnit = product.unit || 'Pcs';
      tierPrice = product.price;
      tierBarcode = product.retailBarcode || product.barcode;
    }

    setCart(prev => {
      const otherLinesBaseUnits = prev
        .filter(i => i.id === product.id && (i.variantId || null) === (product.variantId || null))
        .reduce((sum, i) => sum + (i.qty * (i.tierMultiplier || 1)), 0);

      if (otherLinesBaseUnits + (customQty * tierMultiplier) > product.availableStock) {
        sound.playScanError();
        alert(`Stok tidak mencukupi! Tersedia ${product.availableStock} ${product.unit || 'Pcs'}, di keranjang sudah terpakai setara ${otherLinesBaseUnits} ${product.unit || 'Pcs'}. Permintaan ini butuh ${(customQty * tierMultiplier)} ${product.unit || 'Pcs'}.`);
        return prev;
      }

      const existingLine = prev.find(i =>
        i.id === product.id &&
        (i.variantId || null) === (product.variantId || null) &&
        (i.tierType || 'RETAIL') === tier &&
        !i.isCustomPrice &&
        i.price === tierPrice
      );

      if (existingLine) {
        const nextQty = Math.round((existingLine.qty + customQty) * 1000) / 1000;
        return prev.map(i => i.cartId === existingLine.cartId ? { ...i, qty: nextQty } : i);
      }

      const newCartId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      return [
        ...prev,
        {
          ...product,
          cartId: newCartId,
          qty: customQty,
          price: tierPrice,
          originalPrice: tierPrice,
          barcode: tierBarcode,
          tierType: tier,
          tierUnit: tierUnit,
          tierMultiplier: tierMultiplier,
          wholesalePrice: 0,
          minWholesaleQty: 0,
          isCustomPrice: false,
          customPriceNote: ''
        }
      ];
    });

    sound.playScanSuccess();
    setToastNotice({
      type: 'success',
      message: `${customQty > 1 ? `${customQty}x ` : ''}${product.name} [${tierUnit.toUpperCase()}] masuk keranjang`
    });
  };

  const addToCart = (product: any, customQty?: number) => {
    const qtyToAdd = customQty !== undefined ? customQty : 1;
    let promptCandidate: WholesalePromptData | null = null;
    
    setCart(prev => {
      // 1. Validasi total stok fisik produk di keranjang (menjumlahkan seluruh baris dengan produk & varian yang sama)
      const currentBaseInCart = prev
        .filter(i => i.id === product.id && (i.variantId || null) === (product.variantId || null))
        .reduce((sum, i) => sum + (i.qty * (i.tierMultiplier || 1)), 0);

      const multiplier = product.tierMultiplier || 1;
      if (currentBaseInCart + (qtyToAdd * multiplier) > product.availableStock) {
        sound.playScanError();
        alert(`Stok tidak mencukupi! Hanya tersedia ${product.availableStock} ${product.unit || 'Pcs'}`);
        return prev;
      }

      // 2. Cari baris yang SAMA: produk sama, varian sama, tier sama, HARGA NORMAL (bukan harga khusus manual), dan harga sama
      const existsNormalLine = prev.find(i => 
        sameLine(i, product) && !i.isCustomPrice && i.price === product.price
      );

      if (existsNormalLine) {
        const nextQty = Math.round((existsNormalLine.qty + qtyToAdd) * 1000) / 1000;
        const minW = existsNormalLine.minWholesaleQty || product.minWholesaleQty || 0;
        const wPrice = existsNormalLine.wholesalePrice || product.wholesalePrice || 0;
        const normalP = existsNormalLine.originalPrice || product.price;

        if (
          minW > 0 &&
          wPrice > 0 &&
          wPrice < normalP &&
          existsNormalLine.price > wPrice &&
          nextQty >= minW &&
          !declinedWholesaleCartIds.has(existsNormalLine.cartId)
        ) {
          promptCandidate = {
            cartId: existsNormalLine.cartId,
            name: existsNormalLine.name,
            variantName: existsNormalLine.variantName,
            unit: existsNormalLine.unit || 'Pcs',
            qty: nextQty,
            minWholesaleQty: minW,
            normalPrice: normalP,
            wholesalePrice: wPrice
          };
        }

        return prev.map(i => 
          i.cartId === existsNormalLine.cartId 
            ? { ...i, qty: nextQty } 
            : i
        );
      }
      
      // 3. Jika belum ada baris normal yang cocok, masukkan sebagai baris item baru
      const newCartId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      const minW = product.minWholesaleQty || 0;
      const wPrice = product.wholesalePrice || 0;
      const normalP = product.price;

      if (
        minW > 0 &&
        wPrice > 0 &&
        wPrice < normalP &&
        qtyToAdd >= minW &&
        !declinedWholesaleCartIds.has(newCartId)
      ) {
        promptCandidate = {
          cartId: newCartId,
          name: product.name,
          variantName: product.variantName,
          unit: product.unit || 'Pcs',
          qty: qtyToAdd,
          minWholesaleQty: minW,
          normalPrice: normalP,
          wholesalePrice: wPrice
        };
      }

      return [
        ...prev,
        {
          ...product,
          cartId: newCartId,
          qty: qtyToAdd,
          originalPrice: product.price,
          wholesalePrice: product.wholesalePrice || 0,
          minWholesaleQty: product.minWholesaleQty || 0,
          isCustomPrice: false,
          customPriceNote: '',
          tierType: product.tierType || 'RETAIL',
          tierUnit: product.tierUnit || product.unit || 'Pcs',
          tierMultiplier: product.tierMultiplier || 1
        }
      ];
    });

    if (promptCandidate) {
      setWholesalePrompt(promptCandidate);
    }
  };

  // Tambah ke keranjang (cek satuan berat -> popup jumlah, selain itu langsung +qty)
  const proceedAdd = (product: any, customQty: number = 1) => {
    const u = (product.unit || '').toLowerCase();
    if (u === 'kg' || u === 'gram' || u === 'liter') {
      setWeightProduct(product);
      setWeightInput(customQty !== 1 ? String(customQty) : '');
      setWeightPopupOpen(true);
    } else {
      addToCart(product, customQty);
    }
  };

  const handleProductClick = (product: any, customQty: number = 1) => {
    // 1. Produk bervarian: tampilkan popup pilih varian dulu
    if (product.variants && product.variants.length > 0) {
      setPendingVariantQty(customQty);
      setVariantProduct(product);
      return;
    }

    // 2. Produk multi-tier (Dus / Renceng / Eceran): tampilkan dialog 3 pilihan harga
    const hasTier = Boolean(
      (product.boxPrice && product.boxPrice > 0) ||
      (product.boxCapacity && product.boxCapacity > 1) ||
      (product.midPrice && product.midPrice > 0)
    );

    if (hasTier) {
      setTierModalProduct({ product, customQty });
      return;
    }

    proceedAdd(product, customQty);
    sound.playScanSuccess();
  };

  const handlePickVariant = (variant: any) => {
    if (!variantProduct) return;
    if (variant.availableStock <= 0) {
      sound.playScanError();
      alert(`Stok varian "${variant.name}" habis!`);
      return;
    }
    const { variants: _omit, ...base } = variantProduct;
    const qty = pendingVariantQty || 1;
    proceedAdd({
      ...base,
      variantId: variant.id,
      variantName: variant.name,
      barcode: variant.barcode || base.barcode,
      sku: variant.sku || base.sku,
      price: variant.price,
      wholesalePrice: variant.wholesalePrice && variant.wholesalePrice > 0 ? variant.wholesalePrice : (base.wholesalePrice || 0),
      minWholesaleQty: variant.minWholesaleQty && variant.minWholesaleQty > 0 ? variant.minWholesaleQty : (base.minWholesaleQty || 0),
      img: variant.image ? getProductImage(variant.image) : base.img,
      availableStock: variant.availableStock,
      unit: variantProduct.unit || 'Pcs',
    }, qty);
    setPendingVariantQty(1);
    setVariantProduct(null);
    sound.playScanSuccess();
    setToastNotice({
      type: 'success',
      message: `${qty > 1 ? `${qty}x ` : ''}${variantProduct.name} (${variant.name}) masuk keranjang`
    });
  };

  /**
   * PROSES BARCODE SCANNER UTAMA (Point 1, 2, 3, 7)
   * Mendukung perkalian kuantitas prefix: "5*899990812345" atau "10xROKOK"
   */
  const handleBarcodeProcess = (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    // Point 3: Multi-Qty Prefix Scan ("5*899990812345" atau "10xROKOK" atau "2.5*BERAS")
    let multiplier = 1;
    let code = trimmed;
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/);
    if (match) {
      multiplier = Math.max(0.001, parseFloat(match[1]) || 1);
      code = match[2].trim();
    }

    const q = code.toLowerCase();

    // 0. MULTI-TIER BARCODES: Auto-deteksi barcode Dus, Kemasan Menengah (Renceng/Lusin), atau Eceran
    const matchedBoxProduct = PRODUCTS.find(p => p.boxBarcode && p.boxBarcode.toLowerCase() === q);
    if (matchedBoxProduct) {
      addTierToCart(matchedBoxProduct, 'BOX', multiplier);
      return;
    }

    const matchedMidProduct = PRODUCTS.find(p => p.midBarcode && p.midBarcode.toLowerCase() === q);
    if (matchedMidProduct) {
      addTierToCart(matchedMidProduct, 'MID', multiplier);
      return;
    }

    const matchedRetailProduct = PRODUCTS.find(p => p.retailBarcode && p.retailBarcode.toLowerCase() === q);
    if (matchedRetailProduct) {
      addTierToCart(matchedRetailProduct, 'RETAIL', multiplier);
      return;
    }

    // 1. PRIORITAS UTAMA: Cari apakah barcode yang di-scan cocok dengan BARCODE KHUSUS VARIAN
    let matchedProduct: any = null;
    let matchedVariant: any = null;

    for (const p of PRODUCTS) {
      if (p.variants && p.variants.length > 0) {
        const v = p.variants.find((vx: any) =>
          (vx.barcode && vx.barcode.toLowerCase() === q) ||
          (vx.sku && vx.sku.toLowerCase() === q)
        );
        if (v) {
          matchedProduct = p;
          matchedVariant = v;
          break;
        }
      }
    }

    // 2. Jika bukan barcode khusus varian, cari exact match produk utama (barcode, SKU, ID)
    if (!matchedProduct) {
      matchedProduct = PRODUCTS.find(p =>
        (p.barcode && p.barcode.toLowerCase() === q) ||
        (p.sku && p.sku.toLowerCase() === q) ||
        p.id.toLowerCase() === q
      );
    }

    // 3. Fallback: cari berdasarkan ID varian atau nama varian persis
    if (!matchedProduct) {
      for (const p of PRODUCTS) {
        if (p.variants && p.variants.length > 0) {
          const v = p.variants.find((vx: any) =>
            vx.id.toLowerCase() === q ||
            vx.name.toLowerCase() === q
          );
          if (v) {
            matchedProduct = p;
            matchedVariant = v;
            break;
          }
        }
      }
    }

    if (matchedProduct) {
      if (matchedVariant) {
        // Varian spesifik langsung cocok dari scan barcode varian
        if (matchedVariant.availableStock <= 0) {
          sound.playScanError();
          alert(`Stok varian "${matchedVariant.name}" habis!`);
          return;
        }
        const { variants: _omit, ...base } = matchedProduct;
        proceedAdd({
          ...base,
          variantId: matchedVariant.id,
          variantName: matchedVariant.name,
          barcode: matchedVariant.barcode || base.barcode,
          sku: matchedVariant.sku || base.sku,
          price: matchedVariant.price,
          wholesalePrice: matchedVariant.wholesalePrice && matchedVariant.wholesalePrice > 0 ? matchedVariant.wholesalePrice : (base.wholesalePrice || 0),
          minWholesaleQty: matchedVariant.minWholesaleQty && matchedVariant.minWholesaleQty > 0 ? matchedVariant.minWholesaleQty : (base.minWholesaleQty || 0),
          img: matchedVariant.image ? getProductImage(matchedVariant.image) : base.img,
          availableStock: matchedVariant.availableStock,
          unit: matchedProduct.unit || 'Pcs',
        }, multiplier);
        sound.playScanSuccess();
        setToastNotice({
          type: 'success',
          message: `${multiplier > 1 ? `${multiplier}x ` : ''}${matchedProduct.name} (${matchedVariant.name}) masuk keranjang`
        });
      } else if (matchedProduct.variants && matchedProduct.variants.length > 0) {
        // Produk punya beberapa varian tapi scan barcode induk -> munculkan dialog pilihan varian
        setPendingVariantQty(multiplier);
        setVariantProduct(matchedProduct);
        sound.playScanSuccess();
      } else {
        // Produk tunggal
        if (matchedProduct.availableStock <= 0) {
          sound.playScanError();
          alert(`Stok produk "${matchedProduct.name}" habis!`);
          return;
        }

        const hasTier = Boolean(
          (matchedProduct.boxPrice && matchedProduct.boxPrice > 0) ||
          (matchedProduct.boxCapacity && matchedProduct.boxCapacity > 1) ||
          (matchedProduct.midPrice && matchedProduct.midPrice > 0)
        );

        if (hasTier) {
          setTierModalProduct({ product: matchedProduct, customQty: multiplier });
          sound.playScanSuccess();
          return;
        }

        proceedAdd(matchedProduct, multiplier);
        sound.playScanSuccess();
        setToastNotice({
          type: 'success',
          message: `${multiplier > 1 ? `${multiplier}x ` : ''}${matchedProduct.name} masuk keranjang`
        });
      }
    } else {
      // 3. BARCODE TIDAK DITEMUKAN -> Dialog Tambah Stok Lengkap (Sesuai Backoffice)
      sound.playScanError();
      setQuickRegBarcode(code);
      setQuickRegQty(multiplier);
      setQuickRegModalOpen(true);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;
      handleBarcodeProcess(q);
      setSearchQuery('');
    }
  };

  // Buffer global scanner hardware (Point 1)
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Shortcut F2: Selalu fokus ke search bar
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      // Jangan intercept jika ada modal penting yang sedang terbuka
      if (
        paymentPopupOpen ||
        receipt ||
        quickRegModalOpen ||
        customPriceModalOpen ||
        customerSelectPopupOpen ||
        holdListOpen ||
        weightPopupOpen ||
        variantProduct ||
        cameraScannerOpen ||
        labelModalProduct ||
        labelPickerOpen
      ) {
        return;
      }

      const activeEl = document.activeElement;
      const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Reset buffer jika jeda antar tombol > 75ms (karena ketukan manual manusia jauh lebih lambat)
      if (diff > 75) {
        barcodeBufferRef.current = '';
      }

      // Jika tombol Enter ditekan
      if (e.key === 'Enter') {
        const buffered = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';

        // Jika kasir sedang fokus di search input, biarkan handleSearchKeyDown yang mengeksekusi
        if (activeEl === searchRef.current) {
          return;
        }

        // Jika terdeteksi input dari buffer scanner (kecepatan tinggi)
        if (buffered.length >= 2) {
          e.preventDefault();
          handleBarcodeProcess(buffered);
        }
        return;
      }

      // Kumpulkan karakter yang printable (panjang 1, bukan tombol sistem)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Jika sedang fokus di input lain, jangan rekam kecuali kecepatannya seperti scanner (< 50ms)
        if (isInputActive && activeEl !== searchRef.current) {
          if (diff > 50) return;
        }
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [
    paymentPopupOpen,
    receipt,
    quickRegModalOpen,
    customPriceModalOpen,
    customerSelectPopupOpen,
    holdListOpen,
    weightPopupOpen,
    variantProduct,
    cameraScannerOpen,
    labelModalProduct,
    labelPickerOpen,
    PRODUCTS,
    cart,
    orderType,
  ]);

  // Handler Sukses Pendaftaran Produk Baru dari Scan Barcode
  const handleSuccessQuickRegister = (created: any, qty: number) => {
    sound.playSuccessChime();
    setToastNotice({
      type: 'success',
      message: `⚡ "${created.name}" (x${qty}) berhasil didaftarkan dan masuk ke keranjang!`
    });

    if (created.variants && created.variants.length > 0) {
      setPendingVariantQty(qty);
      setVariantProduct(created);
    } else {
      proceedAdd({
        id: created.id,
        sku: created.sku || created.id,
        barcode: created.barcode || created.id,
        name: created.name,
        price: resolvePrice(created, null, orderType),
        type: created.category,
        unit: created.unit || 'Pcs',
        badge: 'NEW',
        img: getProductImage(''),
        tag: '',
        tagColor: '',
        availableStock: created.stock,
        rawStock: created.stock,
        variants: []
      }, qty);
    }
  };

  const handleHold = () => {
    if (cart.length === 0) return;
    const now = new Date();
    const holdId = 'HOLD-' + Date.now();
    holdOrder({
      holdId,
      orderNumber: orderCounter.toString().padStart(3, '0'),
      savedAt: now.toISOString(),
      cart,
      orderType,
      selectedCustomer,
    });
    // Reserve stock for each item in the hold
    cart.forEach(item => {
      reserveStock(item.id, item.qty, item.variantId);
    });
    // Clear current order
    setCart([]);
    setDeclinedWholesaleCartIds(new Set());
    setOrderType('DINE_IN');
    setSelectedCustomer(null);
    setTenderedStr('');
    setOrderCounter(prev => prev + 1);
  };

  const handleRestoreHold = (held: any) => {
    // Save current cart to hold if it has items
    if (cart.length > 0) {
      handleHold();
    }
    // Release reservation for the restored hold (it goes back into active cart)
    held.cart.forEach((item: any) => {
      releaseReservedStock(item.id, item.qty, item.variantId);
    });
    setCart(held.cart);
    setOrderType(held.orderType);
    setSelectedCustomer(held.selectedCustomer);
    removeHeldOrder(held.holdId);
    setHoldListOpen(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const submitWeightPopup = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(weightInput);
    if (qty > 0 && weightProduct) {
      if (qty > weightProduct.availableStock) {
        alert(`Stok tidak mencukupi! Hanya tersedia ${weightProduct.availableStock} ${weightProduct.unit}`);
        return;
      }
      addToCart(weightProduct, qty);
      setWeightPopupOpen(false);
      setWeightProduct(null);
    }
  };

  return (
    <div className="app-container">
      {/* TOP NAVBAR */}
      <div className="top-navbar">
        <div className="logo-section">
          <div className="logo-icon" style={{ overflow: 'hidden', padding: appLogo ? '0' : undefined, backgroundColor: appLogo ? 'transparent' : undefined }}>
            {appLogo ? (
              <img src={appLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              appName.charAt(0)
            )}
          </div>
          <div>
            <div className="logo-title" style={{fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.5px'}}>{appName}</div>
            <div className="text-xs text-muted">Terminal #01 • Counter Utama</div>
          </div>
        </div>

        <div className="status-pills">
          <div className="pill"><span className="pill-dot"></span> SERVER ONLINE</div>
          <div className="pill" style={{borderLeft: '1px solid #d1d5db', borderRadius: 0}}><ShiftLabel /></div>
          <div className="pill" style={{borderLeft: '1px solid #d1d5db', borderRadius: 0, fontVariantNumeric: 'tabular-nums'}}><LiveClock /></div>
        </div>

        <div className="nav-links">
          <button className="nav-btn active hide-mobile">Register</button>
          <button className="nav-btn" onClick={() => setHoldListOpen(true)} style={{ position: 'relative' }}>
            <PauseCircle size={15} className="show-mobile" />
            <span className="btn-label"><span className="hide-mobile">Active </span>Tickets</span>
            {heldOrders.length > 0 && (
              <span style={{ position: 'absolute', top: '-6px', right: '-6px', backgroundColor: 'var(--primary)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {heldOrders.length}
              </span>
            )}
          </button>
          <button className="nav-btn hide-mobile">Shift &amp; Drawer</button>
          <button 
            className="nav-btn" 
            onClick={() => setCfdModalOpen(true)}
            title="Hubungkan Layar Pelanggan (CFD Tablet / Second Screen)"
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Monitor size={15} color="#0284c7" />
            <span className="btn-label" style={{ color: '#0369a1', fontWeight: 600 }}>Layar CFD</span>
          </button>
          <Link to="/backoffice" className="nav-btn" style={{ textDecoration: 'none' }}>
            <Settings2 size={15} className="show-mobile" />
            <span className="btn-label">Back-Office</span>
          </Link>
        </div>

        <div className="user-profile">
          <div className="user-text">
            <div className="font-bold text-sm">{currentUser?.name}</div>
            <div className="text-xs text-muted">ID: #{currentUser?.id?.toUpperCase()} • {currentUser?.role}</div>
          </div>
          <img src="https://i.pravatar.cc/100?img=5" alt="Avatar" className="avatar" />
          <button
            className="pos-logout-btn"
            onClick={handleLogout}
            title="Logout"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* SUB NAVBAR */}
      <div className="sub-navbar">
        <div className="order-types">
          <button 
            className={`type-btn ${orderType === 'DINE_IN' ? 'active' : ''}`}
            onClick={() => {
              setOrderType('DINE_IN');
            }}
          >
            <ShoppingCart size={16} /> REGULER
          </button>
          <button 
            className={`type-btn ${orderType === 'TAKEAWAY' ? 'active' : ''}`}
            onClick={() => {
              setOrderType('TAKEAWAY');
              setCustomerSelectPopupOpen(true);
            }}
          >
            <ShoppingBag size={16} /> GROSIR / PARTAI
          </button>
          <button 
            className={`type-btn ${orderType === 'DRIVETHRU' ? 'active' : ''}`}
            onClick={() => {
              setOrderType('DRIVETHRU');
            }}
          >
            <Truck size={16} /> DELIVERY
          </button>
        </div>

        <div className="search-container" style={{ display: 'flex', gap: '8px', padding: 0, backgroundColor: 'transparent', border: 'none' }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Search size={18} className="search-icon" style={{ position: 'absolute', left: '12px', color: '#9ca3af' }} />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Cari menu, SKU atau scan barcode... [F2]"
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                const trimmed = val.trim();
                // Jika kasir menembakkan barcode langsung tanpa Enter dan bukan format perkalian
                if (trimmed && !trimmed.includes('*') && !trimmed.includes('x') && !trimmed.includes('X')) {
                  const q = trimmed.toLowerCase();
                  const exactMatch = PRODUCTS.find(p => 
                    (p.barcode && p.barcode.toLowerCase() === q) || 
                    (p.sku && p.sku.toLowerCase() === q) || 
                    p.id.toLowerCase() === q ||
                    (p.variants && p.variants.some((v: any) => (v.barcode && v.barcode.toLowerCase() === q) || (v.sku && v.sku.toLowerCase() === q)))
                  );
                  if (exactMatch) {
                    handleBarcodeProcess(trimmed);
                    setTimeout(() => setSearchQuery(''), 0);
                  }
                }
              }}
              onKeyDown={handleSearchKeyDown}
              autoFocus={!isTouchDevice}
              style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none', transition: 'all 0.2s' }}
            />
            <span className="search-shortcut" style={{ position: 'absolute', right: '12px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#6b7280', fontWeight: 'bold' }}>F2</span>
          </div>
          
          <button 
            type="button"
            className="camera-scan-btn"
            onClick={() => setCameraScannerOpen(true)}
            aria-label="Kamera Scan"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}
          >
            <Camera size={16} /> <span className="hide-mobile">Kamera Scan</span>
          </button>

          <button 
            type="button"
            className="label-print-quick-btn"
            onClick={() => setLabelPickerOpen(true)}
            aria-label="Cetak Label Barcode"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}
            title="Cetak label barcode / stiker harga rak via Bluetooth atau Browser"
          >
            <Tag size={16} /> <span className="hide-mobile">Cetak Label</span>
          </button>
        </div>

        <div className="status-indicators">
          <div className="flex items-center gap-2" style={{background: '#fef3c7', padding: '0.4rem 0.75rem', borderRadius: '6px', color: '#b45309'}}>
            <Ticket size={16} /> Total Transaksi: <strong>{todayTxCount} Nota</strong>
          </div>

          {/* NOTE PEMBERITAHUAN PRINTER KASIR (INTERAKTIF & REAL-TIME) */}
          <div className="relative" ref={printerMenuRef} style={{ position: 'relative' }}>
            {isPrinterConnected ? (
              // 1. TERHUBUNG (HIJAU)
              <div
                onClick={() => setPrinterMenuOpen(!printerMenuOpen)}
                className="flex items-center gap-2 cursor-pointer select-none"
                style={{
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  color: '#166534',
                  boxShadow: '0 1px 2px rgba(22, 101, 52, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Printer kasir terhubung. Klik untuk tes cetak atau menu cepat."
              >
                <span className="pill-dot" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.25)' }}></span>
                <span>Printer Kasir: <strong>Terhubung</strong></span>
                {printerDeviceName && (
                  <span style={{ fontSize: '11px', background: '#bbf7d0', color: '#14532d', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                    {printerDeviceName}
                  </span>
                )}
                <ChevronDown size={13} style={{ opacity: 0.6, transform: printerMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </div>
            ) : isPrinterConnecting ? (
              // 2. MENYAMBUNGKAN (BIRU)
              <div
                className="flex items-center gap-2 select-none"
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  color: '#1d4ed8'
                }}
              >
                <RefreshCw size={13} className="animate-spin text-blue-600" />
                <span>Printer Kasir: <em>Menyambungkan...</em></span>
              </div>
            ) : (printerDeviceName || printerDeviceId) ? (
              // 3. TERPUTUS DENGAN PERANGKAT TERSIMPAN (MERAH & PEMBERITAHUAN KASIR)
              <div
                className="flex items-center gap-2 select-none"
                style={{
                  background: '#fee2e2',
                  border: '1px solid #f87171',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  color: '#991b1b',
                  boxShadow: '0 1px 3px rgba(239, 68, 68, 0.15)'
                }}
              >
                <AlertCircle size={15} className="text-red-600 animate-pulse" />
                <span>Printer Kasir: <strong style={{ color: '#b91c1c' }}>Terputus</strong></span>
                {printerDeviceName && (
                  <span style={{ fontSize: '10.5px', background: '#fecaca', color: '#7f1d1d', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>
                    {printerDeviceName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reconnectSavedDevice(false);
                  }}
                  title="Klik untuk menyambungkan printer kasir sekarang tanpa buka pengaturan"
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: '2px',
                    boxShadow: '0 1px 2px rgba(220, 38, 38, 0.25)'
                  }}
                >
                  <RefreshCw size={11} /> Sambungkan
                </button>
                <button
                  type="button"
                  onClick={() => setPrinterMenuOpen(!printerMenuOpen)}
                  style={{ background: 'transparent', border: 'none', color: '#991b1b', cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center' }}
                  title="Opsi printer"
                >
                  <ChevronDown size={13} style={{ opacity: 0.7, transform: printerMenuOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
              </div>
            ) : (
              // 4. BELUM DIATUR (ABU-ABU)
              <div
                onClick={() => connectPrinter()}
                className="flex items-center gap-2 cursor-pointer select-none"
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  color: '#475569',
                  cursor: 'pointer'
                }}
                title="Klik untuk menyambungkan printer kasir Bluetooth"
              >
                <Printer size={14} className="text-slate-500" />
                <span>Printer Kasir: <em>Belum Diatur</em></span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    connectPrinter();
                  }}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 7px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Hubungkan
                </button>
              </div>
            )}

            {/* QUICK POPOVER / DROPDOWN MENU KASIR */}
            {printerMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '240px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                  border: '1px solid #e2e8f0',
                  padding: '8px',
                  zIndex: 1000,
                  fontSize: '12px',
                  color: '#1e293b'
                }}
              >
                {/* Header status */}
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', marginBottom: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>STATUS PRINTER KASIR</div>
                  <div style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: isPrinterConnected ? '#22c55e' : '#ef4444' }}></span>
                    {isPrinterConnected ? `${printerDeviceName || 'Thermal Printer'}` : `${printerDeviceName || 'Printer'} (Terputus)`}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Kertas Thermal: {printerPaperWidth}
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {isPrinterConnected ? (
                    <>
                      <button
                        type="button"
                        disabled={isTestPrinting}
                        onClick={async () => {
                          setIsTestPrinting(true);
                          const ok = await testPrintPrinter(appName);
                          setIsTestPrinting(false);
                          if (ok) {
                            setCashierPrinterNotice({ type: 'success', message: 'Tes cetak struk berhasil dikirim ke printer!' });
                            setTimeout(() => setCashierPrinterNotice(null), 3000);
                          } else {
                            setCashierPrinterNotice({ type: 'error', message: 'Tes cetak gagal. Pastikan kertas terpasang dan printer siap.' });
                          }
                          setPrinterMenuOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#f8fafc',
                          color: '#0f172a',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                      >
                        <Printer size={14} className="text-blue-600" />
                        <span>{isTestPrinting ? 'Mencetak...' : 'Tes Cetak Struk'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          disconnectPrinter();
                          setPrinterMenuOpen(false);
                          setCashierPrinterNotice({ type: 'warning', message: 'Printer kasir diputuskan sementara.' });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#f8fafc',
                          color: '#dc2626',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                      >
                        <X size={14} />
                        <span>Putuskan Koneksi</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPrinterMenuOpen(false);
                        reconnectSavedDevice(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#dc2626',
                        color: '#ffffff',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>Sambungkan Sekarang</span>
                    </button>
                  )}

                  <Link
                    to="/backoffice/printer-settings"
                    onClick={() => setPrinterMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      color: '#475569',
                      textDecoration: 'none',
                      fontWeight: 600,
                      background: '#ffffff'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                  >
                    <Settings2 size={14} className="text-slate-600" />
                    <span>Pengaturan Printer Lengkap</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        
        {/* LEFT PANEL */}
        <div className="left-panel">
          <div className="categories-header-row">
            <div className="categories-bar">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat.id} 
                  className={`cat-btn ${activeCat === cat.id ? 'active' : ''}`}
                  onClick={() => setActiveCat(cat.id)}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>

            <div className="view-mode-controls" aria-label="Pilih Mode Tampilan">
              <button 
                type="button"
                className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('grid')}
                title="Tampilan Grid Standar"
              >
                <LayoutGrid size={14} />
                <span className="hide-mobile">Grid</span>
              </button>
              <button 
                type="button"
                className={`view-mode-btn ${viewMode === 'compact' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('compact')}
                title="Tampilan Ringkas (Muat Lebih Banyak)"
              >
                <Grid size={14} />
                <span className="hide-mobile">Ringkas</span>
              </button>
              <button 
                type="button"
                className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('list')}
                title="Tampilan Daftar / List"
              >
                <List size={14} />
                <span className="hide-mobile">List</span>
              </button>
            </div>
          </div>

          <div className={`product-grid ${viewMode === 'compact' ? 'mode-compact' : viewMode === 'list' ? 'mode-list' : ''}`}>
            {PRODUCTS.filter(p => {
              const catMatch = activeCat === 'all' || p.type.toLowerCase() === activeCat.toLowerCase();
              const isSearching = searchQuery.trim().length > 0;
              
              // Jika user sedang mencari, abaikan filter keranjang dan langsung cocokan teks
              if (isSearching) {
                const q = searchQuery.toLowerCase();
                const textMatch = p.name.toLowerCase().includes(q) || 
                                  p.sku.toLowerCase().includes(q) || 
                                  (p.barcode && p.barcode.toLowerCase().includes(q)) ||
                                  (p.variants || []).some((v: any) => String(v.name || '').toLowerCase().includes(q)) ||
                                  p.id.toLowerCase().includes(q);
                return catMatch && textMatch;
              }
              
              // Jika TIDAK mencari dan di tab ALL, tampilkan HANYA yang ada di keranjang (jika keranjang ada isinya)
              if (activeCat === 'all' && cart.length > 0) {
                return cart.some((cartItem: any) => cartItem.id === p.id);
              }

              return catMatch;
            }).map(product => {
              if (viewMode === 'list') {
                return (
                  <div key={product.id} className="product-list-row" onClick={() => handleProductClick(product)}>
                    <span className="product-list-num">#{product.badge}</span>
                    <img 
                      src={product.img} 
                      alt={product.name} 
                      className="product-list-img"
                      onError={handleProductImageError}
                    />
                    <div className="product-list-main">
                      <div className="product-list-name" title={product.name}>{product.name}</div>
                      <div className="product-list-meta">
                        <span>{product.sku || product.barcode || product.type}</span>
                        <span>•</span>
                        {product.variants.length > 0 && (
                          <span className="tag" style={{ backgroundColor: '#ede9fe', color: '#5b21b6', fontWeight: 'bold' }}>
                            {product.variants.length} Varian
                          </span>
                        )}
                        <span 
                          className="tag" 
                          style={{ 
                            backgroundColor: product.availableStock <= 0 ? '#fee2e2' : '#dcfce7', 
                            color: product.availableStock <= 0 ? '#991b1b' : '#166534', 
                            fontWeight: 'bold' 
                          }}
                        >
                          Stok: {product.availableStock} {product.unit}
                        </span>
                      </div>
                    </div>
                    <div className="product-list-right">
                      <div className="product-list-price">
                        {formatIDR(product.price)}
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'normal' }}>/{product.unit}</div>
                      </div>
                      <button
                        type="button"
                        className="product-list-label-btn"
                        title="Cetak Stiker Label Barcode / Rak"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLabelModalProduct({
                            id: product.id,
                            name: product.name,
                            barcode: product.barcode,
                            sku: product.sku,
                            sellingPrice: product.price,
                            unit: product.unit,
                          });
                        }}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1d4ed8',
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Tag size={14} />
                      </button>
                      <button className="product-list-add-btn" title="Tambah ke keranjang">
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                );
              }

              // Standard Grid & Compact Grid
              return (
                <div key={product.id} className="product-card" onClick={() => handleProductClick(product)}>
                  <img 
                    src={product.img} 
                    alt={product.name} 
                    className="product-img" 
                    onError={handleProductImageError}
                  />
                  {product.badge && <div className="product-num">#{product.badge}</div>}
                  {product.tag && (
                    <div className={`product-badge ${product.tagColor === 'promo' ? 'promo' : ''}`}>
                      {product.tag}
                    </div>
                  )}
                  <button
                    type="button"
                    className="product-card-label-btn"
                    title="Cetak Stiker Label Barcode"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLabelModalProduct({
                        id: product.id,
                        name: product.name,
                        barcode: product.barcode,
                        sku: product.sku,
                        sellingPrice: product.price,
                        unit: product.unit,
                      });
                    }}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.92)',
                      border: '1px solid rgba(0,0,0,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#4b5563',
                      cursor: 'pointer',
                      zIndex: 3,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Tag size={13} />
                  </button>
                  <div className="product-info">
                    <div className="product-title" title={product.name}>{product.name}</div>
                    <div className="product-tags">
                      {product.variants.length > 0 && (
                        <span className="tag" style={{ backgroundColor: '#ede9fe', color: '#5b21b6', fontWeight: 'bold' }}>
                          {product.variants.length} Varian
                        </span>
                      )}
                      {product.type && <span className="tag">{product.type}</span>}
                      <span 
                        className="tag" 
                        style={{ 
                          backgroundColor: product.availableStock <= 0 ? '#fee2e2' : '#dcfce7', 
                          color: product.availableStock <= 0 ? '#991b1b' : '#166534', 
                          fontWeight: 'bold' 
                        }}
                      >
                        Stok: {product.availableStock} {product.unit}
                      </span>
                    </div>
                    <div className="product-bottom">
                      <span className="product-category" title={product.type}>{product.type}</span>
                      <span className="product-price">
                        {formatIDR(product.price)}
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'normal' }}>/{product.unit}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL (desktop: panel kanan, mobile: bottom sheet) */}
        <div className={`right-panel ${cartSheetOpen ? 'sheet-open' : ''}`}>
          {/* Header sheet khusus mobile (grabber gaya iOS) */}
          <div className="sheet-header">
            <div className="sheet-grabber" onClick={() => setCartSheetOpen(false)} />
            <div className="sheet-title-row">
              <span className="sheet-title">Keranjang</span>
              <button className="sheet-close" onClick={() => setCartSheetOpen(false)} aria-label="Tutup keranjang">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="order-header">
            <div className="flex items-center">
              <div className="order-number">{orderCounter}</div>
              <div className="order-info">
                <h2>Pesanan #{orderCounter.toString().padStart(3, '0')} <span className="order-type-badge">{orderType === 'TAKEAWAY' ? 'GROSIR / PARTAI' : 'REGULER'}</span></h2>
                <div className="order-meta">
                  {cart.length} Item • Kasir: {currentUser?.name || 'Kasir'}
                  {selectedCustomer ? (
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', marginLeft: '8px' }}>
                      • Plg: {selectedCustomer.name}{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '11px', textDecoration: 'underline', padding: '0 2px' }}
                      >
                        (Ganti)
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCustomerSelectPopupOpen(true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 'bold', marginLeft: '8px', fontSize: '12px' }}
                    >
                      • + Pilih Pelanggan
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="order-actions">
              <button className="icon-btn" onClick={() => {
                setCart([]);
                setDeclinedWholesaleCartIds(new Set());
              }}><Trash2 size={16} /></button>
              <button className="hold-btn" onClick={handleHold} disabled={cart.length === 0} style={{ opacity: cart.length === 0 ? 0.5 : 1 }}><PauseCircle size={16} /> Hold [F5]</button>
            </div>
          </div>

          <div className="cart-list">
            {cart.map(item => (
              <div key={item.cartId} className="cart-item">
                <div className="item-details">
                  <div className="item-title">
                    {item.name}
                    {item.variantName && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ede9fe', color: '#5b21b6', padding: '1px 8px', borderRadius: '999px' }}>
                        {item.variantName}
                      </span>
                    )}
                    {item.tierType === 'BOX' && (
                      <span style={{ marginLeft: '6px', fontSize: '10.5px', fontWeight: 800, backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 7px', borderRadius: '4px' }}>
                        DUS ({item.tierMultiplier} pcs)
                      </span>
                    )}
                    {item.tierType === 'MID' && (
                      <span style={{ marginLeft: '6px', fontSize: '10.5px', fontWeight: 800, backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 7px', borderRadius: '4px' }}>
                        {(item.tierUnit || 'MID').toUpperCase()} ({item.tierMultiplier} pcs)
                      </span>
                    )}
                    {item.tierType === 'RETAIL' && (
                      <span style={{ marginLeft: '6px', fontSize: '10.5px', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '1px 7px', borderRadius: '4px' }}>
                        ECER
                      </span>
                    )}
                  </div>

                  {/* Harga satuan & Tombol Ubah Harga Manual */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                      @{formatIDR(item.price)}
                    </span>
                    {item.isCustomPrice && item.customPriceNote?.toLowerCase().includes('grosir') ? (
                      <button 
                        type="button"
                        onClick={() => openCustomPriceModal(item)}
                        style={{
                          border: '1px solid #bae6fd',
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                        title="Harga Grosir Aktif (Klik untuk ubah)"
                      >
                        <Package size={10} />
                        Grosir
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={() => openCustomPriceModal(item)}
                        style={{
                          border: item.isCustomPrice ? '1px solid #fde68a' : '1px solid #e2e8f0',
                          background: item.isCustomPrice ? '#fef3c7' : '#f8fafc',
                          color: item.isCustomPrice ? '#b45309' : '#475569',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          transition: 'all 0.15s ease'
                        }}
                        title="Ubah harga satuan secara manual (Harga Khusus)"
                      >
                        <Edit3 size={10} />
                        {item.isCustomPrice ? 'Harga Khusus' : 'Ubah Harga'}
                      </button>
                    )}
                    {item.isCustomPrice && item.originalPrice && item.originalPrice !== item.price && (
                      <span style={{ fontSize: '10.5px', textDecoration: 'line-through', color: '#94a3b8' }}>
                        {formatIDR(item.originalPrice)}
                      </span>
                    )}
                  </div>

                  {item.isCustomPrice && item.customPriceNote && (
                    <div style={{
                      fontSize: '10.5px',
                      color: item.customPriceNote.toLowerCase().includes('grosir') ? '#0284c7' : '#b45309',
                      fontWeight: 700,
                      marginTop: '2px'
                    }}>
                      * {item.customPriceNote}
                    </div>
                  )}

                  {item.note && <div className="item-note">{item.note}</div>}
                </div>

                <div className="item-price">
                  {formatIDR(Math.round(item.price * item.qty))}
                </div>

                <div className="item-controls">
                  <div className="qty-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
                    <button className="qty-btn" onClick={() => updateQty(item.cartId, -1)}><Minus size={14}/></button>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      value={item.qty}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        if (val.split('.').length <= 2) {
                          setQtyValue(item.cartId, Number(val));
                        }
                      }}
                      style={{ width: '55px', minWidth: '40px', textAlign: 'center', fontWeight: 'bold', border: 'none', background: 'transparent', outline: 'none', padding: '0 4px' }}
                    />
                    <button className="qty-btn" onClick={() => updateQty(item.cartId, 1)}><Plus size={14}/></button>
                  </div>
                  <span style={{ fontSize: '11px', color: '#888', minWidth: '28px', width: 'auto', textAlign: 'left', marginLeft: '4px' }}>
                    {item.tierUnit || item.unit}
                  </span>
                  <button className="remove-btn" onClick={() => removeRow(item.cartId)} style={{ marginLeft: 'auto' }}><X size={16}/></button>
                </div>
              </div>
            ))}
          </div>

          <div className="payment-section">
            <div className="totals-row">
              <span>Subtotal Pesanan</span>
              <span>{formatIDR(subtotal)}</span>
            </div>
            {taxEnabled && (
              <div className="totals-row">
                <span>PPN ({taxRate}%) ⓘ</span>
                <span>{formatIDR(tax)}</span>
              </div>
            )}
            {rounding > 0 && (
              <div className="totals-row">
                <span style={{ color: '#9ca3af', fontSize: '12px' }}>Pembulatan</span>
                <span style={{ color: '#9ca3af', fontSize: '12px' }}>+ {formatIDR(rounding)}</span>
              </div>
            )}
            <div className="totals-row grand-total">
              <span className="grand-total-label">TOTAL TAGIHAN</span>
              <span className="grand-total-value">{formatIDR(total)}</span>
            </div>

            <div className="payment-methods" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <button className={`method-btn ${paymentMethod === 'TUNAI' ? 'active' : ''}`} onClick={() => { setPaymentMethod('TUNAI'); setPaymentPopupOpen(true); }}>
                <Banknote /> TUNAI
              </button>
              <button className={`method-btn ${paymentMethod === 'QRIS' ? 'active' : ''}`} onClick={() => { setPaymentMethod('QRIS'); setPaymentPopupOpen(true); }}>
                <QrCode /> QRIS
              </button>
              <button className={`method-btn ${paymentMethod === 'EDC' ? 'active' : ''}`} onClick={() => { setPaymentMethod('EDC'); setPaymentPopupOpen(true); }}>
                <CreditCard /> DEBIT/EDC
              </button>
              <button className={`method-btn ${paymentMethod === 'KUPON' ? 'active' : ''}`} onClick={() => { setPaymentMethod('KUPON'); setPaymentPopupOpen(true); }}>
                <Ticket /> KUPON
              </button>
              <button className={`method-btn ${paymentMethod === 'TEMPO' ? 'active' : ''}`} onClick={() => { setPaymentMethod('TEMPO'); setPaymentPopupOpen(true); }}>
                <Clock /> TEMPO (GROSIR)
              </button>
            </div>

            <button 
              className={`checkout-btn ${cart.length === 0 ? 'disabled' : ''}`}
              disabled={cart.length === 0}
              onClick={() => setPaymentPopupOpen(true)}
              style={{ marginTop: 'auto' }}
            >
              <div className="flex items-center gap-2">
                <CreditCard size={20} />
                PEMBAYARAN
              </div>
              <div className="flex items-center gap-2">
                {formatIDR(total)} <span className="enter-badge">ENTER</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE: backdrop bottom sheet + floating cart bar */}
      <div
        className={`sheet-backdrop ${cartSheetOpen ? 'open' : ''}`}
        onClick={() => setCartSheetOpen(false)}
        aria-hidden="true"
      />
      {cart.length > 0 && !cartSheetOpen && (
        <button className="mobile-cart-bar" onClick={() => setCartSheetOpen(true)}>
          <span className="mcb-count"><ShoppingCart size={16} />{cart.length}</span>
          <span className="mcb-label">
            <small>Pesanan #{orderCounter.toString().padStart(3, '0')}</small>
            <strong>Lihat Keranjang</strong>
          </span>
          <span className="mcb-total">{formatIDR(total)} <ChevronUp size={18} /></span>
        </button>
      )}

      {/* RECEIPT PREVIEW / PRINT */}
      {receipt && (
        <ReceiptModal
          sale={receipt.sale}
          options={receipt.options}
          onClose={() => setReceipt(null)}
        />
      )}

      {/* PAYMENT MODAL POPUP */}
      {paymentPopupOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content pay-modal" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
                  {paymentMethod === 'TEMPO' ? 'Pembayaran Tempo / Grosir' : 'Pembayaran Kasir'}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Metode: <strong style={{ color: paymentMethod === 'TEMPO' ? '#d97706' : '#2563eb' }}>{paymentMethod}</strong>
                </div>
              </div>
              <button onClick={() => setPaymentPopupOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={26} color="#666" /></button>
            </div>

            <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '2px' }}>TOTAL TAGIHAN</div>
              <div style={{ fontSize: '30px', fontWeight: 'bold', color: 'var(--primary)' }}>{formatIDR(total)}</div>
            </div>

            {/* JIKA PEMBAYARAN TEMPO / CICILAN GROSIR */}
            {paymentMethod === 'TEMPO' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                {/* Customer indicator / Selector */}
                <div style={{
                  background: selectedCustomer ? '#ecfdf5' : '#fffbeb',
                  border: selectedCustomer ? '1px solid #a7f3d0' : '1px solid #fde68a',
                  borderRadius: '12px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: selectedCustomer ? '#065f46' : '#92400e', fontWeight: 700 }}>
                      {selectedCustomer ? 'Pelanggan Grosir Terpilih:' : '⚠️ Rekomendasi Kasir:'}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: selectedCustomer ? '#065f46' : '#b45309' }}>
                      {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone || 'Tanpa No. HP'})` : 'Pilih Pelanggan agar piutang tercatat rapi'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomerSelectPopupOpen(true)}
                    style={{
                      background: '#ffffff', border: '1px solid #cbd5e1', padding: '5px 12px',
                      borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer'
                    }}
                  >
                    {selectedCustomer ? 'Ganti' : 'Pilih Pelanggan'}
                  </button>
                </div>

                {/* Skema DP vs 0 DP */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Skema Pembayaran Tempo:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => { setTempoType('ZERO_DP'); setTempoDpStr('0'); }}
                      style={{
                        padding: '10px', borderRadius: '10px', fontSize: '12px', fontWeight: 800,
                        border: tempoType === 'ZERO_DP' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: tempoType === 'ZERO_DP' ? '#eff6ff' : '#ffffff',
                        color: tempoType === 'ZERO_DP' ? '#2563eb' : '#475569',
                        cursor: 'pointer', textAlign: 'center'
                      }}
                    >
                      📦 Bayar Saat Barang Tiba (DP Rp 0)
                    </button>

                    <button
                      type="button"
                      onClick={() => { setTempoType('DP'); setTempoDpStr(Math.round(total * 0.3).toString()); }}
                      style={{
                        padding: '10px', borderRadius: '10px', fontSize: '12px', fontWeight: 800,
                        border: tempoType === 'DP' ? '2px solid #059669' : '1px solid #cbd5e1',
                        background: tempoType === 'DP' ? '#ecfdf5' : '#ffffff',
                        color: tempoType === 'DP' ? '#059669' : '#475569',
                        cursor: 'pointer', textAlign: 'center'
                      }}
                    >
                      💵 Uang Muka / DP Sebagian
                    </button>
                  </div>
                </div>

                {/* Input DP jika mode DP */}
                {tempoType === 'DP' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        Nominal Uang Muka (DP Diterima Sekarang):
                      </label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[10, 25, 50].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setTempoDpStr(Math.round(total * (pct / 100)).toString())}
                            style={{
                              background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px',
                              padding: '2px 8px', fontSize: '11px', fontWeight: 700, color: '#475569', cursor: 'pointer'
                            }}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      value={tempoDpStr}
                      onChange={e => setTempoDpStr(e.target.value)}
                      placeholder="Masukkan jumlah DP..."
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #059669',
                        fontSize: '16px', fontWeight: 800, color: '#0f172a'
                      }}
                    />
                  </div>
                )}

                {/* Ringkasan Piutang */}
                {(() => {
                  const dpAmt = tempoType === 'ZERO_DP' ? 0 : (parseFloat(tempoDpStr) || 0);
                  const remainingDebt = Math.max(0, total - dpAmt);
                  return (
                    <div style={{
                      background: '#f8fafc', borderRadius: '12px', padding: '12px 16px',
                      border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}>
                        <span>Total Nilai Belanja:</span>
                        <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatIDR(total)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}>
                        <span>Uang Muka (DP) Sekarang:</span>
                        <span style={{ fontWeight: 800, color: '#16a34a' }}>{formatIDR(dpAmt)}</span>
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: '14px',
                        borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '2px'
                      }}>
                        <span style={{ fontWeight: 800, color: '#b91c1c' }}>Sisa Piutang Tempo:</span>
                        <span style={{ fontWeight: 900, color: '#dc2626', fontSize: '16px' }}>{formatIDR(remainingDebt)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Jatuh Tempo & Catatan */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Jatuh Tempo:
                    </label>
                    <input
                      type="date"
                      value={tempoDueDate}
                      onChange={e => setTempoDueDate(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Catatan Pengiriman / Invoice:
                    </label>
                    <input
                      type="text"
                      value={tempoNotes}
                      onChange={e => setTempoNotes(e.target.value)}
                      placeholder="Mis: Pelunasan saat barang tiba..."
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* REGULAR CASH / QRIS / EDC NUMPAD */
              <>
                <div className="quick-cash" style={{ marginBottom: '16px' }}>
                  <button className="qcash-btn highlight" onClick={() => setTenderedStr(total.toString())}>UANG PAS</button>
                  <button className="qcash-btn" onClick={() => setTenderedStr('160000')}>160.000</button>
                  <button className="qcash-btn" onClick={() => setTenderedStr('170000')}>170.000</button>
                  <button className="qcash-btn" onClick={() => setTenderedStr('200000')}>200.000</button>
                </div>

                <div className="numpad-area" style={{ marginBottom: '24px' }}>
                  <div className="numpad">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                      <button key={num} className="num-btn" onClick={() => handleNumpad(num.toString())}>{num}</button>
                    ))}
                    <button className="num-btn red" onClick={() => handleNumpad('C')}>C</button>
                    <button className="num-btn" onClick={() => handleNumpad('0')}>0</button>
                    <button className="num-btn" onClick={() => handleNumpad('000')}>000</button>
                  </div>
                  <div className="amounts-display">
                    <div className="amount-box">
                      <div className="amount-label text-muted">UANG DITERIMA</div>
                      <div className="amount-value" style={{ fontSize: '20px' }}>{tendered ? formatIDR(tendered) : '-'}</div>
                    </div>
                    <div className={`amount-box ${change >= 0 && tendered > 0 ? 'green' : ''}`}>
                      <div className="amount-label">KEMBALIAN</div>
                      <div className="amount-value" style={{ fontSize: '20px' }}>{change >= 0 && tendered > 0 ? formatIDR(change) : '-'}</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <button 
              className={`checkout-btn ${(tendered < total && paymentMethod === 'TUNAI') || (paymentMethod === 'TEMPO' && tempoType === 'DP' && (parseFloat(tempoDpStr) || 0) <= 0) ? 'disabled' : ''}`}
              disabled={(tendered < total && paymentMethod === 'TUNAI') || (paymentMethod === 'TEMPO' && tempoType === 'DP' && (parseFloat(tempoDpStr) || 0) <= 0)}
              onClick={async () => {
                const retailCustomer = customers.find(c => (c.name || '').trim().toLowerCase() === 'retail');
                const effectiveCustomer = selectedCustomer || retailCustomer;
                const saleId = 'INV-' + Date.now();

                const isTempo = paymentMethod === 'TEMPO';
                const dpNum = isTempo ? (tempoType === 'ZERO_DP' ? 0 : (parseFloat(tempoDpStr) || 0)) : (tendered || total);
                const effPaymentStatus = isTempo ? (dpNum >= total ? 'PAID' : (dpNum > 0 ? 'PARTIAL' : 'UNPAID')) : 'PAID';
                const effPaidAmount = isTempo ? dpNum : total;
                const effRemaining = isTempo ? Math.max(0, total - dpNum) : 0;

                // Catat orderan ke data pelanggan jika ada pelanggan terpilih atau pesanan retail
                if (effectiveCustomer) {
                  const order = {
                    orderId: saleId,
                    date: new Date().toISOString(),
                    total: total,
                    items: cart.map(item => ({
                      productId: item.id,
                      variantId: item.variantId,
                      variantName: item.variantName,
                      name: item.name,
                      qty: item.qty,
                      price: item.price,
                      subtotal: Math.round(item.price * item.qty),
                      originalPrice: item.originalPrice != null ? item.originalPrice : item.price,
                      isCustomPrice: Boolean(item.isCustomPrice),
                      customPriceNote: item.customPriceNote || (item.isCustomPrice ? 'Harga Khusus' : ''),
                      tierType: item.tierType,
                      tierUnit: item.tierUnit,
                      tierMultiplier: item.tierMultiplier || 1
                    }))
                  };
                  addOrderToCustomer(effectiveCustomer.id, order);
                }

                // Add to Global Sales
                const sale: SalesTransaction = {
                  id: saleId,
                  date: new Date().toISOString(),
                  total: total,
                  subtotal: subtotal,
                  tax: tax,
                  rounding: rounding,
                  paymentMethod: paymentMethod,
                  paymentStatus: effPaymentStatus,
                  paidAmount: effPaidAmount,
                  remainingAmount: effRemaining,
                  dueDate: isTempo ? tempoDueDate : undefined,
                  notes: isTempo ? tempoNotes : undefined,
                  tendered: isTempo ? dpNum : tendered,
                  change: isTempo ? 0 : change,
                  customerId: effectiveCustomer?.id || undefined,
                  customerName: effectiveCustomer?.name || (orderType === 'TAKEAWAY' ? 'Grosir' : 'Retail'),
                  employeeId: currentUser?.id,
                  employeeName: currentUser?.name,
                  items: cart.map(item => ({
                    productId: item.id,
                    variantId: item.variantId,
                    variantName: item.variantName,
                    name: item.name,
                    qty: item.qty,
                    price: item.price,
                    subtotal: Math.round(item.price * item.qty),
                    originalPrice: item.originalPrice != null ? item.originalPrice : item.price,
                    isCustomPrice: Boolean(item.isCustomPrice),
                    customPriceNote: item.customPriceNote || (item.isCustomPrice ? 'Harga Khusus' : ''),
                    tierType: item.tierType,
                    tierUnit: item.tierUnit,
                    tierMultiplier: item.tierMultiplier || 1
                  }))
                };
                await addSale(sale);

                // Web Push "Uang Masuk" ke semua device yang mengaktifkan notifikasi
                sendSaleNotification(sale, selectedCustomer?.name, currentUser?.name);

                // Tampilkan struk & buka dialog cetak
                setReceipt({
                  sale,
                  options: {
                    storeName: appName,
                    customerName: selectedCustomer?.name,
                    orderType,
                    taxEnabled,
                    taxRate,
                  },
                });

                // Broadcast payment completion to customer CFD screen
                emitCfdState({
                  paymentState: {
                    isOpen: false,
                    method: paymentMethod,
                    tendered: tendered,
                    change: change,
                    isCompleted: true,
                    completedAt: new Date().toISOString(),
                    receiptSaleId: sale.id,
                  }
                });

                setPaymentPopupOpen(false);
                setCartSheetOpen(false);
                setCart([]);
                setDeclinedWholesaleCartIds(new Set());
                setTenderedStr('');
                setSelectedCustomer(null);
                setOrderType('DINE_IN');
                setSearchQuery('');
              }}
              style={{ width: '100%', padding: '16px', fontSize: '18px' }}
            >
              <div className="flex items-center gap-2" style={{ justifyContent: 'center', width: '100%' }}>
                <Printer size={24} />
                {paymentMethod === 'TEMPO' ? 'PROSES TEMPO & CETAK STRUK' : 'BAYAR & CETAK STRUK'}
              </div>
            </button>
          </div>
        </div>
      )}
      
      {/* CUSTOMER SELECT POPUP */}
      {customerSelectPopupOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Pilih Pelanggan Grosir / Partai</h3>
              <button onClick={() => { setCustomerSelectPopupOpen(false); setOrderType('DINE_IN'); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#666" /></button>
            </div>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {customers.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>Belum ada data pelanggan.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customers.map(customer => (
                    <button 
                      key={customer.id} 
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSelectPopupOpen(false);
                      }}
                      style={{
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        background: 'white',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                      onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#111' }}>{customer.name}</div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{customer.phone} - {customer.address}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 'bold' }}>
                        {customer.orders.length} Order
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button type="button" onClick={() => { setCustomerSelectPopupOpen(false); setOrderType('DINE_IN'); }} style={{ flex: 1, padding: '12px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WEIGHT MODAL POPUP */}
      {weightPopupOpen && weightProduct && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', width: '340px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>Input Jumlah</h3>
              <button onClick={() => setWeightPopupOpen(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', backgroundColor: '#f9fafb', padding: '10px', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
              <img src={getProductImage(weightProduct.img)} onError={handleProductImageError} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111827', lineHeight: '1.2', marginBottom: '4px' }}>{weightProduct.name}</div>
                <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '13px' }}>{formatIDR(weightProduct.price)} <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 'normal' }}>/ {weightProduct.unit}</span></div>
              </div>
            </div>

            <form onSubmit={submitWeightPopup}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    autoFocus
                    required
                    value={weightInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      if (val.split('.').length <= 2) {
                        setWeightInput(val);
                      }
                    }}
                    placeholder="0"
                    style={{ width: '100%', padding: '12px 45px 12px 12px', fontSize: '22px', fontWeight: '800', textAlign: 'right', border: '2px solid #e5e7eb', borderRadius: '12px', outline: 'none', color: '#1f2937', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                  <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: '#9ca3af', fontSize: '14px' }}>{weightProduct.unit.toUpperCase()}</span>
                </div>
              </div>

              {/* TOUCHSCREEN NUMPAD FOR WEIGHT */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button key={num} type="button" onClick={() => setWeightInput(prev => prev.toString() + num)} style={{ padding: '10px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#f9fafb', color: '#374151', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.1s' }} onMouseDown={e => e.currentTarget.style.backgroundColor = '#e5e7eb'} onMouseUp={e => e.currentTarget.style.backgroundColor = '#f9fafb'}>
                    {num}
                  </button>
                ))}
                <button type="button" onClick={() => setWeightInput(prev => prev.toString().includes('.') ? prev : prev.toString() + '.')} style={{ padding: '10px', fontSize: '18px', fontWeight: 'bold', backgroundColor: '#f9fafb', color: '#374151', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer' }}>
                  .
                </button>
                <button type="button" onClick={() => setWeightInput(prev => prev.toString() + '0')} style={{ padding: '10px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#f9fafb', color: '#374151', border: '1px solid #f3f4f6', borderRadius: '8px', cursor: 'pointer' }}>
                  0
                </button>
                <button type="button" onClick={() => setWeightInput(prev => prev.toString().slice(0, -1))} style={{ padding: '10px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#fff1f2', color: '#e11d48', border: '1px solid #ffe4e6', borderRadius: '8px', cursor: 'pointer' }}>
                  ⌫
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Subtotal</span>
                <span style={{ fontSize: '18px', fontWeight: '900', color: '#111827' }}>
                  {formatIDR((Number(weightInput) || 0) * weightProduct.price)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '14px', boxShadow: '0 4px 6px -1px rgba(218, 41, 28, 0.2)' }}>
                  <Plus size={16} /> Tambah
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VARIANT PICKER POPUP */}
      {variantProduct && (
        <div className="modal-overlay" onClick={() => setVariantProduct(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', width: '420px', maxWidth: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>Pilih Varian</h3>
              <button onClick={() => setVariantProduct(null)} aria-label="Tutup" style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', backgroundColor: '#f9fafb', padding: '10px', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
              <img src={getProductImage(variantProduct.img)} onError={handleProductImageError} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111827', lineHeight: 1.2 }}>{variantProduct.name}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{variantProduct.variants.length} varian tersedia</div>
              </div>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {variantProduct.variants.map((v: any, vIdx: number) => {
                const out = v.availableStock <= 0;
                const inCart = cart.find(c => c.id === variantProduct.id && c.variantId === v.id)?.qty || 0;
                const vBarcode = v.barcode || (variantProduct.barcode ? `${variantProduct.barcode}-${vIdx + 1}` : '');
                return (
                  <button
                    key={v.id || vIdx}
                    type="button"
                    disabled={out}
                    onClick={() => handlePickVariant(v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: '12px', background: out ? '#f9fafb' : 'white', cursor: out ? 'not-allowed' : 'pointer', opacity: out ? 0.55 : 1, textAlign: 'left', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onMouseOver={(e) => { if (!out) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(218,41,28,0.12)'; } }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img
                        src={getProductImage(v.image || variantProduct.img)}
                        onError={handleProductImageError}
                        alt={v.name}
                        style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, border: '1px solid #e5e7eb' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{v.name}</span>
                          {vBarcode && (
                            <span style={{
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: '#f5f3ff',
                              color: '#6d28d9',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              border: '1px solid #ddd6fe',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <span>|||</span> {vBarcode}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '2px', fontWeight: 600, color: out ? '#991b1b' : '#166534' }}>
                          {out ? 'Stok habis' : `Stok: ${v.availableStock} ${variantProduct.unit}`}
                          {inCart > 0 && <span style={{ color: '#6b7280', fontWeight: 500 }}> • di keranjang: {inCart}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--primary)', whiteSpace: 'nowrap' }}>{formatIDR(v.price)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3-TIER PACKAGING SELECTION MODAL (DUS, RENCENG/LUSIN/SLOP, ECERAN) */}
      {tierModalProduct && (() => {
        const p = tierModalProduct.product;
        const q = tierModalProduct.customQty || 1;
        const boxCap = p.boxCapacity && p.boxCapacity > 0 ? p.boxCapacity : 1;
        const boxP = p.boxPrice && p.boxPrice > 0 ? p.boxPrice : (p.price * boxCap);
        const boxStock = Math.floor(p.availableStock / boxCap);

        const hasMid = Boolean(p.midPrice && p.midPrice > 0) || Boolean(p.midCapacity && p.midCapacity > 1);
        const midCap = p.midCapacity && p.midCapacity > 0 ? p.midCapacity : 1;
        const midP = p.midPrice && p.midPrice > 0 ? p.midPrice : (p.price * midCap);
        const midStock = Math.floor(p.availableStock / midCap);
        const midUnit = p.midUnitName || 'Renceng/Lusin';

        const retailP = p.price;
        const retailStock = p.availableStock;
        const retailUnit = p.unit || 'Pcs';

        return (
          <div className="modal-overlay" onClick={() => setTierModalProduct(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '24px', width: '640px', maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)', border: '1px solid #e2e8f0' }}>
              
              {/* Header Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                      PILIH LEVEL KEMASAN
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      (Kuantitas: {q}x)
                    </span>
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '6px 0 2px 0', color: '#0f172a' }}>
                    {p.name}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Stok Fisik Tersedia: <strong style={{ color: p.availableStock <= 0 ? '#dc2626' : '#16a34a' }}>{p.availableStock} {retailUnit}</strong></span>
                    <span>•</span>
                    <span>Setara <strong>{boxStock} Dus</strong></span>
                  </div>
                </div>
                <button 
                  onClick={() => setTierModalProduct(null)} 
                  aria-label="Tutup" 
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569', transition: 'all 0.15s ease' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* 3 Opsi Kartu Kemasan */}
              <div style={{ display: 'grid', gridTemplateColumns: hasMid ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '14px', margin: '8px 0 16px 0' }}>
                
                {/* 1. KEMASAN DUS / KARTON */}
                <div 
                  onClick={() => {
                    if (boxStock <= 0) {
                      sound.playScanError();
                      alert('Stok fisik tidak mencukupi untuk 1 Dus!');
                      return;
                    }
                    addTierToCart(p, 'BOX', q);
                    setTierModalProduct(null);
                  }}
                  style={{
                    border: '2px solid #fbbf24',
                    background: 'linear-gradient(180deg, #fffdf5 0%, #fffbeb 100%)',
                    borderRadius: '16px',
                    padding: '16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: boxStock > 0 ? 'pointer' : 'not-allowed',
                    opacity: boxStock > 0 ? 1 : 0.5,
                    position: 'relative',
                    transition: 'all 0.18s ease',
                    boxShadow: '0 4px 12px rgba(251, 191, 36, 0.12)'
                  }}
                  onMouseOver={(e) => { if (boxStock > 0) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800, width: 'fit-content', marginBottom: '8px' }}>
                    <Package size={12} />
                    DUS / KARTON
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Kemasan Dus
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Isi: <strong>{boxCap} {retailUnit}</strong>
                  </div>
                  
                  <div style={{ margin: '14px 0 12px 0' }}>
                    <div style={{ fontSize: '10.5px', color: '#92400e', fontWeight: 700 }}>Harga Jual / Dus:</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#b45309' }}>
                      {formatIDR(boxP)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#78350f', marginTop: '1px' }}>
                      @{formatIDR(Math.round(boxP / boxCap))}/{retailUnit}
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px dashed #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: boxStock > 0 ? '#16a34a' : '#dc2626' }}>
                      Tersedia: {boxStock} Dus
                    </span>
                  </div>

                  <button
                    type="button"
                    style={{
                      marginTop: '10px',
                      background: '#d97706',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Check size={14} /> Beli Dus
                  </button>
                </div>

                {/* 2. KEMASAN MENENGAH (RENCENG / LUSIN / SLOP) */}
                {hasMid && (
                  <div 
                    onClick={() => {
                      if (midStock <= 0) {
                        sound.playScanError();
                        alert(`Stok fisik tidak mencukupi untuk 1 ${midUnit}!`);
                        return;
                      }
                      addTierToCart(p, 'MID', q);
                      setTierModalProduct(null);
                    }}
                    style={{
                      border: '2px solid #38bdf8',
                      background: 'linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%)',
                      borderRadius: '16px',
                      padding: '16px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: midStock > 0 ? 'pointer' : 'not-allowed',
                      opacity: midStock > 0 ? 1 : 0.5,
                      position: 'relative',
                      transition: 'all 0.18s ease',
                      boxShadow: '0 4px 12px rgba(56, 189, 248, 0.12)'
                    }}
                    onMouseOver={(e) => { if (midStock > 0) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#bae6fd', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800, width: 'fit-content', marginBottom: '8px' }}>
                      <Layers size={12} />
                      {midUnit.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                      Kemasan Menengah
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Isi: <strong>{midCap} {retailUnit}</strong>
                    </div>

                    <div style={{ margin: '14px 0 12px 0' }}>
                      <div style={{ fontSize: '10.5px', color: '#0369a1', fontWeight: 700 }}>Harga Jual /{midUnit}:</div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#0284c7' }}>
                        {formatIDR(midP)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#075985', marginTop: '1px' }}>
                        @{formatIDR(Math.round(midP / midCap))}/{retailUnit}
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px dashed #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: midStock > 0 ? '#16a34a' : '#dc2626' }}>
                        Tersedia: {midStock} {midUnit}
                      </span>
                    </div>

                    <button
                      type="button"
                      style={{
                        marginTop: '10px',
                        background: '#0284c7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <Check size={14} /> Beli {midUnit}
                    </button>
                  </div>
                )}

                {/* 3. KEMASAN ECERAN / SATUAN */}
                <div 
                  onClick={() => {
                    if (retailStock <= 0) {
                      sound.playScanError();
                      alert('Stok fisik produk habis!');
                      return;
                    }
                    addTierToCart(p, 'RETAIL', q);
                    setTierModalProduct(null);
                  }}
                  style={{
                    border: '2px solid #cbd5e1',
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    borderRadius: '16px',
                    padding: '16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: retailStock > 0 ? 'pointer' : 'not-allowed',
                    opacity: retailStock > 0 ? 1 : 0.5,
                    position: 'relative',
                    transition: 'all 0.18s ease',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseOver={(e) => { if (retailStock > 0) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800, width: 'fit-content', marginBottom: '8px' }}>
                    <ShoppingBag size={12} />
                    ECERAN
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Satuan Ecer / Loose
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Isi: <strong>1 {retailUnit}</strong>
                  </div>

                  <div style={{ margin: '14px 0 12px 0' }}>
                    <div style={{ fontSize: '10.5px', color: '#475569', fontWeight: 700 }}>Harga Jual / Ecer:</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                      {formatIDR(retailP)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>
                      Satuan eceran biasa
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: retailStock > 0 ? '#16a34a' : '#dc2626' }}>
                      Tersedia: {retailStock} {retailUnit}
                    </span>
                  </div>

                  <button
                    type="button"
                    style={{
                      marginTop: '10px',
                      background: '#475569',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Check size={14} /> Beli Eceran
                  </button>
                </div>

              </div>

              {/* Barcode Info Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: '#64748b', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  💡 <em>Tips: Scan langsung barcode kemasan untuk input otomatis tanpa dialog ini.</em>
                </div>
                {p.boxBarcode && (
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#b45309' }}>
                    Dus: {p.boxBarcode}
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}
      {/* HOLD ORDERS LIST PANEL */}
      {holdListOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', zIndex: 9999, padding: '0' }}>
          <div className="r-drawer" style={{ backgroundColor: 'white', height: '100%', width: '420px', boxShadow: '-10px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
              <div>
                <h3 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 'bold' }}>🎫 Active Tickets (HOLD)</h3>
                <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '13px' }}>{heldOrders.length} pesanan sedang ditunda</p>
              </div>
              <button onClick={() => setHoldListOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {heldOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                  <PauseCircle size={48} style={{ marginBottom: '12px', opacity: 0.4 }} />
                  <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 4px' }}>Belum ada pesanan ditahan</p>
                  <p style={{ fontSize: '13px', margin: 0 }}>Klik tombol Hold [F5] untuk menunda pesanan</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {heldOrders.map((held) => (
                    <div
                      key={held.holdId}
                      style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                    >
                      {/* Hold card header */}
                      <div style={{ padding: '12px 16px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
                        <div>
                          <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#111' }}>Pesanan #{held.orderNumber}</span>
                          <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: held.orderType === 'TAKEAWAY' ? '#fef3c7' : '#dbeafe', color: held.orderType === 'TAKEAWAY' ? '#92400e' : '#1e40af', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold' }}>
                            {held.orderType === 'TAKEAWAY' ? 'GROSIR' : 'REGULER'}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>Ditahan pukul</div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151' }}>{formatTime(held.savedAt)}</div>
                        </div>
                      </div>

                      {/* Items preview */}
                      <div style={{ padding: '10px 16px' }}>
                        {held.selectedCustomer && (
                          <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '6px' }}>
                            👤 {held.selectedCustomer.name}
                          </div>
                        )}
                        {held.cart.slice(0, 3).map((item: any) => (
                          <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#374151', padding: '2px 0' }}>
                            <span>{item.name} <span style={{ color: '#9ca3af' }}>x{item.qty}</span></span>
                            <span style={{ fontWeight: 'bold' }}>{formatIDR(Math.round(item.price * item.qty))}</span>
                          </div>
                        ))}
                        {held.cart.length > 3 && (
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>+{held.cart.length - 3} item lainnya...</div>
                        )}
                        <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                          <span style={{ color: '#374151' }}>{held.cart.length} Item • Total</span>
                          <span style={{ color: 'var(--primary)' }}>{formatIDR(held.cart.reduce((s: number, i: any) => s + Math.round(i.price * i.qty), 0))}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleRestoreHold(held)}
                          style={{ flex: 1, padding: '8px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <ShoppingCart size={14} /> Lanjutkan Pesanan
                        </button>
                        <button
                          onClick={() => {
                            if(window.confirm('Hapus pesanan ini?')) {
                              // Release reservation for all items in this hold
                              held.cart.forEach((item: any) => {
                                releaseReservedStock(item.id, item.qty, item.variantId);
                              });
                              removeHeldOrder(held.holdId);
                            }
                          }}
                          style={{ padding: '8px 12px', backgroundColor: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb' }}>
              <button
                onClick={() => setHoldListOpen(false)}
                style={{ width: '100%', padding: '12px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL UBAH HARGA MANUAL / SPECIAL PRICE */}
      {customPriceModalOpen && editingCartItem && (
        <div 
          className="modal-overlay" 
          onClick={() => setCustomPriceModalOpen(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '420px', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Tag size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Ubah Harga Khusus (Manual)</h3>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b' }}>Atur harga satuan khusus untuk pelanggan</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setCustomPriceModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Product Info Summary */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>{editingCartItem.name}</div>
                {editingCartItem.variantName && (
                  <div style={{ fontSize: '11px', color: '#5b21b6', fontWeight: 700, marginTop: '2px' }}>
                    Varian: {editingCartItem.variantName}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                  <div>Harga Normal: <strong style={{ color: '#0f172a' }}>{formatIDR(editingCartItem.originalPrice || editingCartItem.price)}</strong></div>
                  {editingCartItem.wholesalePrice > 0 && (
                    <div>Harga Grosir: <strong style={{ color: '#0284c7' }}>{formatIDR(editingCartItem.wholesalePrice)}</strong></div>
                  )}
                </div>
              </div>

              {/* Opsi Penerapan jika Kuantitas > 1 */}
              {editingCartItem.qty > 1 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                    Terapkan Harga Khusus ke:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setCustomPriceApplyQty('all')}
                      style={{
                        padding: '8px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', textAlign: 'center',
                        border: customPriceApplyQty === 'all' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: customPriceApplyQty === 'all' ? '#eff6ff' : 'white',
                        color: customPriceApplyQty === 'all' ? '#1d4ed8' : '#475569',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Semua ({editingCartItem.qty} {editingCartItem.unit || 'Pcs'})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomPriceApplyQty('split')}
                      style={{
                        padding: '8px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', textAlign: 'center',
                        border: customPriceApplyQty === 'split' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: customPriceApplyQty === 'split' ? '#eff6ff' : 'white',
                        color: customPriceApplyQty === 'split' ? '#1d4ed8' : '#475569',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Hanya 1 {editingCartItem.unit || 'Pcs'} (Pisahkan)
                    </button>
                  </div>
                  {customPriceApplyQty === 'split' && (
                    <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '8px', background: '#e0f2fe', padding: '6px 10px', borderRadius: '6px', lineHeight: 1.4 }}>
                      💡 <strong>1 {editingCartItem.unit || 'Pcs'}</strong> diberi harga khusus, dan sisa <strong>{Math.round((editingCartItem.qty - 1) * 1000) / 1000} {editingCartItem.unit || 'Pcs'}</strong> otomatis dipisah menjadi baris tersendiri dengan harga normal.
                    </div>
                  )}
                </div>
              )}

              {/* Price Input */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Harga Khusus Baru (per {editingCartItem.unit || 'item'}):
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '12px', fontWeight: 800, color: '#64748b', fontSize: '14px' }}>Rp</span>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    autoFocus
                    value={customPriceInput ? Number(customPriceInput.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setCustomPriceInput(raw);
                    }}
                    placeholder="Contoh: 35000"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 40px',
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#0f172a',
                      border: '2px solid #cbd5e1',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveCustomPrice();
                    }}
                  />
                </div>
              </div>

              {/* Note / Reason Input */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Keterangan / Alasan (Dicetak di struk & laporan):
                </label>
                <input 
                  type="text" 
                  value={customPriceNoteInput}
                  onChange={(e) => setCustomPriceNoteInput(e.target.value)}
                  placeholder="Misal: Diskon Langganan, Harga Teman, Promo Khusus"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    outline: 'none'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCustomPrice();
                  }}
                />
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {editingCartItem.wholesalePrice > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPriceInput(String(editingCartItem.wholesalePrice));
                      setCustomPriceNoteInput('Pakai Harga Grosir');
                    }}
                    style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0369a1', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Gunakan Grosir ({formatIDR(editingCartItem.wholesalePrice)})
                  </button>
                )}
                {editingCartItem.originalPrice && (
                  <button
                    type="button"
                    onClick={() => {
                      const disc = Math.round(editingCartItem.originalPrice * 0.9);
                      setCustomPriceInput(String(disc));
                      setCustomPriceNoteInput('Diskon Khusus 10%');
                    }}
                    style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Diskon 10% ({formatIDR(Math.round(editingCartItem.originalPrice * 0.9))})
                  </button>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {editingCartItem.isCustomPrice ? (
                <button
                  type="button"
                  onClick={handleResetCustomPrice}
                  style={{ border: 'none', background: 'transparent', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: '6px 8px' }}
                >
                  Reset Harga Normal
                </button>
              ) : <div />}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setCustomPriceModalOpen(false)}
                  style={{ border: '1px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomPrice}
                  style={{ border: 'none', background: 'var(--primary)', color: 'white', borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check size={16} /> Terapkan Harga
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PERINGATAN / KONFIRMASI HARGA GROSIR */}
      {wholesalePrompt && (
        <div 
          className="modal-overlay"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: '16px'
          }}
        >
          <div 
            className="modal-content animate-in zoom-in-95 duration-200"
            style={{
              width: '100%', maxWidth: '440px', background: 'white',
              borderRadius: '20px', overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              padding: '20px', color: 'white', display: 'flex', alignItems: 'center', gap: '14px'
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Package size={24} color="#ffffff" />
              </div>
              <div>
                <span style={{
                  fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.05em', background: 'rgba(255, 255, 255, 0.25)',
                  padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '4px'
                }}>
                  Penawaran Grosir Otomatis
                </span>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, lineHeight: 1.2 }}>
                  Terapkan Harga Grosir?
                </h3>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {wholesalePrompt.name}
                </div>
                {wholesalePrompt.variantName && (
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                    Varian: {wholesalePrompt.variantName}
                  </div>
                )}
              </div>

              {/* Requirement Alert Notice */}
              <div style={{
                background: '#f0f9ff', border: '1px solid #bae6fd',
                borderRadius: '12px', padding: '12px 14px', marginBottom: '16px',
                display: 'flex', alignItems: 'flex-start', gap: '10px'
              }}>
                <CheckCircle2 size={18} color="#0284c7" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: '#0369a1', lineHeight: 1.4 }}>
                  Kasir menginput kuantitas <strong>{wholesalePrompt.qty} {wholesalePrompt.unit}</strong>.
                  Item ini memenuhi syarat grosir (minimum <strong>{wholesalePrompt.minWholesaleQty} {wholesalePrompt.unit}</strong>).
                </div>
              </div>

              {/* Price comparison card */}
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
                padding: '14px', marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>Harga Eceran Normal:</span>
                  <span style={{ color: '#64748b', textDecoration: 'line-through' }}>
                    {formatIDR(wholesalePrompt.normalPrice)} / {wholesalePrompt.unit}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '13.5px' }}>
                  <span style={{ fontWeight: 700, color: '#0284c7' }}>Harga Grosir:</span>
                  <span style={{ fontWeight: 800, fontSize: '16px', color: '#0284c7' }}>
                    {formatIDR(wholesalePrompt.wholesalePrice)} / {wholesalePrompt.unit}
                  </span>
                </div>
                <div style={{
                  borderTop: '1px dashed #cbd5e1', paddingTop: '10px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700 }}>
                    💡 Total Hemat Pelanggan:
                  </span>
                  <span style={{ fontSize: '13.5px', color: '#16a34a', fontWeight: 800 }}>
                    {formatIDR((wholesalePrompt.normalPrice - wholesalePrompt.wholesalePrice) * wholesalePrompt.qty)}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '13px', color: '#334155', fontWeight: 600, textAlign: 'center', marginBottom: '20px' }}>
                Apakah Anda ingin merubah harga item ini menjadi Harga Grosir?
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleDeclineWholesale}
                  style={{
                    padding: '12px', border: '1.5px solid #cbd5e1', borderRadius: '12px',
                    background: '#ffffff', color: '#64748b', fontWeight: 700,
                    fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  TIDAK, Tetap Eceran
                </button>
                <button
                  type="button"
                  onClick={handleAcceptWholesale}
                  style={{
                    padding: '12px', border: 'none', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: 'white', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)'
                  }}
                >
                  <Check size={16} /> YA, Ubah ke Grosir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA SCANNER MODAL */}
      {cameraScannerOpen && (
        <BarcodeScannerCamera 
          onScan={(decodedText) => {
            const raw = decodedText.trim();
            if (!raw) return null;

            let multiplier = 1;
            let code = raw;
            const match = raw.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/);
            if (match) {
              multiplier = Math.max(0.001, parseFloat(match[1]) || 1);
              code = match[2].trim();
            }

            const q = code.toLowerCase();
            const exactMatch = PRODUCTS.find(p => 
              (p.barcode && p.barcode.toLowerCase() === q) || 
              (p.sku && p.sku.toLowerCase() === q) || 
              p.id.toLowerCase() === q
            );

            if (exactMatch) {
              if (exactMatch.variants && exactMatch.variants.length > 0) {
                setPendingVariantQty(multiplier);
                setVariantProduct(exactMatch);
                sound.playScanSuccess();
                return `${exactMatch.name} (Pilih varian)`;
              }
              if (exactMatch.availableStock <= 0) {
                sound.playScanError();
                return null;
              }
              proceedAdd(exactMatch, multiplier);
              sound.playScanSuccess();
              return `${multiplier > 1 ? `${multiplier}x ` : ''}${exactMatch.name}`;
            } else {
              sound.playScanError();
              setTimeout(() => {
                setCameraScannerOpen(false);
                setQuickRegBarcode(code);
                setQuickRegQty(multiplier);
                setQuickRegModalOpen(true);
              }, 400);
              return null;
            }
          }} 
          onClose={() => setCameraScannerOpen(false)} 
        />
      )}

      {/* FLOATING CASHIER PRINTER NOTIFICATION BANNER */}
      {cashierPrinterNotice && (
        <div 
          style={{
            position: 'fixed',
            top: '64px',
            right: '24px',
            zIndex: 99999,
            maxWidth: '420px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            boxShadow: '0 12px 28px -4px rgba(0,0,0,0.18), 0 6px 12px -4px rgba(0,0,0,0.12)',
            backgroundColor: cashierPrinterNotice.type === 'error' ? '#fef2f2' : (cashierPrinterNotice.type === 'success' ? '#f0fdf4' : '#fffbeb'),
            border: `1.5px solid ${cashierPrinterNotice.type === 'error' ? '#fca5a5' : (cashierPrinterNotice.type === 'success' ? '#86efac' : '#fde68a')}`,
            color: cashierPrinterNotice.type === 'error' ? '#991b1b' : (cashierPrinterNotice.type === 'success' ? '#166534' : '#92400e')
          }}
        >
          {cashierPrinterNotice.type === 'error' ? (
            <AlertCircle size={22} className="text-red-600 flex-shrink-0 mt-0.5 animate-pulse" />
          ) : (
            <CheckCircle2 size={22} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          )}
          <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.45 }}>
            <div style={{ fontWeight: 'bold', fontSize: '13.5px', marginBottom: '2px' }}>
              {cashierPrinterNotice.type === 'error' ? '⚠️ Pemberitahuan Kasir: Printer Terputus' : '✅ Pemberitahuan Kasir: Printer Terhubung'}
            </div>
            <div>{cashierPrinterNotice.message}</div>
            {cashierPrinterNotice.type === 'error' && (
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    reconnectSavedDevice(false);
                  }}
                  style={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '4px 12px',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={12} /> Sambungkan Sekarang
                </button>
                <Link
                  to="/backoffice/printer-settings"
                  onClick={() => setCashierPrinterNotice(null)}
                  style={{
                    fontSize: '12px',
                    color: '#4b5563',
                    textDecoration: 'underline',
                    fontWeight: 600
                  }}
                >
                  Buka Pengaturan
                </Link>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setCashierPrinterNotice(null);
              clearDisconnectAlert();
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
            aria-label="Tutup notifikasi"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* FORMULIR TAMBAH STOK LENGKAP SAAT SCAN TIDAK DITEMUKAN (SESUAI BACKOFFICE) */}
      <UnregisteredProductModal
        isOpen={quickRegModalOpen}
        initialBarcode={quickRegBarcode}
        initialQty={quickRegQty}
        appName={appName}
        onClose={() => setQuickRegModalOpen(false)}
        onSuccess={handleSuccessQuickRegister}
      />

      {/* MODAL PENGHUBUNG LAYAR PELANGGAN (CFD) */}
      <CfdLauncherModal
        isOpen={cfdModalOpen}
        onClose={() => setCfdModalOpen(false)}
      />

      {/* MODAL PICKER CETAK LABEL BARCODE (POINT 8) */}
      {labelPickerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setLabelPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag size={20} color="var(--primary, #dc2626)" /> Cetak Label & Barcode Produk
                </h3>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  Pilih produk satuan atau cetak masal keseluruhan katalog
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLabelPickerOpen(false);
                  setSelectedLabelProductIds([]);
                }}
                style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} color="#6b7280" />
              </button>
            </div>

            {/* Filter Kategori & Pencarian */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#9ca3af' }} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Cari produk / barcode / SKU..."
                  value={labelPickerSearch}
                  onChange={(e) => setLabelPickerSearch(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <select
                value={labelPickerCategory}
                onChange={(e) => setLabelPickerCategory(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', background: 'white' }}
              >
                <option value="ALL">Semua Kategori ({PRODUCTS.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c} ({PRODUCTS.filter(p => (p.type || '').toLowerCase() === c.toLowerCase()).length})
                  </option>
                ))}
              </select>
            </div>

            {/* Panel Aksi Cetak Masal / Keseluruhan */}
            {(() => {
              const filteredProds = PRODUCTS.filter((p) => {
                const catMatch = labelPickerCategory === 'ALL' || (p.type || '').toLowerCase() === labelPickerCategory.toLowerCase();
                if (!labelPickerSearch.trim()) return catMatch;
                const q = labelPickerSearch.toLowerCase();
                return catMatch && (p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q)) || p.sku.toLowerCase().includes(q));
              });

              const allFilteredSelected = filteredProds.length > 0 && filteredProds.every(p => selectedLabelProductIds.includes(p.id));
              const selectedCount = selectedLabelProductIds.length;

              return (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fafc',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      marginBottom: '12px',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLabelProductIds(Array.from(new Set([...selectedLabelProductIds, ...filteredProds.map(p => p.id)])));
                          } else {
                            const uncheckIds = new Set(filteredProds.map(p => p.id));
                            setSelectedLabelProductIds(selectedLabelProductIds.filter(id => !uncheckIds.has(id)));
                          }
                        }}
                      />
                      <span>Pilih Semua ({filteredProds.length})</span>
                    </label>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {selectedCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const picked = PRODUCTS.filter(p => selectedLabelProductIds.includes(p.id)).map(p => ({
                              id: p.id,
                              name: p.name,
                              barcode: p.barcode,
                              sku: p.sku,
                              sellingPrice: p.price,
                              unit: p.unit,
                              stock: p.availableStock,
                            }));
                            setLabelPickerOpen(false);
                            setLabelModalProducts(picked);
                          }}
                          style={{
                            padding: '7px 12px',
                            borderRadius: '8px',
                            background: '#2563eb',
                            color: 'white',
                            border: 'none',
                            fontWeight: 800,
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                          }}
                        >
                          <Printer size={13} /> Cetak ({selectedCount}) Terpilih
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          const bulkList = filteredProds.map(p => ({
                            id: p.id,
                            name: p.name,
                            barcode: p.barcode,
                            sku: p.sku,
                            sellingPrice: p.price,
                            unit: p.unit,
                            stock: p.availableStock,
                          }));
                          setLabelPickerOpen(false);
                          setLabelModalProducts(bulkList);
                        }}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: 'var(--primary, #dc2626)',
                          color: 'white',
                          border: 'none',
                          fontWeight: 800,
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(220,38,38,0.25)',
                        }}
                      >
                        <Layers size={14} /> Cetak Keseluruhan Barcode ({filteredProds.length})
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                    {filteredProds.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', fontSize: '13px' }}>
                        Tidak ada produk yang cocok dengan pencarian / filter kategori.
                      </div>
                    ) : (
                      filteredProds.map((p) => {
                        const isSelected = selectedLabelProductIds.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedLabelProductIds(prev =>
                                isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id]
                              );
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderRadius: '10px',
                              border: `1.5px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                              background: isSelected ? '#f0f7ff' : '#fcfcfd',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, paddingRight: '8px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setSelectedLabelProductIds(prev =>
                                    isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                  );
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {p.name}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#6b7280', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <span>Barcode: <code style={{ fontFamily: 'monospace' }}>{p.barcode || p.sku || p.id}</code></span>
                                  <span>•</span>
                                  <span style={{ fontWeight: 700, color: '#059669' }}>Rp {p.price.toLocaleString('id-ID')}</span>
                                  <span>•</span>
                                  <span style={{ color: '#64748b' }}>Stok: {p.availableStock} {p.unit}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLabelPickerOpen(false);
                                setLabelModalProduct({
                                  id: p.id,
                                  name: p.name,
                                  barcode: p.barcode,
                                  sku: p.sku,
                                  sellingPrice: p.price,
                                  unit: p.unit,
                                  stock: p.availableStock,
                                });
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                background: '#eff6ff',
                                color: '#1e40af',
                                border: '1px solid #bfdbfe',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Tag size={13} /> Cetak Stiker
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL CETAK LABEL STIKER BLUETOOTH / BROWSER (SINGLE & BULK) */}
      {(labelModalProduct || labelModalProducts) && (
        <BarcodeLabelModal
          product={labelModalProduct}
          products={labelModalProducts || undefined}
          onClose={() => {
            setLabelModalProduct(null);
            setLabelModalProducts(null);
          }}
        />
      )}

      {/* FLOATING TOAST NOTIFICATION KASIR (POINT 2, 7) */}
      {toastNotice && (
        <div 
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            backgroundColor: toastNotice.type === 'success' ? '#065f46' : '#991b1b',
            color: '#ffffff',
            padding: '10px 22px',
            borderRadius: '999px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 700,
            fontSize: '13.5px',
            pointerEvents: 'none',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {toastNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toastNotice.message}</span>
        </div>
      )}

    </div>
  );
}

export default App;
