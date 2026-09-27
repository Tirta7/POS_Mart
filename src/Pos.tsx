import { useState, useEffect, useRef } from 'react';
import { 
  Search, Printer, ShoppingBag, Truck, Package, Utensils, ShoppingCart,
  CreditCard, QrCode, Banknote, Ticket, Trash2, PauseCircle,
  LayoutGrid, Star, Coffee, Plus, Minus, X
} from 'lucide-react';
import './index.css';

// MOCK DATA for GROCERY / SEMBAKO (adapted to fit the layout style)
const CATEGORIES = [
  { id: 'all', name: 'SEMUA (ALL)', icon: <LayoutGrid size={16} /> },
  { id: 'promo', name: 'PAKET HEMAT', icon: <Star size={16} /> },
  { id: 'sembako', name: 'SEMBAKO', icon: <Package size={16} /> },
  { id: 'rokok', name: 'ROKOK', icon: <Utensils size={16} /> },
  { id: 'minuman', name: 'MINUMAN', icon: <Coffee size={16} /> }
];

import { useSettingsStore } from './store/useSettingsStore';
import { useInventoryStore } from './store/useInventoryStore';
import { useCustomerStore } from './store/useCustomerStore';

function App() {
  const { appName } = useSettingsStore();
  const { products: storeProducts, updateProductStock } = useInventoryStore();
  
  const [activeCat, setActiveCat] = useState('all');
  const [orderType, setOrderType] = useState('DINE_IN');
  const [cart, setCart] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSelectPopupOpen, setCustomerSelectPopupOpen] = useState(false);
  const { customers, addOrderToCustomer } = useCustomerStore();
  const [paymentMethod, setPaymentMethod] = useState('TUNAI');
  const [tenderedStr, setTenderedStr] = useState('');
  
  // Weight Popup State
  const [weightPopupOpen, setWeightPopupOpen] = useState(false);
  const [weightProduct, setWeightProduct] = useState<any>(null);
  const [weightInput, setWeightInput] = useState<number | string>('');

  // Payment Popup State
  const [paymentPopupOpen, setPaymentPopupOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Map inventory store products to POS UI format
  const PRODUCTS = storeProducts.map((p, i) => ({
    id: p.id,
    name: p.name,
    price: orderType === 'TAKEAWAY' && p.wholesalePrice ? p.wholesalePrice : p.sellingPrice,
    type: p.category,
    unit: p.unit || 'Pcs',
    badge: (i + 1).toString().padStart(2, '0'),
    img: p.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80',
    tag: p.stock < 10 ? 'STOK TIPIS' : (i === 0 ? 'BESTSELLER' : ''),
    tagColor: p.stock < 10 ? 'promo' : ''
  }));

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
  const tax = subtotal * 0.11;
  const total = subtotal + tax;
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
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newQty = Math.max(0.01, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const setQtyValue = (cartId: string, value: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        return { ...item, qty: Math.max(0, value) };
      }
      return item;
    }));
  };

  const removeRow = (cartId: string) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const addToCart = (product: any, customQty?: number) => {
    const qtyToAdd = customQty !== undefined ? customQty : 1;
    
    setCart(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + qtyToAdd } : i);
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

  const submitWeightPopup = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(weightInput);
    if (qty > 0 && weightProduct) {
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
          <div className="logo-icon">{appName.charAt(0)}</div>
          <div>
            <div style={{fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.5px'}}>{appName}</div>
            <div className="text-xs text-muted">Terminal #01 • Counter Utama</div>
          </div>
        </div>

        <div className="status-pills">
          <div className="pill"><span className="pill-dot"></span> SERVER ONLINE</div>
          <div className="pill" style={{borderLeft: '1px solid #d1d5db', borderRadius: 0}}>Shift A (Pagi)</div>
          <div className="pill" style={{borderLeft: '1px solid #d1d5db', borderRadius: 0}}>Okt 24, 12:42 PM</div>
        </div>

        <div className="nav-links">
          <button className="nav-btn active">Register</button>
          <button className="nav-btn">Active Tickets</button>
          <button className="nav-btn">Shift & Drawer</button>
        </div>

        <div className="user-profile">
          <div>
            <div className="font-bold text-sm">Kasir Sari M.</div>
            <div className="text-xs text-muted">ID: #88219</div>
          </div>
          <img src="https://i.pravatar.cc/100?img=5" alt="Avatar" className="avatar" />
        </div>
      </div>

      {/* SUB NAVBAR */}
      <div className="sub-navbar">
        <div className="order-types">
          <button 
            className={`type-btn ${orderType === 'DINE_IN' ? 'active' : ''}`}
            onClick={() => setOrderType('DINE_IN')}
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
            onClick={() => setOrderType('DRIVETHRU')}
          >
            <Truck size={16} /> DELIVERY
          </button>
        </div>

        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            className="search-input" 
            placeholder="Cari menu, SKU atau scan barcode... [F2]"
            ref={searchRef}
          />
          <span className="search-shortcut">F2</span>
        </div>

        <div className="status-indicators">
          <div className="flex items-center gap-2" style={{background: '#fef3c7', padding: '0.4rem 0.75rem', borderRadius: '6px', color: '#b45309'}}>
            <Ticket size={16} /> Sesi Siang: <strong>148 Tiket</strong>
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
            {PRODUCTS.filter(p => activeCat === 'all' || p.type.toLowerCase() === activeCat.toLowerCase()).map(product => (
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

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <div className="order-header">
            <div className="flex items-center">
              <div className="order-number">52</div>
              <div className="order-info">
                <h2>Pesanan #052 <span className="order-type-badge">{orderType === 'TAKEAWAY' ? 'GROSIR / PARTAI' : 'REGULER'}</span></h2>
                <div className="order-meta">
                  {cart.length} Item • 12:48 WIB • Kasir: Sari
                  {selectedCustomer && <span style={{ color: 'var(--primary)', fontWeight: 'bold', marginLeft: '8px' }}>• Plg: {selectedCustomer.name}</span>}
                </div>
              </div>
            </div>
            <div className="order-actions">
              <button className="icon-btn" onClick={() => setCart([])}><Trash2 size={16} /></button>
              <button className="hold-btn"><PauseCircle size={16} /> Hold [F5]</button>
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
            <div className="totals-row">
              <span>PPN (11%) ⓘ</span>
              <span>{formatIDR(tax)}</span>
            </div>
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

      {/* PAYMENT MODAL POPUP */}
      {paymentPopupOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
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

                // Deduct stock for all items
                cart.forEach(item => {
                  updateProductStock(item.id, -item.qty);
                });

                setPaymentPopupOpen(false);
                setCart([]);
                setTenderedStr('');
                setSelectedCustomer(null);
                setOrderType('DINE_IN');
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
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Input Jumlah Pembelian</h3>
              <button onClick={() => setWeightPopupOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#666" /></button>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
              <img src={weightProduct.img} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' }} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>{weightProduct.name}</div>
                <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{formatIDR(weightProduct.price)} <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>/ {weightProduct.unit}</span></div>
              </div>
            </div>

            <form onSubmit={submitWeightPopup}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>
                  JUMLAH ({weightProduct.unit.toUpperCase()})
                </label>
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
                  style={{ width: '100%', padding: '12px', fontSize: '24px', fontWeight: 'bold', textAlign: 'center', border: '2px solid #e5e7eb', borderRadius: '8px', outline: 'none' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              {/* TOUCHSCREEN NUMPAD FOR WEIGHT */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button key={num} type="button" onClick={() => setWeightInput(prev => prev.toString() + num)} style={{ padding: '12px', fontSize: '18px', fontWeight: 'bold', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                    {num}
                  </button>
                ))}
                <button type="button" onClick={() => setWeightInput(prev => prev.toString().includes('.') ? prev : prev.toString() + '.')} style={{ padding: '12px', fontSize: '18px', fontWeight: 'bold', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  .
                </button>
                <button type="button" onClick={() => setWeightInput(prev => prev.toString() + '0')} style={{ padding: '12px', fontSize: '18px', fontWeight: 'bold', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  0
                </button>
                <button type="button" onClick={() => setWeightInput(prev => prev.toString().slice(0, -1))} style={{ padding: '12px', fontSize: '18px', fontWeight: 'bold', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  ⌫
                </button>
              </div>

              <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>Estimasi Subtotal:</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#111' }}>
                  {formatIDR((Number(weightInput) || 0) * weightProduct.price)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setWeightPopupOpen(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Batal
                </button>
                <button type="submit" style={{ flex: 1, padding: '12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Plus size={18} /> Tambah ke Keranjang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
