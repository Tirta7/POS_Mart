import { useState, useEffect, useRef } from 'react';
import { 
  X, Scan, Package, Layers, ShoppingBag, CheckCircle, 
  AlertCircle, PlusCircle, Link as LinkIcon, Search,
  RefreshCw, Camera
} from 'lucide-react';
import { useInventoryStore } from '../store/useInventoryStore';
import { recordStockMutation, makeDocNo } from '../utils/stockMutation';
import { sound } from '../utils/audioFeedback';
import BarcodeScannerCamera from './BarcodeScannerCamera';
import type { Product } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenQuickRegister: (barcode: string) => void;
}

type PackagingTier = 'box' | 'mid' | 'retail';

interface RestockHistoryItem {
  id: string;
  name: string;
  tierName: string;
  inputQty: number;
  addedUnits: number;
  unit: string;
  finalStock: number;
  time: string;
}

export default function QuickRestockModal({ isOpen, onClose, onOpenQuickRegister }: Props) {
  const { products, updateProduct } = useInventoryStore();

  const [scanInput, setScanInput] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [selectedTier, setSelectedTier] = useState<PackagingTier>('box');
  const [tierQty, setTierQty] = useState<number | string>(1);
  const [customPrice, setCustomPrice] = useState<number | string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State untuk alur "Barcode Tidak Ditemukan"
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSelectedProduct, setLinkSelectedProduct] = useState<Product | null>(null);
  const [linkTierTarget, setLinkTierTarget] = useState<'box' | 'mid' | 'retail'>('box');
  const [linkCapacity, setLinkCapacity] = useState<number>(40);

  // Riwayat Restock Sesi Ini
  const [history, setHistory] = useState<RestockHistoryItem[]>([]);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input scanner saat modal terbuka atau setelah simpan
  useEffect(() => {
    if (isOpen) {
      resetScanState();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  const resetScanState = () => {
    setScanInput('');
    setMatchedProduct(null);
    setNotFoundBarcode(null);
    setLinkSearchQuery('');
    setLinkSelectedProduct(null);
    setTierQty(1);
    setCustomPrice('');
  };

  if (!isOpen) return null;

  // Temukan produk berdasarkan scan barcode atau SKU
  const handleScanSubmit = (codeToSearch?: string) => {
    const raw = (codeToSearch ?? scanInput).trim();
    if (!raw) return;

    const lower = raw.toLowerCase();

    // Cari produk dengan kecocokan spesifik barcode
    const foundByBarcode = products.find(p => 
      p.boxBarcode === raw ||
      p.midBarcode === raw ||
      p.retailBarcode === raw ||
      p.barcode === raw ||
      p.id === raw ||
      (p.sku && p.sku.toLowerCase() === lower)
    );

    if (foundByBarcode) {
      sound.playScanSuccess();
      setNotFoundBarcode(null);
      setMatchedProduct(foundByBarcode);

      // Auto-detect kemasan berdasarkan barcode yang cocok
      if (foundByBarcode.boxBarcode === raw && Number(foundByBarcode.boxCapacity) > 1) {
        setSelectedTier('box');
      } else if (foundByBarcode.midBarcode === raw && Number(foundByBarcode.midCapacity) > 1) {
        setSelectedTier('mid');
      } else if (foundByBarcode.retailBarcode === raw || foundByBarcode.barcode === raw) {
        setSelectedTier('retail');
      } else {
        // Default tier: jika punya dus pilih dus, jika tidak pilih eceran
        setSelectedTier(Number(foundByBarcode.boxCapacity) > 1 ? 'box' : 'retail');
      }

      setTierQty(1);
      setCustomPrice(foundByBarcode.purchasePrice || '');

      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 100);
    } else {
      // Barcode tidak ditemukan
      sound.playScanError();
      setMatchedProduct(null);
      setNotFoundBarcode(raw);
    }
  };

  // Hitung total unit yang ditambahkan
  const getCalculation = (): { units: number; cap: number; label: string; tierName: string } => {
    if (!matchedProduct) return { units: 0, cap: 1, label: '', tierName: 'Pcs' };
    const qty = Math.max(0, Number(tierQty) || 0);

    if (selectedTier === 'box') {
      const cap = Math.max(1, Number(matchedProduct.boxCapacity) || 40);
      return {
        units: qty * cap,
        cap,
        label: `Dus (${cap} ${matchedProduct.unit || 'Pcs'})`,
        tierName: 'Dus'
      };
    } else if (selectedTier === 'mid') {
      const cap = Math.max(1, Number(matchedProduct.midCapacity) || 10);
      const name = matchedProduct.midUnitName || 'Slop';
      return {
        units: qty * cap,
        cap,
        label: `${name} (${cap} ${matchedProduct.unit || 'Pcs'})`,
        tierName: name
      };
    } else {
      return {
        units: qty,
        cap: 1,
        label: matchedProduct.unit || 'Pcs',
        tierName: matchedProduct.unit || 'Pcs'
      };
    }
  };

  const calc = getCalculation();
  const currentStock = Number(matchedProduct?.stock) || 0;
  const projectedStock = currentStock + calc.units;

  // Eksekusi penambahan stok ke database
  const handleConfirmRestock = async () => {
    if (!matchedProduct || calc.units <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const buyPrice = Number(customPrice) > 0 
        ? Number(customPrice) 
        : (Number(matchedProduct.purchasePrice) || 0);

      // Mutasi stok Barang Masuk (IN)
      const docNo = makeDocNo('RST');
      await recordStockMutation(
        'IN',
        docNo,
        [{
          productId: matchedProduct.id,
          qty: calc.units,
          purchasePrice: buyPrice,
          name: matchedProduct.name,
          unit: matchedProduct.unit || 'Pcs'
        }],
        `Restock Kasir: ${tierQty} ${calc.tierName} (+${calc.units} ${matchedProduct.unit || 'Pcs'})`
      );

      sound.playScanSuccess();

      // Tambahkan ke riwayat lokal sesi
      const historyEntry: RestockHistoryItem = {
        id: `H-${Date.now()}`,
        name: matchedProduct.name,
        tierName: calc.tierName,
        inputQty: Number(tierQty),
        addedUnits: calc.units,
        unit: matchedProduct.unit || 'Pcs',
        finalStock: projectedStock,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      setHistory(prev => [historyEntry, ...prev.slice(0, 4)]);

      setSuccessBanner(`✓ Berhasil menambah ${tierQty} ${calc.tierName} (+${calc.units} ${matchedProduct.unit}) ke ${matchedProduct.name}. Stok kini: ${projectedStock} ${matchedProduct.unit}.`);
      setTimeout(() => setSuccessBanner(null), 5000);

      // Reset untuk scan barang berikutnya
      resetScanState();
      setTimeout(() => inputRef.current?.focus(), 150);
    } catch (err: any) {
      console.error(err);
      sound.playScanError();
      alert(err?.message || 'Gagal menyimpan mutasi restock. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Eksekusi penautan barcode ke produk yang sudah ada
  const handleConfirmLinkBarcode = async () => {
    if (!linkSelectedProduct || !notFoundBarcode) return;

    try {
      const updateData: Partial<Product> = {};
      if (linkTierTarget === 'box') {
        updateData.boxBarcode = notFoundBarcode;
        if (linkCapacity > 1) updateData.boxCapacity = linkCapacity;
      } else if (linkTierTarget === 'mid') {
        updateData.midBarcode = notFoundBarcode;
        if (linkCapacity > 1) updateData.midCapacity = linkCapacity;
      } else {
        updateData.retailBarcode = notFoundBarcode;
      }

      await updateProduct(linkSelectedProduct.id, { ...linkSelectedProduct, ...updateData } as Product);

      sound.playScanSuccess();
      const updated = { ...linkSelectedProduct, ...updateData };
      setMatchedProduct(updated);
      setSelectedTier(linkTierTarget);
      setTierQty(1);
      setNotFoundBarcode(null);
      setLinkSelectedProduct(null);

      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 100);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menautkan barcode ke produk.');
    }
  };

  // Filter produk untuk pencarian penautan
  const linkSearchResults = linkSearchQuery.trim()
    ? products.filter(p => 
        p.name.toLowerCase().includes(linkSearchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(linkSearchQuery.toLowerCase())) ||
        (p.barcode && p.barcode.includes(linkSearchQuery))
      ).slice(0, 6)
    : [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10005,
      backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '18px', width: '100%', maxWidth: '640px',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)', overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          color: '#ffffff', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              backgroundColor: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(220,38,38,0.4)'
            }}>
              <Scan size={20} color="white" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.2px' }}>
                RESTOCK CEPAT DARI KASIR
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                Scan barcode Dus, Slop, atau Eceran untuk input stok instan
              </div>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#cbd5e1'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Notifikasi Sukses Banner */}
        {successBanner && (
          <div style={{
            backgroundColor: '#ecfdf5', color: '#065f46', padding: '10px 18px',
            fontSize: '12px', fontWeight: 700, borderBottom: '1px solid #a7f3d0',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <CheckCircle size={16} color="#059669" />
            <span>{successBanner}</span>
          </div>
        )}

        {/* Konten Modal */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Kolom Scanner Input */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Scan size={18} color="#64748b" style={{ position: 'absolute', left: '14px', top: '13px' }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleScanSubmit();
                    }
                  }}
                  placeholder="Scan barcode dengan scanner / ketik barcode atau SKU..."
                  style={{
                    width: '100%', height: '44px', paddingLeft: '42px', paddingRight: '12px',
                    borderRadius: '10px', border: '2px solid #cbd5e1', fontSize: '13.5px',
                    fontWeight: 600, outline: 'none', backgroundColor: '#f8fafc',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => handleScanSubmit()}
                style={{
                  padding: '0 18px', backgroundColor: '#dc2626', color: 'white',
                  border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                Cari
              </button>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                title="Gunakan Kamera HP / Tablet"
                style={{
                  padding: '0 14px', backgroundColor: '#f1f5f9', color: '#475569',
                  border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Camera size={18} />
              </button>
            </div>
          </div>

          {/* ===== KONDISI 1: PRODUK DITEMUKAN ===== */}
          {matchedProduct && (
            <div style={{
              backgroundColor: '#ffffff', borderRadius: '14px', border: '1.5px solid #e2e8f0',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
            }}>
              {/* Info Produk */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '10px',
                  backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0
                }}>
                  {matchedProduct.image ? (
                    <img src={matchedProduct.image} alt={matchedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Package size={28} color="#94a3b8" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    {matchedProduct.category || 'Umum'} &bull; SKU: {matchedProduct.sku || '-'}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {matchedProduct.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                    Stok Saat Ini: <strong>{currentStock} {matchedProduct.unit || 'Pcs'}</strong>
                    {Number(matchedProduct.boxCapacity) > 1 && (
                      <span style={{ color: '#64748b', fontWeight: 500, marginLeft: '6px' }}>
                        (~{Math.floor(currentStock / Number(matchedProduct.boxCapacity))} Dus)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Pilihan Kemasan (3-Tier Buttons) */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  PILIH KEMASAN YANG DISCAN:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {/* Tier 1: Dus */}
                  <button
                    type="button"
                    onClick={() => { setSelectedTier('box'); qtyInputRef.current?.focus(); }}
                    style={{
                      padding: '12px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                      border: selectedTier === 'box' ? '2px solid #dc2626' : '1px solid #e2e8f0',
                      backgroundColor: selectedTier === 'box' ? '#fff1f2' : '#ffffff',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: selectedTier === 'box' ? '#dc2626' : '#475569' }}>
                      <Package size={16} />
                      <span style={{ fontSize: '13px', fontWeight: 800 }}>DUS / KARTON</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                      Isi: <strong>{matchedProduct.boxCapacity || 40}</strong> {matchedProduct.unit || 'Pcs'}
                    </div>
                  </button>

                  {/* Tier 2: Slop / Kemasan Menengah */}
                  <button
                    type="button"
                    onClick={() => { setSelectedTier('mid'); qtyInputRef.current?.focus(); }}
                    disabled={!matchedProduct.midCapacity || Number(matchedProduct.midCapacity) <= 1}
                    style={{
                      padding: '12px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                      border: selectedTier === 'mid' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                      backgroundColor: selectedTier === 'mid' ? '#f0f9ff' : (Number(matchedProduct.midCapacity) > 1 ? '#ffffff' : '#f8fafc'),
                      opacity: Number(matchedProduct.midCapacity) > 1 ? 1 : 0.45,
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: selectedTier === 'mid' ? '#0284c7' : '#475569' }}>
                      <Layers size={16} />
                      <span style={{ fontSize: '13px', fontWeight: 800 }}>
                        {matchedProduct.midUnitName || 'SLOP'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                      {Number(matchedProduct.midCapacity) > 1 ? `Isi: ${matchedProduct.midCapacity} ${matchedProduct.unit || 'Pcs'}` : 'Tidak aktif'}
                    </div>
                  </button>

                  {/* Tier 3: Eceran / Pcs */}
                  <button
                    type="button"
                    onClick={() => { setSelectedTier('retail'); qtyInputRef.current?.focus(); }}
                    style={{
                      padding: '12px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                      border: selectedTier === 'retail' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      backgroundColor: selectedTier === 'retail' ? '#f0fdf4' : '#ffffff',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: selectedTier === 'retail' ? '#16a34a' : '#475569' }}>
                      <ShoppingBag size={16} />
                      <span style={{ fontSize: '13px', fontWeight: 800 }}>ECERAN</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                      1 {matchedProduct.unit || 'Pcs'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Input Kuantitas & Kalkulasi Otomatis */}
              <div style={{
                backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0',
                padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
              }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Jumlah {calc.tierName} yang Masuk:
                    </label>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      min="1"
                      value={tierQty}
                      onChange={e => setTierQty(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmRestock();
                        }
                      }}
                      style={{
                        width: '100%', height: '42px', padding: '0 12px', borderRadius: '8px',
                        border: '2px solid #cbd5e1', fontSize: '16px', fontWeight: 800,
                        color: '#0f172a', textAlign: 'center'
                      }}
                    />
                  </div>

                  <div style={{ flex: 1.4, backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total Masuk ke Stok Fisik:</div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
                      +{calc.units} {matchedProduct.unit || 'Pcs'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                      Stok Akhir: <strong>{projectedStock} {matchedProduct.unit || 'Pcs'}</strong>
                    </div>
                  </div>
                </div>

                {/* Tombol Konfirmasi */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={resetScanState}
                    disabled={isSubmitting}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff', color: '#475569', fontSize: '12.5px', fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Batal / Scan Ulang
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestock}
                    disabled={isSubmitting || calc.units <= 0}
                    style={{
                      flex: 2, padding: '10px', borderRadius: '8px', border: 'none',
                      backgroundColor: '#dc2626', color: '#ffffff', fontSize: '13.5px', fontWeight: 800,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      boxShadow: '0 4px 12px rgba(220,38,38,0.3)'
                    }}
                  >
                    {isSubmitting ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle size={16} />
                    )}
                    {isSubmitting ? 'Menyimpan Stok...' : `+ Tambah ${calc.units} ${matchedProduct.unit || 'Pcs'} (Enter)`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== KONDISI 2: BARCODE TIDAK DITEMUKAN (OPSI PINTAR) ===== */}
          {notFoundBarcode && (
            <div style={{
              backgroundColor: '#fff7ed', borderRadius: '14px', border: '1.5px solid #fed7aa',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px'
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <AlertCircle size={22} color="#ea580c" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#9a3412' }}>
                    Barcode Belum Terdaftar di Database Toko
                  </div>
                  <div style={{ fontSize: '12px', color: '#c2410c', marginTop: '2px' }}>
                    Barcode yang discan: <code style={{ backgroundColor: '#ffedd5', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, color: '#7c2d12' }}>{notFoundBarcode}</code>
                  </div>
                </div>
              </div>

              {/* 2 Opsi Tindakan */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Opsi 1: Daftarkan Baru */}
                <button
                  type="button"
                  onClick={() => {
                    const bc = notFoundBarcode;
                    resetScanState();
                    onClose();
                    onOpenQuickRegister(bc);
                  }}
                  style={{
                    backgroundColor: '#ffffff', border: '1.5px solid #fdba74', borderRadius: '10px',
                    padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ea580c', fontWeight: 800, fontSize: '13px' }}>
                    <PlusCircle size={16} />
                    <span>Daftarkan Produk Baru</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                    Input nama produk baru dengan barcode ini terisi otomatis.
                  </div>
                </button>

                {/* Opsi 2: Tautkan ke Produk yang Sudah Ada */}
                <button
                  type="button"
                  onClick={() => {
                    setLinkSelectedProduct(null);
                    setLinkSearchQuery('');
                  }}
                  style={{
                    backgroundColor: '#ffffff', border: '1.5px solid #93c5fd', borderRadius: '10px',
                    padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7', fontWeight: 800, fontSize: '13px' }}>
                    <LinkIcon size={16} />
                    <span>Tautkan ke Produk Lama</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                    Jadikan barcode ini sebagai Barcode Dus atau Slop dari barang lama.
                  </div>
                </button>
              </div>

              {/* Form Pencarian & Penautan Produk Lama */}
              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Cari Produk yang Ingin Ditautkan dengan Barcode Ini:
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  <input
                    type="text"
                    value={linkSearchQuery}
                    onChange={e => setLinkSearchQuery(e.target.value)}
                    placeholder="Ketik nama produk atau SKU lama..."
                    style={{
                      width: '100%', height: '36px', paddingLeft: '32px', paddingRight: '10px',
                      borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px'
                    }}
                  />
                </div>

                {/* Hasil Pencarian */}
                {linkSearchResults.length > 0 && !linkSelectedProduct && (
                  <div style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                    {linkSearchResults.map(prod => (
                      <div
                        key={prod.id}
                        onClick={() => {
                          setLinkSelectedProduct(prod);
                          setLinkCapacity(Number(prod.boxCapacity) || 40);
                        }}
                        style={{
                          padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px'
                        }}
                      >
                        <div>
                          <strong style={{ color: '#0f172a' }}>{prod.name}</strong>
                          <div style={{ fontSize: '10.5px', color: '#64748b' }}>SKU: {prod.sku || '-'} &bull; Stok: {prod.stock} {prod.unit}</div>
                        </div>
                        <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700 }}>Pilih</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pilihan Target Tautan Jika Produk Dipilih */}
                {linkSelectedProduct && (
                  <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1', marginBottom: '8px' }}>
                      Tautkan Barcode <code>{notFoundBarcode}</code> ke &ldquo;{linkSelectedProduct.name}&rdquo; Sebagai:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setLinkTierTarget('box')}
                        style={{
                          padding: '8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                          border: linkTierTarget === 'box' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          backgroundColor: linkTierTarget === 'box' ? '#ffffff' : '#f8fafc',
                          color: linkTierTarget === 'box' ? '#0369a1' : '#475569', cursor: 'pointer'
                        }}
                      >
                        📦 Barcode Dus
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkTierTarget('mid')}
                        style={{
                          padding: '8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                          border: linkTierTarget === 'mid' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          backgroundColor: linkTierTarget === 'mid' ? '#ffffff' : '#f8fafc',
                          color: linkTierTarget === 'mid' ? '#0369a1' : '#475569', cursor: 'pointer'
                        }}
                      >
                        🗂️ Barcode Slop
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkTierTarget('retail')}
                        style={{
                          padding: '8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                          border: linkTierTarget === 'retail' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          backgroundColor: linkTierTarget === 'retail' ? '#ffffff' : '#f8fafc',
                          color: linkTierTarget === 'retail' ? '#0369a1' : '#475569', cursor: 'pointer'
                        }}
                      >
                        🛍️ Barcode Eceran
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setLinkSelectedProduct(null)}
                        style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }}
                      >
                        Ganti Produk
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmLinkBarcode}
                        style={{ padding: '6px 14px', fontSize: '11.5px', fontWeight: 700, borderRadius: '6px', border: 'none', backgroundColor: '#0284c7', color: '#ffffff', cursor: 'pointer' }}
                      >
                        Simpan Tautan &amp; Lanjut Restock
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== RIWAYAT RESTOCK SESI INI ===== */}
          {history.length > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                Riwayat Restock Sesi Kasir Ini:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {history.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px',
                      border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: '12px'
                    }}
                  >
                    <div>
                      <strong style={{ color: '#0f172a' }}>{item.name}</strong>
                      <span style={{ color: '#64748b', marginLeft: '6px' }}>({item.time})</span>
                    </div>
                    <div style={{ fontWeight: 800, color: '#059669' }}>
                      +{item.inputQty} {item.tierName} (+{item.addedUnits} {item.unit}) &rarr; Total {item.finalStock} {item.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '11.5px', color: '#64748b' }}>
            💡 Tekan <strong>Enter</strong> untuk langsung konfirmasi setelah memilih kemasan
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 18px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
              borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, color: '#475569', cursor: 'pointer'
            }}
          >
            Tutup
          </button>
        </div>

      </div>

      {/* Modal Kamera Scanner */}
      {cameraOpen && (
        <BarcodeScannerCamera
          onScan={(decoded) => {
            setCameraOpen(false);
            setScanInput(decoded);
            handleScanSubmit(decoded);
            return null;
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
