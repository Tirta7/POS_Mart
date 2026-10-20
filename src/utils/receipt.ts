import JsBarcode from 'jsbarcode';
import type { SalesTransaction } from '../types';
import { useInventoryStore } from '../store/useInventoryStore';
import { useSettingsStore, DEFAULT_INVOICE_FOOTER, defaultInvoiceHeader } from '../store/useSettingsStore';

export interface ReceiptOptions {
  storeName: string;
  customerName?: string;
  orderType?: string;
  taxEnabled?: boolean;
  taxRate?: number;
}

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const idr = (n: number) => Math.round(n || 0).toLocaleString('id-ID');
const rp = (n: number) => 'Rp ' + idr(n);
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

const ORDER_LABEL: Record<string, string> = {
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Grosir / Partai',
  DELIVERY: 'Delivery',
};

/** Barcode Code128 (SVG) dari nomor nota, agar nota bisa dipindai lagi. */
const barcodeSvg = (code: string): string => {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, { format: 'CODE128', width: 1.6, height: 34, margin: 0, displayValue: false });
    const w = parseFloat(svg.getAttribute('width') || '0');
    const h = parseFloat(svg.getAttribute('height') || '0');
    if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('style', 'width:100%;height:34px;display:block;');
    return svg.outerHTML;
  } catch {
    return '';
  }
};

/** Bangun dokumen HTML struk (lebar kertas thermal 80mm). Dipakai untuk pratinjau & cetak. */
export const buildReceiptHtml = (sale: SalesTransaction, opts: ReceiptOptions): string => {
  const products = useInventoryStore.getState().products;
  const d = new Date(sale.date);
  const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const printedAt = new Date().toLocaleString('id-ID');
  const totalQty = sale.items.reduce((s, i) => s + i.qty, 0);
  const isCash = sale.paymentMethod === 'TUNAI';
  const noNota = sale.id.replace('INV-', '');
  const customer = opts.customerName || 'Umum';

  // Header & footer dari Pengaturan > INVOICE (kosong = default)
  const st = useSettingsStore.getState();
  const rawHeader = (st.invoiceHeader || '').trim() ? st.invoiceHeader : defaultInvoiceHeader(opts.storeName);
  const headerLines = rawHeader.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  const storeTitle = headerLines[0] || opts.storeName || 'POS MART';
  const storeSubtitleLines = headerLines.slice(1);

  const rawFooter = (st.invoiceFooter || '').trim() ? st.invoiceFooter : DEFAULT_INVOICE_FOOTER;
  const footerLines = rawFooter.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

  const logoHtml = st.appLogo 
    ? `<div class="center" style="margin-bottom: 6px;">
        <img src="${st.appLogo}" alt="Logo" class="receipt-logo" />
       </div>`
    : '';

  const itemsHtml = sale.items
    .map((i, idx) => {
      const p = products.find(x => x.id === i.productId);
      const unit = p?.unit || 'Pcs';
      const isCustom = Boolean(i.isCustomPrice || (i.originalPrice && i.originalPrice !== i.price));
      const customLabel = i.customPriceNote ? `* Special: ${esc(i.customPriceNote)}` : '* Special Price';
      const origNote = (isCustom && i.originalPrice) ? ` (Normal: ${idr(i.originalPrice)})` : '';
      return `
      <div class="item">
        <div class="item-name"><span class="item-num">${idx + 1}.</span> ${esc(i.name)}</div>
        ${i.variantName ? `<div class="item-sub">Varian: ${esc(i.variantName)}</div>` : ''}
        ${p?.sku ? `<div class="item-sub">SKU: ${esc(p.sku)}</div>` : ''}
        ${isCustom ? `<div class="item-sub item-custom">${customLabel}${origNote}</div>` : ''}
        <div class="item-row">
          <span class="item-qty">${num(i.qty)} ${esc(unit)} × ${idr(i.price)}</span>
          <span class="item-amount">${idr(i.subtotal)}</span>
        </div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Struk ${esc(sale.id)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: 80mm;
    padding: 4mm 4mm 6mm;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    line-height: 1.35;
    color: #000;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .center { text-align: center; }
  img.receipt-logo {
    display: inline-block;
    max-width: 22mm;
    max-height: 22mm;
    object-fit: contain;
    border-radius: 50%;
    margin: 0 auto;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .store-name {
    font-size: 14.5px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.2;
    color: #000;
    margin-bottom: 2px;
  }
  .store-sub {
    font-size: 10.5px;
    color: #333;
    line-height: 1.35;
  }
  .receipt-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #222;
    border: 1px solid #222;
    border-radius: 3px;
    padding: 1px 6px;
    margin-top: 4px;
    margin-bottom: 2px;
    text-transform: uppercase;
  }
  .dash { border: 0; border-top: 1px dashed #777; margin: 6px 0; }
  .solid { border: 0; border-top: 1.5px solid #000; margin: 6px 0; }
  
  /* Meta Grid */
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 3mm;
    row-gap: 2px;
    font-size: 10.5px;
  }
  .meta-cell {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
  }
  .meta-k { color: #555; font-weight: 500; flex-shrink: 0; }
  .meta-v { color: #000; font-weight: 700; text-align: right; overflow-wrap: anywhere; }

  /* Items */
  .items-head {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #222;
    padding: 2px 0;
  }
  .item {
    margin-bottom: 5px;
  }
  .item-name {
    font-size: 11.5px;
    font-weight: 700;
    color: #000;
    line-height: 1.25;
    word-break: break-word;
  }
  .item-num {
    display: inline-block;
    min-width: 3.5mm;
  }
  .item-sub {
    font-size: 9.5px;
    color: #555;
    padding-left: 3.5mm;
    font-family: monospace;
  }
  .item-custom {
    color: #dc2626;
    font-weight: 700;
  }
  .item-row {
    display: flex;
    justify-content: space-between;
    padding-left: 3.5mm;
    margin-top: 1px;
  }
  .item-qty {
    font-size: 10.5px;
    color: #444;
  }
  .item-amount {
    font-size: 11.5px;
    font-weight: 700;
    color: #000;
    text-align: right;
    white-space: nowrap;
  }

  /* Summary Row */
  .sum-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #333;
    padding: 1.5px 0;
  }
  .sum-row.bold {
    font-weight: 700;
    color: #000;
  }

  /* Grand Total Box */
  .grand-total-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding: 5px 0;
    margin: 5px 0;
  }
  .gt-label {
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
  .gt-val {
    font-size: 15.5px;
    font-weight: 900;
    letter-spacing: -0.3px;
  }

  /* Footer */
  .barcode-wrap {
    width: 65%;
    margin: 6px auto 2px;
  }
  .nota-code {
    font-family: monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #333;
    margin-top: 1px;
  }
  .footer-msg {
    font-size: 10px;
    color: #444;
    line-height: 1.35;
    margin-top: 4px;
  }
  .print-time {
    font-size: 9px;
    color: #888;
    margin-top: 4px;
  }
</style></head>
<body>
  ${logoHtml}
  <div class="center">
    <div class="store-name">${esc(storeTitle)}</div>
    ${storeSubtitleLines.map(l => `<div class="store-sub">${esc(l)}</div>`).join('')}
    <div><span class="receipt-badge">STRUK PEMBELIAN</span></div>
  </div>

  <hr class="dash" />

  <div class="meta-grid">
    <div class="meta-cell"><span class="meta-k">No. Nota</span><span class="meta-v">${esc(noNota)}</span></div>
    <div class="meta-cell"><span class="meta-k">Tgl</span><span class="meta-v">${tgl}</span></div>
    <div class="meta-cell"><span class="meta-k">Kasir</span><span class="meta-v">${esc(sale.employeeName || '-')}</span></div>
    <div class="meta-cell"><span class="meta-k">Jam</span><span class="meta-v">${jam}</span></div>
    <div class="meta-cell"><span class="meta-k">Pelanggan</span><span class="meta-v">${esc(customer)}</span></div>
    <div class="meta-cell"><span class="meta-k">Tipe</span><span class="meta-v">${esc(opts.orderType ? (ORDER_LABEL[opts.orderType] || opts.orderType) : 'Reguler')}</span></div>
  </div>

  <hr class="dash" />
  <div class="items-head"><span>ITEM</span><span>JUMLAH (Rp)</span></div>
  <hr class="dash" />

  ${itemsHtml}

  <hr class="dash" />

  <div class="sum-row"><span>Total Item</span><span style="font-weight:700;">${sale.items.length} jenis / ${num(totalQty)} qty</span></div>
  <div class="sum-row"><span>Subtotal</span><span>${rp(sale.subtotal)}</span></div>
  ${sale.tax > 0 ? `<div class="sum-row"><span>PPN (${opts.taxEnabled && opts.taxRate ? `${opts.taxRate}%` : '11%'})</span><span>${rp(sale.tax)}</span></div>` : ''}
  ${sale.rounding ? `<div class="sum-row"><span>Pembulatan</span><span>${rp(sale.rounding)}</span></div>` : ''}

  <div class="grand-total-box">
    <span class="gt-label">TOTAL</span>
    <span class="gt-val">${rp(sale.total)}</span>
  </div>

  <div class="sum-row"><span>Metode Bayar</span><span style="font-weight:700;">${esc(sale.paymentMethod || 'TUNAI')}</span></div>
  ${sale.paymentMethod === 'TEMPO' || (sale.paymentStatus && sale.paymentStatus !== 'PAID') ? `
  <div class="sum-row"><span>Status Pembayaran</span><span style="font-weight:700;color:${sale.paymentStatus === 'PAID' ? '#16a34a' : '#d97706'};">${sale.paymentStatus === 'PAID' ? 'LUNAS' : sale.paymentStatus === 'PARTIAL' ? 'CICILAN (SEBAGIAN)' : 'TEMPO (BELUM DIBAYAR)'}</span></div>
  <div class="sum-row"><span>Total Terbayar (DP)</span><span style="font-weight:700;">${rp(sale.paidAmount || 0)}</span></div>
  <div class="sum-row bold" style="font-size:11.5px;color:#dc2626;"><span>Sisa Piutang / Tagihan</span><span style="font-weight:900;">${rp(sale.remainingAmount != null ? sale.remainingAmount : (sale.total - (sale.paidAmount || 0)))}</span></div>
  ${sale.dueDate ? `<div class="sum-row"><span>Jatuh Tempo</span><span style="font-weight:700;">${new Date(sale.dueDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>` : ''}
  ` : `
  <div class="sum-row"><span>${isCash ? 'Tunai Diterima' : 'Dibayar'}</span><span>${rp(isCash ? (sale.tendered || sale.total) : sale.total)}</span></div>
  ${isCash ? `<div class="sum-row bold" style="font-size:11.5px;margin-top:1px;"><span>Kembalian</span><span style="font-weight:900;">${rp(sale.change || 0)}</span></div>` : ''}
  `}
  ${sale.status === 'VOID' ? `<div style="text-align:center;padding:4px;margin-top:6px;border:1.5px solid #dc2626;color:#dc2626;font-weight:900;font-size:12px;letter-spacing:1.5px;">NOTA DIBATALKAN (VOID)</div>` : ''}

  <hr class="dash" />

  <div class="barcode-wrap">${barcodeSvg(sale.id)}</div>
  <div class="center nota-code">${esc(sale.id)}</div>

  <hr class="dash" />

  <div class="center footer-msg">
    ${footerLines.map(l => `<div>${esc(l)}</div>`).join('')}
    <div class="print-time">Dicetak: ${esc(printedAt)}</div>
  </div>
</body></html>`;
};

/** Cetak struk lewat iframe tersembunyi (memunculkan dialog cetak browser / printer thermal). */
export const printReceipt = (sale: SalesTransaction, opts: ReceiptOptions) => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(buildReceiptHtml(sale, opts));
  doc.close();

  const win = iframe.contentWindow;

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  };

  // Pastikan seluruh gambar (termasuk logo) selesai termuat sebelum dialog cetak dibuka
  const imgs = Array.from(doc.images || []);
  if (imgs.length > 0) {
    let pending = imgs.length;
    let hasPrinted = false;

    const onDone = () => {
      pending--;
      if (pending <= 0 && !hasPrinted) {
        hasPrinted = true;
        setTimeout(triggerPrint, 150);
      }
    };

    imgs.forEach(img => {
      if (img.complete) {
        onDone();
      } else {
        img.onload = onDone;
        img.onerror = onDone;
      }
    });

    // Fallback safety timeout 650ms
    setTimeout(() => {
      if (!hasPrinted) {
        hasPrinted = true;
        triggerPrint();
      }
    }, 650);
  } else {
    setTimeout(triggerPrint, 250);
  }
};
