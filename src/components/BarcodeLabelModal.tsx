import React, { useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X, Bluetooth, CheckCircle2, AlertCircle, RefreshCw, Tag, ChevronLeft, ChevronRight, Layers, FileText } from 'lucide-react';
import { usePrinterStore } from '../store/usePrinterStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { printLabelBluetooth, printBatchLabelsBluetooth } from '../utils/labelPrinter';

export interface LabelProduct {
  id: string;
  barcode?: string;
  sku?: string;
  name: string;
  sellingPrice: number;
  unit?: string;
  stock?: number;
}

interface Props {
  product?: LabelProduct | null;
  products?: LabelProduct[];
  initialCopies?: number;
  onClose: () => void;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const buildBarcodeSvg = (code: string, isShelfTag: boolean): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, code, {
      format: 'CODE128',
      width: 2,
      height: isShelfTag ? 36 : 48,
      margin: 0,
      displayValue: true,
      fontSize: 14,
      textMargin: 2,
      font: 'monospace',
    });
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    if (w && h) svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('style', 'width:100%;height:100%;display:block;');
    return svg.outerHTML;
  } catch (e) {
    return `<div style="text-align:center;font-family:monospace;font-weight:bold;font-size:12px;padding:4px;">${escapeHtml(code)}</div>`;
  }
};

const buildLabelHtml = (
  p: LabelProduct,
  storeName: string,
  isShelfTag: boolean,
  showName: boolean,
  showSku: boolean,
  showPrice: boolean,
  wMm: number,
  hMm: number
): string => {
  const code = p.barcode || p.sku || p.id;
  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });

  if (isShelfTag) {
    // Mode Label Rak Toko (Price Tag)
    return `
      <div class="lbl" style="width:${wMm}mm;height:${hMm}mm;box-sizing:border-box;padding:2mm;display:flex;flex-direction:column;justify-content:space-between;background:#fff;color:#000;border:1px dashed #d1d5db;border-radius:4px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #111;padding-bottom:1mm;">
          <span style="font:bold 7pt Arial,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(storeName || 'POS MART')}</span>
          <span style="font:6pt Arial,sans-serif;color:#555;">${dateStr}</span>
        </div>
        ${showName ? `<div style="font:bold 8.5pt Arial,sans-serif;line-height:1.15;max-height:2.3em;overflow:hidden;margin-top:1mm;">${escapeHtml(p.name)}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin:1mm 0;">
          <div style="flex:1;min-height:0;height:12mm;">${buildBarcodeSvg(code, true)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #111;padding-top:1mm;">
          ${showSku && p.sku ? `<span style="font:6pt monospace;color:#333;">SKU:${escapeHtml(p.sku)}</span>` : '<span></span>'}
          ${showPrice ? `<span style="font:bold 12pt Arial,sans-serif;letter-spacing:-0.5px;">Rp ${p.sellingPrice.toLocaleString('id-ID')}${p.unit ? `<small style="font-size:7pt;font-weight:normal;"> /${p.unit}</small>` : ''}</span>` : ''}
        </div>
      </div>
    `;
  }

  // Mode Stiker Barcode Produk Standar
  const nameBlock = showName
    ? `<div style="font:bold 8pt Arial,sans-serif;line-height:1.15;max-height:2.2em;overflow:hidden;text-align:center;">${escapeHtml(p.name)}</div>`
    : '';
  const skuBlock = showSku && p.sku
    ? `<div style="font:6.5pt Arial,sans-serif;line-height:1.1;text-align:center;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">SKU: ${escapeHtml(p.sku)}</div>`
    : '';
  const priceBlock = showPrice
    ? `<div style="font:bold 11pt Arial,sans-serif;text-align:center;">Rp ${p.sellingPrice.toLocaleString('id-ID')}</div>`
    : '';

  return `
    <div class="lbl" style="width:${wMm}mm;height:${hMm}mm;box-sizing:border-box;padding:1.5mm 2mm;display:flex;flex-direction:column;justify-content:space-between;align-items:stretch;overflow:hidden;background:#fff;color:#000;border:1px dashed #d1d5db;border-radius:4px;">
      <div>${nameBlock}${skuBlock}</div>
      <div style="flex:1;min-height:0;margin:0.5mm 0;display:flex;align-items:center;justify-content:center;">${buildBarcodeSvg(code, false)}</div>
      ${priceBlock}
    </div>
  `;
};

const BarcodeLabelModal: React.FC<Props> = ({ product, products, initialCopies = 1, onClose }) => {
  // Tentukan daftar target produk (bisa satuan atau masal/keseluruhan)
  const targetProducts: LabelProduct[] = useMemo(() => {
    if (products && products.length > 0) return products;
    if (product) return [product];
    return [];
  }, [product, products]);

  const isBulk = targetProducts.length > 1;

  // Aturan kuantitas salinan per produk untuk bulk mode
  const [copiesRule, setCopiesRule] = useState<'fixed' | 'stock'>('fixed');
  const [copies, setCopies] = useState<number>(Math.max(1, Math.floor(initialCopies)));
  
  // Format layout cetak browser: roll (1 per halaman) atau a4_grid (kisi grid di lembar A4)
  const [layoutMode, setLayoutMode] = useState<'roll' | 'a4_grid'>('roll');

  const [isShelfTag, setIsShelfTag] = useState(false);
  const [labelSize, setLabelSize] = useState<'40x30' | '50x30' | '33x15'>('40x30');
  const [showName, setShowName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  
  // Preview carousel state (untuk navigasi antar produk yang dicetak masal)
  const [previewIndex, setPreviewIndex] = useState(0);

  // Status proses cetak bluetooth & progress bar
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [printProgress, setPrintProgress] = useState<{ current: number; total: number } | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { appName } = useSettingsStore();
  const { isConnected, isConnecting, deviceName, connect } = usePrinterStore();

  const [wMm, hMm] = useMemo(() => {
    if (labelSize === '33x15') return [33, 15];
    if (labelSize === '50x30') return [50, 30];
    return [40, 30];
  }, [labelSize]);

  // Hitung total stiker yang akan dicetak
  const totalLabelsCount = useMemo(() => {
    if (!isBulk) return copies;
    if (copiesRule === 'stock') {
      return targetProducts.reduce((sum, p) => sum + Math.max(1, Number(p.stock) || 1), 0);
    }
    return targetProducts.length * copies;
  }, [isBulk, copiesRule, targetProducts, copies]);

  // Produk aktif untuk visual preview
  const currentPreviewProd = targetProducts[previewIndex] || targetProducts[0];

  const previewHtml = useMemo(() => {
    if (!currentPreviewProd) return '';
    return buildLabelHtml(currentPreviewProd, appName || 'POS MART', isShelfTag, showName, showSku, showPrice, wMm, hMm);
  }, [currentPreviewProd, appName, isShelfTag, showName, showSku, showPrice, wMm, hMm]);

  // Cetak via Bluetooth (Thermal Label ESC/POS / Bitmap Raster)
  const handlePrintBluetooth = async () => {
    setStatusMsg(null);
    setIsPrintingBt(true);
    setPrintProgress(null);

    try {
      if (!isBulk) {
        // Cetak Satuan
        const p = targetProducts[0];
        const res = await printLabelBluetooth(
          {
            name: p.name,
            code: p.barcode || p.sku || p.id,
            sku: p.sku,
            price: p.sellingPrice,
            unit: p.unit,
            storeName: appName || 'POS MART',
          },
          {
            copies,
            labelWidthMm: wMm,
            labelHeightMm: hMm,
            showName,
            showSku,
            showPrice,
            isShelfTag,
          }
        );

        if (res.success) {
          setStatusMsg({ type: 'success', text: `Berhasil mencetak ${copies} label ke ${deviceName || 'Printer Bluetooth'}!` });
        } else {
          setStatusMsg({ type: 'error', text: res.message || 'Gagal mencetak ke printer bluetooth.' });
        }
      } else {
        // Cetak Masal / Keseluruhan
        const itemsToPrint = targetProducts.map((p) => ({
          data: {
            name: p.name,
            code: p.barcode || p.sku || p.id,
            sku: p.sku,
            price: p.sellingPrice,
            unit: p.unit,
            storeName: appName || 'POS MART',
          },
          copies: copiesRule === 'stock' ? Math.max(1, Number(p.stock) || 1) : copies,
        }));

        const res = await printBatchLabelsBluetooth(
          itemsToPrint,
          {
            labelWidthMm: wMm,
            labelHeightMm: hMm,
            showName,
            showSku,
            showPrice,
            isShelfTag,
          },
          (current, total) => {
            setPrintProgress({ current, total });
          }
        );

        if (res.success) {
          setStatusMsg({
            type: 'success',
            text: `Berhasil mencetak ${totalLabelsCount} stiker (${targetProducts.length} produk) ke ${deviceName || 'Printer Bluetooth'}!`,
          });
        } else {
          setStatusMsg({ type: 'error', text: res.message || 'Gagal mencetak masal ke printer bluetooth.' });
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Terjadi kesalahan sistem print bluetooth.' });
    } finally {
      setIsPrintingBt(false);
      setPrintProgress(null);
    }
  };

  // Cetak via Browser (Iframe / USB Thermal / Kertas Stiker A4 Grid)
  const handlePrintBrowser = () => {
    let html = '';

    if (isBulk && layoutMode === 'a4_grid') {
      // MODE LEMBARAN KERTAS STIKER A4 (KISI GRID)
      let labelCards = '';
      for (const p of targetProducts) {
        const itemCopies = copiesRule === 'stock' ? Math.max(1, Number(p.stock) || 1) : copies;
        const one = buildLabelHtml(p, appName || 'POS MART', isShelfTag, showName, showSku, showPrice, wMm, hMm);
        for (let c = 0; c < itemCopies; c++) {
          labelCards += `<div class="a4-lbl-box">${one}</div>`;
        }
      }

      html = `<!doctype html><html><head><meta charset="utf-8"><title>Cetak Lembaran Stiker A4 - ${appName || 'POS MART'}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm 6mm; }
          html, body { margin: 0; padding: 0; background: #fff; }
          .a4-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(${wMm}mm, 1fr));
            gap: 2.5mm;
            justify-items: center;
          }
          .a4-lbl-box {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .lbl { border: 0.5px dashed #ccc !important; }
        </style></head><body>
        <div class="a4-grid">${labelCards}</div>
        </body></html>`;
    } else {
      // MODE THERMAL ROLL CONTINUOUS (1 label per halaman beruntun)
      let labels = '';
      for (const p of targetProducts) {
        const itemCopies = !isBulk ? copies : (copiesRule === 'stock' ? Math.max(1, Number(p.stock) || 1) : copies);
        const one = buildLabelHtml(p, appName || 'POS MART', isShelfTag, showName, showSku, showPrice, wMm, hMm);
        for (let c = 0; c < itemCopies; c++) {
          labels += one;
        }
      }

      html = `<!doctype html><html><head><meta charset="utf-8"><title>Cetak Label Stiker - ${appName || 'POS MART'}</title>
        <style>
          @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
          html, body { margin: 0; padding: 0; }
          .lbl { page-break-after: always; break-after: page; border: none !important; }
          .lbl:last-child { page-break-after: auto; break-after: auto; }
        </style></head><body>${labels}</body></html>`;
    }

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow!.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      setTimeout(() => document.body.removeChild(iframe), 1500);
    }, 350);
  };

  if (targetProducts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
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
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '24px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            animation: 'sheetSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div>
              {isBulk ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  <Layers size={13} /> Cetak Masal / Keseluruhan
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  <Tag size={13} /> Cetak Label Satuan
                </div>
              )}
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                {isBulk ? `Cetak Barcode (${targetProducts.length} Produk)` : 'Cetak Label & Barcode Produk'}
              </h3>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#f3f4f6',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} color="#6b7280" />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
            {/* Status Printer Bluetooth */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '10px',
                background: isConnected ? '#ecfdf5' : '#f8fafc',
                border: `1px solid ${isConnected ? '#a7f3d0' : '#e2e8f0'}`,
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bluetooth size={18} color={isConnected ? '#059669' : '#64748b'} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: isConnected ? '#065f46' : '#334155' }}>
                    {isConnected ? `Printer Bluetooth: ${deviceName || 'Terhubung'}` : 'Printer Bluetooth Belum Terhubung'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {isConnected ? 'Siap mencetak stiker secara langsung' : 'Klik tombol sambungkan untuk cetak wireless'}
                  </div>
                </div>
              </div>
              {!isConnected && (
                <button
                  onClick={() => connect()}
                  disabled={isConnecting}
                  className="bo-btn"
                  style={{
                    padding: '6px 12px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {isConnecting ? <RefreshCw size={12} className="animate-spin" /> : <Bluetooth size={12} />} Sambungkan
                </button>
              )}
            </div>

            {/* Notification alert / Progress Bar */}
            {printProgress && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  marginBottom: '12px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1e40af',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Sedang mengirim ke printer...</span>
                  <strong>{printProgress.current} / {printProgress.total} Stiker</strong>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#dbeafe', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: '#2563eb',
                      width: `${Math.round((printProgress.current / printProgress.total) * 100)}%`,
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
              </div>
            )}

            {statusMsg && !printProgress && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: statusMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  color: statusMsg.type === 'success' ? '#166534' : '#991b1b',
                  border: `1px solid ${statusMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                }}
              >
                {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{statusMsg.text}</span>
              </div>
            )}

            {/* Opsi Mode Cetak Masal (Aturan Jumlah Salinan) */}
            {isBulk && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Aturan Jumlah Stiker Masal:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setCopiesRule('fixed')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: copiesRule === 'fixed' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: copiesRule === 'fixed' ? '#eff6ff' : '#ffffff',
                      color: copiesRule === 'fixed' ? '#1e40af' : '#475569',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    🏷️ 1 Label per Produk
                    <div style={{ fontSize: '11px', fontWeight: 500, color: '#64748b', marginTop: '2px' }}>
                      Untuk Price Tag rak toko
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCopiesRule('stock')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: copiesRule === 'stock' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: copiesRule === 'stock' ? '#eff6ff' : '#ffffff',
                      color: copiesRule === 'stock' ? '#1e40af' : '#475569',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    📦 Sesuai Stok Produk
                    <div style={{ fontSize: '11px', fontWeight: 500, color: '#64748b', marginTop: '2px' }}>
                      Untuk ditempel ke fisik barang
                    </div>
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569' }}>
                  <span>
                    Total: <strong style={{ color: '#0f172a' }}>{targetProducts.length} Produk</strong>
                  </span>
                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: '6px', fontWeight: 800 }}>
                    {totalLabelsCount} Lembar Stiker
                  </span>
                </div>
              </div>
            )}

            {/* Mode & Ukuran Switcher */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={() => setIsShelfTag(false)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: !isShelfTag ? '2px solid var(--primary, #dc2626)' : '1px solid #e5e7eb',
                  background: !isShelfTag ? '#fff1f2' : '#ffffff',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  color: !isShelfTag ? 'var(--primary, #dc2626)' : '#4b5563',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                📦 Stiker Produk
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginTop: '2px' }}>Barcode dominan</div>
              </button>

              <button
                type="button"
                onClick={() => setIsShelfTag(true)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: isShelfTag ? '2px solid var(--primary, #dc2626)' : '1px solid #e5e7eb',
                  background: isShelfTag ? '#fff1f2' : '#ffffff',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  color: isShelfTag ? 'var(--primary, #dc2626)' : '#4b5563',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                🏷️ Label Rak (Price Tag)
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginTop: '2px' }}>Harga besar mencolok</div>
              </button>
            </div>

            {/* Pilihan Ukuran Kertas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', marginRight: '4px' }}>Ukuran:</span>
              {(['40x30', '50x30', '33x15'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setLabelSize(sz)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: labelSize === sz ? 700 : 500,
                    background: labelSize === sz ? '#111827' : '#f3f4f6',
                    color: labelSize === sz ? '#ffffff' : '#374151',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {sz === '40x30' ? '40×30 mm (Standar)' : sz === '50x30' ? '50×30 mm (Lebar)' : '33×15 mm (Kecil)'}
                </button>
              ))}
            </div>

            {/* Pilihan Format Cetak Browser untuk Bulk Mode */}
            {isBulk && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Format Browser:</span>
                <button
                  type="button"
                  onClick={() => setLayoutMode('roll')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: layoutMode === 'roll' ? 700 : 500,
                    background: layoutMode === 'roll' ? '#2563eb' : 'transparent',
                    color: layoutMode === 'roll' ? '#ffffff' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  📜 Thermal Roll
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('a4_grid')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: layoutMode === 'a4_grid' ? 700 : 500,
                    background: layoutMode === 'a4_grid' ? '#2563eb' : 'transparent',
                    color: layoutMode === 'a4_grid' ? '#ffffff' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  📑 Lembaran A4 (Grid Stiker)
                </button>
              </div>
            )}

            {/* Pratinjau Visual Label Realtime */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '18px 12px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px',
              }}
            >
              {isBulk && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((prev) => (prev > 0 ? prev - 1 : targetProducts.length - 1))}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #cbd5e1', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                    Pratinjau Produk: <strong>{previewIndex + 1}</strong> dari <strong>{targetProducts.length}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((prev) => (prev < targetProducts.length - 1 ? prev + 1 : 0))}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #cbd5e1', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              <div
                style={{
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  borderRadius: '4px',
                  transform: 'scale(1.4)',
                  transformOrigin: 'center center',
                  margin: '16px 0',
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                Pratinjau visual label thermal ({wMm}×{hMm} mm)
              </div>
            </div>

            {/* Opsi Konten & Kuantitas */}
            <div
              style={{
                background: '#f9fafb',
                padding: '12px 16px',
                borderRadius: '12px',
                marginBottom: '16px',
                border: '1px solid #f3f4f6',
              }}
            >
              {!isBulk && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>Jumlah Cetak (Salinan):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: 'white',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={copies}
                      onChange={(e) => setCopies(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                      style={{
                        width: '56px',
                        textAlign: 'center',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontWeight: 800,
                        fontSize: '14px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setCopies((prev) => Math.min(500, prev + 1))}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: 'white',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', paddingTop: !isBulk ? '6px' : '0', borderTop: !isBulk ? '1px dashed #e5e7eb' : 'none' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#4b5563', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
                  Nama Produk
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#4b5563', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showSku} onChange={(e) => setShowSku(e.target.checked)} />
                  Kode SKU
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#4b5563', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
                  Harga Jual
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              paddingTop: '12px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              className="bo-btn"
              onClick={handlePrintBrowser}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                color: '#374151',
                fontWeight: 700,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              {isBulk && layoutMode === 'a4_grid' ? <FileText size={16} /> : <Printer size={16} />}
              {isBulk ? (layoutMode === 'a4_grid' ? 'Cetak Lembaran A4' : 'Cetak Roll USB') : 'Browser / USB'}
            </button>

            <button
              type="button"
              disabled={isPrintingBt}
              className="bo-btn"
              onClick={handlePrintBluetooth}
              style={{
                flex: 1.4,
                padding: '12px 14px',
                borderRadius: '10px',
                background: isConnected ? '#059669' : 'var(--primary, #dc2626)',
                border: 'none',
                color: 'white',
                fontWeight: 700,
                fontSize: '13.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {isPrintingBt ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  {printProgress ? `Mencetak ${printProgress.current}/${printProgress.total}...` : 'Mengirim data...'}
                </>
              ) : (
                <>
                  <Bluetooth size={16} />
                  {isBulk ? `Cetak ${totalLabelsCount} Stiker Bluetooth` : `Cetak Stiker Bluetooth`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BarcodeLabelModal;
