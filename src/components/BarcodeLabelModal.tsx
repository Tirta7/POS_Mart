import React, { useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X } from 'lucide-react';

// Ukuran stiker thermal
const LABEL_W_MM = 40;
const LABEL_H_MM = 30;

interface LabelProduct {
  id: string;
  barcode?: string;
  sku?: string;
  name: string;
  sellingPrice: number;
}

interface Props {
  product: LabelProduct;
  initialCopies?: number;
  onClose: () => void;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const buildBarcodeSvg = (code: string): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, {
    format: 'CODE128',
    width: 2,
    height: 50,
    margin: 0,
    displayValue: true,
    fontSize: 16,
    textMargin: 2,
    font: 'monospace',
  });
  // Jadikan skalabel: ukuran akhir diatur lewat CSS (mm)
  const w = svg.getAttribute('width');
  const h = svg.getAttribute('height');
  if (w && h) svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('style', 'width:100%;height:100%;display:block;');
  return svg.outerHTML;
};

const buildLabelHtml = (p: LabelProduct, showName: boolean, showSku: boolean, showPrice: boolean): string => {
  const code = p.barcode || p.id;
  const nameBlock = showName
    ? `<div style="font:bold 8pt Arial,sans-serif;line-height:1.1;max-height:2.2em;overflow:hidden;text-align:center;">${escapeHtml(p.name)}</div>`
    : '';
  const skuBlock = showSku && p.sku
    ? `<div style="font:6.5pt Arial,sans-serif;line-height:1.1;text-align:center;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">SKU: ${escapeHtml(p.sku)}</div>`
    : '';
  const priceBlock = showPrice
    ? `<div style="font:bold 11pt Arial,sans-serif;text-align:center;">Rp ${p.sellingPrice.toLocaleString('id-ID')}</div>`
    : '';
  return `<div class="lbl" style="width:${LABEL_W_MM}mm;height:${LABEL_H_MM}mm;box-sizing:border-box;padding:1.5mm 2mm;display:flex;flex-direction:column;justify-content:space-between;align-items:stretch;overflow:hidden;background:#fff;color:#000;">
    <div>${nameBlock}${skuBlock}</div>
    <div style="flex:1;min-height:0;margin:0.5mm 0;">${buildBarcodeSvg(code)}</div>
    ${priceBlock}
  </div>`;
};

const BarcodeLabelModal: React.FC<Props> = ({ product, initialCopies = 1, onClose }) => {
  const [copies, setCopies] = useState<number>(Math.max(1, Math.floor(initialCopies)));
  const [showName, setShowName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  const code = product.barcode || product.id;

  const previewHtml = useMemo(
    () => buildLabelHtml(product, showName, showSku, showPrice),
    [product, showName, showSku, showPrice]
  );

  const handlePrint = () => {
    const one = buildLabelHtml(product, showName, showSku, showPrice);
    const labels = Array.from({ length: Math.max(1, copies) }, () => one).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label ${escapeHtml(code)}</title>
      <style>
        @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .lbl { page-break-after: always; break-after: page; }
        .lbl:last-child { page-break-after: auto; break-after: auto; }
      </style></head><body>${labels}</body></html>`;

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
    }, 300);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '22px', width: '420px', maxWidth: '94%', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={18} color="var(--primary)" /> Cetak Label Barcode
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} color="#6b7280" />
          </button>
        </div>

        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
          Stiker thermal {LABEL_W_MM}×{LABEL_H_MM} mm &bull; Code128 &bull; <strong style={{ fontFamily: 'monospace', color: '#111' }}>{code}</strong>
        </div>

        {/* Pratinjau (persis sama dengan hasil cetak) */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', background: '#f3f4f6', borderRadius: '10px', marginBottom: '14px' }}>
          <div
            style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.18)', zoom: 1.8 } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
            Jumlah label
            <input
              type="number"
              min={1}
              max={1000}
              value={copies}
              onChange={(e) => setCopies(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
              className="bo-input"
              style={{ width: '80px' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Nama
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={showSku} onChange={(e) => setShowSku(e.target.checked)} /> SKU
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Harga
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="bo-btn bo-btn-secondary" onClick={onClose}>Tutup</button>
          <button className="bo-btn bo-btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={16} /> Cetak {copies} Label
          </button>
        </div>

        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '10px', lineHeight: 1.4 }}>
          Di dialog print: pilih printer thermal, ukuran kertas {LABEL_W_MM}×{LABEL_H_MM} mm, margin “None”, skala 100%.
        </div>
      </div>
    </div>
  );
};

export default BarcodeLabelModal;
