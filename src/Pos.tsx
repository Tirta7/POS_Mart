import { useState, useEffect, useRef } from 'react';
import { 
  Search, Printer, ShoppingBag, Truck, Package, ShoppingCart,
  CreditCard, QrCode, Banknote, Ticket, Trash2, PauseCircle,
  LayoutGrid, Plus, Minus, X, LogOut, Camera, ChevronUp, Settings2
} from 'lucide-react';
import './index.css';
import { useNavigate, Link } from 'react-router-dom';

import { useSettingsStore } from './store/useSettingsStore';
import { useInventoryStore } from './store/useInventoryStore';
import { useCustomerStore } from './store/useCustomerStore';
import { useHoldStore } from './store/useHoldStore';
import { useSalesStore } from './store/useSalesStore';
import { useAuthStore } from './store/useAuthStore';
import BarcodeScannerCamera from './components/BarcodeScannerCamera';
import { recordStockMutation } from './utils/stockMutation';
import { sendSaleNotification } from './utils/pushNotification';
import ReceiptModal from './components/ReceiptModal';
import type { SalesTransaction } from './types';
import type { ReceiptOptions } from './utils/receipt';

function App() {
  const { appName, appLogo, taxEnabled, taxRate, roundingUnit } = useSettingsStore();
  const { products: storeProducts, updateProductStock, categories, reserveStock, releaseReservedStock } = useInventoryStore();
  const { addSale, sales } = useSalesStore();
  const todayTxCount = sales.filter(s => new Date(s.date).toDateString() === new Date().toDateString()).length;
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };


  
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
  
  // Weight Popup State
  const [weightPopupOpen, setWeightPopupOpen] = useState(false);
  const [weightProduct, setWeightProduct] = useState<any>(null);
  const [weightInput, setWeightInput] = useState<number | string>('');

  // Payment Popup State
  const [paymentPopupOpen, setPaymentPopupOpen] = useState(false);

  // Struk yang baru dicetak (pratinjau + cetak ulang)
  const [receipt, setReceipt] = useState<{ sale: SalesTransaction; options: ReceiptOptions } | null>(null);

  // Camera Scanner State
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Mobile: keranjang tampil sebagai bottom sheet (gaya iOS)
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  // Perangkat sentuh (HP/tablet): jangan auto-focus search agar keyboard tidak langsung muncul
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  // Tutup sheet otomatis jika keranjang kosong (setelah bayar / hold / hapus semua)
  useEffect(() => {
    if (cart.length === 0) setCartSheetOpen(false);
  }, [cart.length]);

  const CATEGORIES = [
    { id: 'all', name: cart.length > 0 ? 'PESANAN' : 'SEMUA (ALL)', icon: <LayoutGrid size={16} /> },
    ...categories.map(cat => ({
      id: cat.toLowerCase(),
      name: cat.toUpperCase(),
      icon: <Package size={16} />
    }))
  ];

  // Automatically update prices in the cart if the order type changes
  // Available stock = physical stock - reserved
  const PRODUCTS = storeProducts.map((p, i) => {
    const availableStock = p.stock - (p.reserved || 0);
    const minStock = p.minStock ?? 10;
    const isLowStock = availableStock <= minStock;
    
    return {
      id: p.id,
      sku: p.sku || '',
      barcode: p.barcode || p.sku || '',
      name: p.name,
      price: orderType === 'TAKEAWAY' && p.wholesalePrice ? p.wholesalePrice : p.sellingPrice,
      type: p.category,
      unit: p.unit || 'Pcs',
      badge: (i + 1).toString().padStart(2, '0'),
      img: p.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80',
      tag: isLowStock ? 'STOK TIPIS' : (i === 0 ? 'BESTSELLER' : ''),
      tagColor: isLowStock ? 'promo' : '',
      availableStock: availableStock,  // actual available stock
      rawStock: p.stock,
    };
  });

  // Automatically update prices in the cart if the order type changes
  useEffect(() => {
    setCart(prev => prev.map(item => {
      const storeItem = storeProducts.find(p => p.id === item.id);
      if (storeItem) {
        const newPrice = orderType === 'TAKEAWAY' && storeItem.wholesalePrice ? storeItem.wholesalePrice : storeItem.sellingPrice;
        return { ...item, price: newPrice };
      }
      return item;
    }));
  }, [orderType, storeProducts]);

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = taxEnabled ? Math.round(subtotal * (taxRate / 100)) : 0;
  const totalBeforeRounding = subtotal + tax;
  const total = roundingUnit > 0 ? Math.ceil(totalBeforeRounding / roundingUnit) * roundingUnit : totalBeforeRounding;
  const rounding = total - totalBeforeRounding;
  const tendered = parseInt(tenderedStr || '0', 10);
  const change = tendered - total;

  const formatIDR = (num: number) => {
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  const handleNumpad = (val: string) => {
    if (val === 'C') {
      setTenderedStr('');
    } else {
      setTenderedStr(prev => prev === '0' ? val : prev + val);
    }
  };

  const updateQty = (cartId: string, delta: number) => {
    setCart(prev => {
      let limitReached = false;
      const nextCart = prev.map(item => {
        if (item.cartId === cartId) {
          const newQty = Math.max(0.01, item.qty + delta);
          if (newQty > item.availableStock) {
            limitReached = true;
            return item;
          }
          return { ...item, qty: newQty };
        }
        return item;
      });
      if (limitReached) {
        alert('Stok tidak mencukupi!');
      }
      return nextCart;
    });
  };

  const setQtyValue = (cartId: string, value: number) => {
    setCart(prev => {
      let limitReached = false;
      const nextCart = prev.map(item => {
        if (item.cartId === cartId) {
          if (value > item.availableStock) {
            limitReached = true;
            return item;
          }
          return { ...item, qty: Math.max(0, value) };
        }
        return item;
      });
      if (limitReached) {
        alert(`Stok hanya tersedia ${prev.find(i => i.cartId === cartId)?.availableStock} ${prev.find(i => i.cartId === cartId)?.unit}`);
      }
      return nextCart;
    });
  };

  const removeRow = (cartId: string) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim().toLowerCase();
      if (!q) return;

      // Cari exact match untuk barcode, SKU, atau ID
      const exactMatch = PRODUCTS.find(p => 
        p.barcode?.toLowerCase() === q || 
        p.sku.toLowerCase() === q || 
        p.id.toLowerCase() === q
      );

      if (exactMatch) {
        // Jika cocok persis (scanner barcode), langsung tambahkan ke keranjang
        handleProductClick(exactMatch);
        setSearchQuery(''); // Kosongkan search bar
      }
    }
  };

  const addToCart = (product: any, customQty?: number) => {
    const qtyToAdd = customQty !== undefined ? customQty : 1;
    
    setCart(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) {
        if (exists.qty + qtyToAdd > product.availableStock) {
          alert(`Stok tidak mencukupi! Hanya tersedia ${product.availableStock} ${product.unit}`);
          return prev;
        }
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + qtyToAdd } : i);
      }
      
      if (qtyToAdd > product.availableStock) {
        alert(`Stok tidak mencukupi! Hanya tersedia ${product.availableStock} ${product.unit}`);
        return prev;
      }
      return [...prev, { ...product, cartId: Date.now().toString(), qty: qtyToAdd }];
    });
  };

  const handleProductClick = (product: any) => {
    const u = (product.unit || '').toLowerCase();
    if (u === 'kg' || u === 'gram' || u === 'liter') {
      setWeightProduct(product);
      setWeightInput('');
      setWeightPopupOpen(true);
    } else {
      addToCart(product);
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
      reserveStock(item.id, item.qty);
    });
    // Clear current order
    setCart([]);
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
      releaseReservedStock(item.id, item.qty);
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
          <div className="pill" style={{borderLeft: '1px solid #d1d5db', borderRadius: 0}}>Shift A (Pagi)</div>
          <div className="pill" style={{borderLeft: '1px solid #d1d5db', borderRadius: 0}}>Okt 24, 12:42 PM</div>
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
              setSelectedCustomer(null);
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
              setSelectedCustomer(null);
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
              const q = val.trim().toLowerCase();
              if (q) {
                const exactMatch = PRODUCTS.find(p => 
                  p.barcode?.toLowerCase() === q || 
                  p.sku.toLowerCase() === q || 
                  p.id.toLowerCase() === q
                );
                if (exactMatch) {
                  handleProductClick(exactMatch);
                  setTimeout(() => setSearchQuery(''), 0); // Clear immediately
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
            className="camera-scan-btn"
            onClick={() => setCameraScannerOpen(true)}
            aria-label="Kamera Scan"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}
          >
            <Camera size={16} /> <span className="hide-mobile">Kamera Scan</span>
          </button>
        </div>

        <div className="status-indicators">
          <div className="flex items-center gap-2" style={{background: '#fef3c7', padding: '0.4rem 0.75rem', borderRadius: '6px', color: '#b45309'}}>
            <Ticket size={16} /> Total Transaksi: <strong>{todayTxCount} Nota</strong>
          </div>
          <div className="flex items-center gap-2" style={{background: '#dcfce7', padding: '0.4rem 0.75rem', borderRadius: '6px', color: '#166534'}}>
            <span className="pill-dot"></span> Printer Kasir: Terhubung
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        
        {/* LEFT PANEL */}
        <div className="left-panel">
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

          <div className="product-grid">
            {PRODUCTS.filter(p => {
              const catMatch = activeCat === 'all' || p.type.toLowerCase() === activeCat.toLowerCase();
              const isSearching = searchQuery.trim().length > 0;
              
              // Jika user sedang mencari, abaikan filter keranjang dan langsung cocokan teks
              if (isSearching) {
                const q = searchQuery.toLowerCase();
                const textMatch = p.name.toLowerCase().includes(q) || 
                                  p.sku.toLowerCase().includes(q) || 
                                  (p.barcode && p.barcode.toLowerCase().includes(q)) ||
                                  p.id.toLowerCase().includes(q);
                return catMatch && textMatch;
              }
              
              // Jika TIDAK mencari dan di tab ALL, tampilkan HANYA yang ada di keranjang (jika keranjang ada isinya)
              if (activeCat === 'all' && cart.length > 0) {
                return cart.some((cartItem: any) => cartItem.id === p.id);
              }

              return catMatch;
            }).map(product => (
              <div key={product.id} className="product-card" onClick={() => handleProductClick(product)}>
                <img src={product.img} alt={product.name} className="product-img" />
                {product.badge && <div className="product-num">#{product.badge}</div>}
                {product.tag && (
                  <div className={`product-badge ${product.tagColor === 'promo' ? 'promo' : ''}`}>
                    {product.tag}
                  </div>
                )}
                <div className="product-info">
                  <div className="product-title">{product.name}</div>
                  <div className="product-tags">
                    {product.type && <span className="tag">{product.type}</span>}
                    <span className="tag" style={{ backgroundColor: product.availableStock <= 0 ? '#fee2e2' : '#dcfce7', color: product.availableStock <= 0 ? '#991b1b' : '#166534', fontWeight: 'bold' }}>
                      Stok: {product.availableStock} {product.unit}
                    </span>
                  </div>
                  <div className="product-bottom">
                    <span className="product-category">{product.type}</span>
                    <span className="product-price">{formatIDR(product.price)}<span style={{fontSize: '10px', color: '#999', fontWeight: 'normal'}}>/{product.unit}</span></span>
                  </div>
                </div>
              </div>
            ))}
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
                  {cart.length} Item • 12:48 WIB • Kasir: Sari
                  {selectedCustomer && <span style={{ color: 'var(--primary)', fontWeight: 'bold', marginLeft: '8px' }}>• Plg: {selectedCustomer.name}</span>}
                </div>
              </div>
            </div>
            <div className="order-actions">
              <button className="icon-btn" onClick={() => setCart([])}><Trash2 size={16} /></button>
              <button className="hold-btn" onClick={handleHold} disabled={cart.length === 0} style={{ opacity: cart.length === 0 ? 0.5 : 1 }}><PauseCircle size={16} /> Hold [F5]</button>
            </div>
          </div>

          <div className="cart-list">
            {cart.map(item => (
              <div key={item.cartId} className="cart-item">
                <div className="item-details">
                  <div className="item-title">{item.name}</div>
                  {item.note && <div className="item-note">{item.note}</div>}
                </div>
                <div className="item-price">{formatIDR(item.price * item.qty)}</div>
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
                  <span style={{ fontSize: '11px', color: '#888', width: '28px', textAlign: 'left', marginLeft: '4px' }}>
                    {item.unit}
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

            <div className="payment-methods">
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
          <div className="modal-content pay-modal" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Pembayaran</h3>
              <button onClick={() => setPaymentPopupOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={28} color="#666" /></button>
            </div>

            <div style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '12px', marginBottom: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>TOTAL TAGIHAN</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--primary)' }}>{formatIDR(total)}</div>
            </div>

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

            <button 
              className={`checkout-btn ${tendered < total && paymentMethod === 'TUNAI' ? 'disabled' : ''}`}
              disabled={tendered < total && paymentMethod === 'TUNAI'}
              onClick={() => {
                // Here we process the payment and record the order if a customer is selected
                if (selectedCustomer && orderType === 'TAKEAWAY') {
                  const order = {
                    orderId: 'ORD-' + Date.now(),
                    date: new Date().toISOString(),
                    total: total,
                    items: cart.map(item => ({
                      productId: item.id,
                      name: item.name,
                      qty: item.qty,
                      price: item.price,
                      subtotal: item.price * item.qty
                    }))
                  };
                  addOrderToCustomer(selectedCustomer.id, order);
                }

                // Add to Global Sales
                const sale = {
                  id: 'INV-' + Date.now(),
                  date: new Date().toISOString(),
                  total: total,
                  subtotal: subtotal,
                  tax: tax,
                  rounding: rounding,
                  paymentMethod: paymentMethod,
                  tendered: tendered,
                  change: change,
                  customerId: selectedCustomer?.id,
                  employeeId: currentUser?.id,
                  employeeName: currentUser?.name,
                  items: cart.map(item => ({
                    productId: item.id,
                    name: item.name,
                    qty: item.qty,
                    price: item.price,
                    subtotal: item.price * item.qty
                  }))
                };
                addSale(sale);

                // Web Push "Uang Masuk" ke semua device yang mengaktifkan notifikasi
                sendSaleNotification(sale, selectedCustomer?.name, currentUser?.name);

                // Note: Stock deduction and mutation recording is now handled ATOMICALLY 
                // in a single database transaction inside POST /api/saas/transactions!
                // Ini mencegah terjadinya race condition.

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

                setPaymentPopupOpen(false);
                setCartSheetOpen(false);
                setCart([]);
                setTenderedStr('');
                setSelectedCustomer(null);
                setOrderType('DINE_IN');
                setSearchQuery('');
              }}
              style={{ width: '100%', padding: '16px', fontSize: '18px' }}
            >
              <div className="flex items-center gap-2" style={{ justifyContent: 'center', width: '100%' }}>
                <Printer size={24} />
                BAYAR & CETAK STRUK
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
              <img src={weightProduct.img} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} />
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
                            <span style={{ fontWeight: 'bold' }}>{formatIDR(item.price * item.qty)}</span>
                          </div>
                        ))}
                        {held.cart.length > 3 && (
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>+{held.cart.length - 3} item lainnya...</div>
                        )}
                        <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                          <span style={{ color: '#374151' }}>{held.cart.length} Item • Total</span>
                          <span style={{ color: 'var(--primary)' }}>{formatIDR(held.cart.reduce((s: number, i: any) => s + i.price * i.qty, 0))}</span>
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
                                releaseReservedStock(item.id, item.qty);
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
      {/* CAMERA SCANNER MODAL */}
      {cameraScannerOpen && (
        <BarcodeScannerCamera 
          onScan={(decodedText) => {
            // Logika pencarian produk
            const exactMatch = PRODUCTS.find(p => 
              p.barcode?.toLowerCase() === decodedText.toLowerCase() || 
              p.sku.toLowerCase() === decodedText.toLowerCase() || 
              p.id.toLowerCase() === decodedText.toLowerCase()
            );
            if (exactMatch) {
              // Tambah ke keranjang, tapi JANGAN tutup kamera agar bisa scan berikutnya
              handleProductClick(exactMatch);
              return exactMatch.name; // Kembalikan nama produk untuk ditampilkan sebagai feedback
            } else {
              // Produk tidak ditemukan — kembalikan null agar scanner tampilkan pesan "tidak ditemukan"
              return null;
            }
          }} 
          onClose={() => setCameraScannerOpen(false)} 
        />
      )}

    </div>
  );
}

export default App;
