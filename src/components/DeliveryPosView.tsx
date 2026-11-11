import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Camera,
  X,
  Plus,
  Minus,
  Bike,
  AlertCircle,
  Edit3,
  FileText,
  Banknote,
  QrCode,
  CreditCard,
  Clock,
  MoreVertical,
  Ticket,
  Store,
  MapPin,
} from 'lucide-react';
import { handleProductImageError } from '../utils/defaultProductImage';

export interface DeliveryCategoryItem {
  id: string;
  name: string;
  icon?: React.ReactNode;
}

interface DeliveryPosViewProps {
  appName: string;
  appLogo?: string | null;
  step: 'catalog' | 'checkout';
  onStepChange: (step: 'catalog' | 'checkout') => void;
  onExitDelivery: () => void;
  products: any[];
  categories: DeliveryCategoryItem[];
  activeCat: string;
  onSelectCat: (catId: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenCameraScanner: () => void;
  cart: any[];
  total: number;
  selectedCustomer: any;
  onOpenCustomerSelect: () => void;
  deliveryAddressDetail: string;
  onChangeAddressDetail: (val: string) => void;
  deliveryNote: string;
  onChangeDeliveryNote: (val: string) => void;
  onProductAdd: (product: any) => void;
  onDecrementProduct: (productId: string) => void;
  onUpdateCartQty: (cartId: string, delta: number) => void;
  onRemoveCartRow: (cartId: string) => void;
  paymentMethod: string;
  onSelectPaymentMethod: (method: string) => void;
  onProceedPayment: () => void;
}

const formatCompactIDR = (num: number) => `Rp${Math.round(num).toLocaleString('id-ID')}`;

const PAYMENT_OPTIONS = [
  { id: 'TUNAI', label: 'Tunai', Icon: Banknote, accent: '#00880d', bg: '#e8f8ec' },
  { id: 'QRIS', label: 'QRIS', Icon: QrCode, accent: '#0284c7', bg: '#e0f2fe' },
  { id: 'EDC', label: 'Debit/EDC', Icon: CreditCard, accent: '#7c3aed', bg: '#ede9fe' },
  { id: 'TEMPO', label: 'Tempo', Icon: Clock, accent: '#d97706', bg: '#fef3c7' },
  { id: 'KUPON', label: 'Kupon', Icon: Ticket, accent: '#db2777', bg: '#fce7f3' },
];

export default function DeliveryPosView({
  appName,
  appLogo,
  step,
  onStepChange,
  onExitDelivery,
  products,
  categories,
  activeCat,
  onSelectCat,
  searchQuery,
  onSearchChange,
  onOpenCameraScanner,
  cart,
  total,
  selectedCustomer,
  onOpenCustomerSelect,
  deliveryAddressDetail,
  onChangeAddressDetail,
  deliveryNote,
  onChangeDeliveryNote,
  onProductAdd,
  onDecrementProduct,
  onUpdateCartQty,
  onRemoveCartRow,
  paymentMethod,
  onSelectPaymentMethod,
  onProceedPayment,
}: DeliveryPosViewProps) {
  const [editingAddress, setEditingAddress] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);

  const activeCategoryName =
    activeCat === 'all'
      ? 'Semua Produk'
      : categories.find((c) => c.id.toLowerCase() === activeCat.toLowerCase())?.name || activeCat;

  const totalCartItems = cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
  const formattedTotalQty = Number.isInteger(totalCartItems)
    ? String(totalCartItems)
    : (Math.round(totalCartItems * 100) / 100).toString();

  const filteredProducts = products.filter((p) => {
    const catMatch = activeCat === 'all' || String(p.type || '').toLowerCase() === activeCat.toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catMatch;
    const textMatch =
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.sku || '').toLowerCase().includes(q) ||
      String(p.barcode || '').toLowerCase().includes(q) ||
      (p.variants || []).some((v: any) => String(v.name || '').toLowerCase().includes(q)) ||
      String(p.id || '').toLowerCase().includes(q);
    return catMatch && textMatch;
  });

  const getProductCartQty = (productId: string) =>
    cart
      .filter((item) => item.id === productId)
      .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  if (step === 'checkout') {
    const locationTitle =
      selectedCustomer?.address?.trim() ||
      selectedCustomer?.name?.trim() ||
      'Pilih alamat pengantaran';

    const visibleMethods = showAllPayments ? PAYMENT_OPTIONS : PAYMENT_OPTIONS.slice(0, 3);

    return (
      <div className="deliv-shell deliv-checkout-shell">
        {/* Top Sticky Header */}
        <header className="deliv-header">
          <button
            type="button"
            className="deliv-back-btn"
            onClick={() => onStepChange('catalog')}
            aria-label="Kembali ke katalog delivery"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="deliv-checkout-title">Konfirmasi belanjaan</h1>
        </header>

        <div className="deliv-checkout-scroll">
          {/* Fast Delivery ETA Banner */}
          <div className="deliv-eta-banner">
            <span className="deliv-eta-icon">
              <Bike size={18} />
            </span>
            <p className="deliv-eta-text">
              Buka 24 jam, pengiriman dalam <strong>30 menit</strong>
            </p>
          </div>

          {/* Delivery Location Section */}
          <section className="deliv-section deliv-location-section">
            <div className="deliv-location-label">Lokasi pengantaran</div>
            <div className="deliv-location-row">
              <div className="deliv-location-info">
                <div className="deliv-location-address">{locationTitle}</div>
                {selectedCustomer?.name && selectedCustomer?.address && (
                  <div className="deliv-location-customer">
                    <MapPin size={12} /> {selectedCustomer.name}
                    {selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="deliv-outline-green-pill"
                onClick={onOpenCustomerSelect}
              >
                Ganti lokasi
              </button>
            </div>

            {!deliveryAddressDetail.trim() ? (
              <button
                type="button"
                className="deliv-warning-pill"
                onClick={() => setEditingAddress(true)}
              >
                <AlertCircle size={17} className="deliv-warning-icon" />
                <span>Detail alamat harus diisi untuk lokasi ini</span>
              </button>
            ) : (
              <div className="deliv-saved-detail-box" onClick={() => setEditingAddress((prev) => !prev)}>
                <span className="deliv-saved-detail-label">Detail alamat:</span> {deliveryAddressDetail}
              </div>
            )}

            {deliveryNote.trim() && !editingNote && (
              <div className="deliv-saved-note-box" onClick={() => setEditingNote(true)}>
                <span className="deliv-saved-detail-label">Catatan:</span> {deliveryNote}
              </div>
            )}

            <div className="deliv-pill-actions">
              <button
                type="button"
                className={`deliv-action-chip ${editingAddress ? 'active' : ''}`}
                onClick={() => setEditingAddress((prev) => !prev)}
              >
                <Edit3 size={14} />
                <span>Isi detail alamat</span>
              </button>
              <button
                type="button"
                className={`deliv-action-chip ${editingNote ? 'active' : ''}`}
                onClick={() => setEditingNote((prev) => !prev)}
              >
                <FileText size={14} />
                <span>Catatan</span>
              </button>
            </div>

            {editingAddress && (
              <div className="deliv-inline-input-wrap">
                <input
                  type="text"
                  className="deliv-inline-input"
                  value={deliveryAddressDetail}
                  onChange={(e) => onChangeAddressDetail(e.target.value)}
                  placeholder="Contoh: Blok B2 No.14, pagar hitam, depan musholla"
                  autoFocus
                />
                <button
                  type="button"
                  className="deliv-inline-save"
                  onClick={() => setEditingAddress(false)}
                >
                  Simpan
                </button>
              </div>
            )}

            {editingNote && (
              <div className="deliv-inline-input-wrap">
                <input
                  type="text"
                  className="deliv-inline-input"
                  value={deliveryNote}
                  onChange={(e) => onChangeDeliveryNote(e.target.value)}
                  placeholder="Contoh: Hubungi penerima saat sampai / taruh di teras"
                  autoFocus
                />
                <button
                  type="button"
                  className="deliv-inline-save"
                  onClick={() => setEditingNote(false)}
                >
                  Simpan
                </button>
              </div>
            )}
          </section>

          <div className="deliv-section-divider" />

          {/* Shopping List Section */}
          <section className="deliv-section deliv-items-section">
            <div className="deliv-items-header">
              <h2>Daftar belanja</h2>
              <button
                type="button"
                className="deliv-add-more-link"
                onClick={() => onStepChange('catalog')}
              >
                + Tambah lagi
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="deliv-empty-cart">
                <p>Daftar belanjaan masih kosong.</p>
                <button
                  type="button"
                  className="deliv-outline-green-pill"
                  onClick={() => onStepChange('catalog')}
                >
                  Pilih Produk
                </button>
              </div>
            ) : (
              <div className="deliv-checkout-list">
                {cart.map((item) => {
                  const unitLabel = item.tierUnit || item.unit || 'Pcs';
                  const itemQtyLabel = Number.isInteger(item.qty)
                    ? String(item.qty)
                    : (Math.round(item.qty * 100) / 100).toString();
                  return (
                    <div key={item.cartId} className="deliv-checkout-item">
                      <div className="deliv-checkout-thumb">
                        <img
                          src={item.img}
                          alt={item.name}
                          onError={handleProductImageError}
                        />
                      </div>
                      <div className="deliv-checkout-item-info">
                        <div className="deliv-checkout-item-name">
                          {item.name}
                          {item.variantName ? ` (${item.variantName})` : ''}
                        </div>
                        <span className="deliv-unit-badge">{unitLabel}</span>
                        <div className="deliv-checkout-item-price">
                          {formatCompactIDR(item.price)}
                        </div>
                      </div>
                      <div className="deliv-circle-stepper">
                        <button
                          type="button"
                          className="deliv-circle-step-btn"
                          aria-label={`Kurangi ${item.name}`}
                          onClick={() => {
                            if (item.qty <= 1) {
                              onRemoveCartRow(item.cartId);
                            } else {
                              onUpdateCartQty(item.cartId, -1);
                            }
                          }}
                        >
                          <Minus size={14} strokeWidth={2.5} />
                        </button>
                        <span className="deliv-circle-step-qty">{itemQtyLabel}</span>
                        <button
                          type="button"
                          className="deliv-circle-step-btn"
                          aria-label={`Tambah ${item.name}`}
                          onClick={() => onUpdateCartQty(item.cartId, 1)}
                        >
                          <Plus size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Sticky Bottom Payment Footer */}
        <footer className="deliv-checkout-footer">
          <div className="deliv-pay-strip">
            <div className="deliv-pay-chips">
              {visibleMethods.map(({ id, label, Icon, accent, bg }) => {
                const isActive = paymentMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`deliv-pay-chip ${isActive ? 'active' : ''}`}
                    onClick={() => onSelectPaymentMethod(id)}
                  >
                    <span
                      className="deliv-pay-chip-icon"
                      style={{ backgroundColor: bg, color: accent }}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="deliv-pay-chip-meta">
                      <span className="deliv-pay-chip-label">{label}</span>
                      {isActive && (
                        <strong className="deliv-pay-chip-val">
                          {total.toLocaleString('id-ID')}
                        </strong>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="deliv-pay-more-btn"
              onClick={() => setShowAllPayments((prev) => !prev)}
              aria-label="Metode pembayaran lainnya"
              title="Metode pembayaran lainnya"
            >
              <MoreVertical size={18} />
            </button>
          </div>

          <button
            type="button"
            className={`deliv-cta-btn ${cart.length === 0 || total <= 0 ? 'disabled' : ''}`}
            disabled={cart.length === 0 || total <= 0}
            onClick={onProceedPayment}
          >
            <span>Proses Delivery sekarang</span>
            <span className="deliv-cta-right">
              <strong>{total.toLocaleString('id-ID')}</strong>
              <span className="deliv-cta-arrow">
                <ArrowRight size={15} strokeWidth={2.8} />
              </span>
            </span>
          </button>
        </footer>
      </div>
    );
  }

  // CATALOG VIEW
  return (
    <div className="deliv-shell deliv-catalog-shell">
      <div className="deliv-sticky-top">
        <header className="deliv-header">
          <button
            type="button"
            className="deliv-back-btn"
            onClick={onExitDelivery}
            aria-label="Kembali ke POS Reguler"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="deliv-store-thumb">
            {appLogo ? (
              <img src={appLogo} alt={appName} />
            ) : (
              <Store size={18} color="#00880d" />
            )}
          </div>
          <div className="deliv-header-titles">
            <h1 className="deliv-catalog-title">{activeCategoryName}</h1>
            <p className="deliv-catalog-subtitle">
              di {appName || 'Tirta Mart'} · Delivery
            </p>
          </div>
          <button
            type="button"
            className="deliv-mode-switch-pill"
            onClick={onExitDelivery}
          >
            Kasir POS
          </button>
        </header>

        {/* Pill Search Bar */}
        <div className="deliv-search-wrap">
          <div className="deliv-search-pill">
            <Search size={18} className="deliv-search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Mau belanja apa hari ini?"
              aria-label="Cari produk delivery"
            />
            {searchQuery && (
              <button
                type="button"
                className="deliv-search-clear"
                onClick={() => onSearchChange('')}
                aria-label="Hapus pencarian"
              >
                <X size={15} />
              </button>
            )}
            <button
              type="button"
              className="deliv-search-cam"
              onClick={onOpenCameraScanner}
              aria-label="Scan barcode kamera"
              title="Scan barcode"
            >
              <Camera size={17} />
            </button>
          </div>
        </div>

        {/* Category Filter Strip */}
        <div className="deliv-cats-scroll" role="tablist" aria-label="Kategori Delivery">
          {categories.map((cat) => {
            const isActive = activeCat.toLowerCase() === cat.id.toLowerCase();
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`deliv-cat-pill ${isActive ? 'active' : ''}`}
                onClick={() => onSelectCat(cat.id)}
              >
                {cat.id === 'all' ? 'Semua' : cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Grid */}
      <main className={`deliv-catalog-body ${cart.length > 0 ? 'has-cart-bar' : ''}`}>
        {filteredProducts.length === 0 ? (
          <div className="deliv-empty-search">
            <p>Produk "{searchQuery}" tidak ditemukan.</p>
            {searchQuery && (
              <button
                type="button"
                className="deliv-outline-green-pill"
                onClick={() => onSearchChange('')}
              >
                Reset Pencarian
              </button>
            )}
          </div>
        ) : (
          <div className="deliv-product-grid">
            {filteredProducts.map((product, index) => {
              const inCartQty = getProductCartQty(product.id);
              const isOutOfStock = product.availableStock <= 0;
              const isPopuler = index < 4 || product.tag === 'BESTSELLER';
              const qtyLabel = Number.isInteger(inCartQty)
                ? String(inCartQty)
                : (Math.round(inCartQty * 100) / 100).toString();

              return (
                <article
                  key={product.id}
                  className={`deliv-card ${isOutOfStock ? 'out-of-stock' : ''}`}
                >
                  <div
                    className="deliv-card-img-box"
                    onClick={() => !isOutOfStock && onProductAdd(product)}
                  >
                    {isOutOfStock ? (
                      <span className="deliv-badge-oos">Habis</span>
                    ) : isPopuler ? (
                      <span className="deliv-badge-populer">Populer</span>
                    ) : null}

                    <img
                      src={product.img}
                      alt={product.name}
                      className="deliv-card-img"
                      onError={handleProductImageError}
                    />

                    {inCartQty > 0 ? (
                      <div
                        className="deliv-card-stepper"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="deliv-card-step-btn"
                          aria-label={`Kurangi ${product.name}`}
                          onClick={() => onDecrementProduct(product.id)}
                        >
                          <Minus size={13} strokeWidth={2.6} />
                        </button>
                        <span className="deliv-card-step-qty">{qtyLabel}</span>
                        <button
                          type="button"
                          className="deliv-card-step-btn"
                          aria-label={`Tambah ${product.name}`}
                          onClick={() => !isOutOfStock && onProductAdd(product)}
                        >
                          <Plus size={13} strokeWidth={2.6} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="deliv-card-add-btn"
                        disabled={isOutOfStock}
                        aria-label={`Tambah ${product.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isOutOfStock) onProductAdd(product);
                        }}
                      >
                        <Plus size={19} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>

                  <div
                    className="deliv-card-meta"
                    onClick={() => !isOutOfStock && onProductAdd(product)}
                  >
                    <span className="deliv-unit-badge">{product.unit || 'Pcs'}</span>
                    <h2 className="deliv-card-name" title={product.name}>
                      {product.name}
                    </h2>
                    <div className="deliv-card-price">{formatCompactIDR(product.price)}</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Green Summary Cart Bar */}
      {cart.length > 0 && (
        <div className="deliv-floating-cart-wrap">
          <button
            type="button"
            className="deliv-floating-cart-bar"
            onClick={() => onStepChange('checkout')}
          >
            <div className="deliv-fcb-left">
              <strong>{formattedTotalQty} item</strong>
              <span>Harga yang tertera merupakan estimasi</span>
            </div>
            <div className="deliv-fcb-right">
              <strong>{formatCompactIDR(total)}</strong>
              <span className="deliv-fcb-arrow">
                <ArrowRight size={15} strokeWidth={2.8} />
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
