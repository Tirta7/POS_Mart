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
  const headerText = (st.invoiceHeader || '').trim() ? st.invoiceHeader : defaultInvoiceHeader(opts.storeName);
  const footerText = (st.invoiceFooter || '').trim() ? st.invoiceFooter : DEFAULT_INVOICE_FOOTER;
  const textBlock = (text: string) =>
    text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => `<div class="center">${esc(l)}</div>`)
      .join('');

  const cell = (k: string, v: string) => `<div class="c"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const row = (l: string, r: string, cls = '') => `<div class="row ${cls}"><span>${l}</span><span>${r}</span></div>`;

  const items = sale.items
    .map((i, idx) => {
      const p = products.find(x => x.id === i.productId);
      const unit = p?.unit || 'Pcs';
      return `
      <div class="item">
        <div class="iname"><span class="no">${idx + 1}.</span> ${esc(i.name)}</div>
        ${p?.sku ? `<div class="sku">${esc(p.sku)}</div>` : ''}
        <div class="row"><span>${num(i.qty)} ${esc(unit)} x ${idr(i.price)}</span><span class="amt">${idr(i.subtotal)}</span></div>
      </div>`;
    })
    .join('');

  const logoHtml = st.appLogo 
    ? `<div class="center" style="margin-bottom: 8px;"><img src="${st.appLogo}" alt="Logo" style="max-width: 50mm; max-height: 25mm; object-fit: contain; filter: grayscale(100%) brightness(0.6) contrast(2000%);" /></div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Struk ${esc(sale.id)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; font-size: 11px !important; font-weight: 400 !important; letter-spacing: 0 !important; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: 80mm; padding: 3mm 4mm 5mm; font-family: 'Courier New', Consolas, monospace; line-height: 1.3; color: #000; }
  .center { text-align: center; }
  .dash, .solid { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; column-gap: 4mm; row-gap: 2px; }
  .c { display: flex; justify-content: space-between; gap: 4px; min-width: 0; }
  .c .k { flex-shrink: 0; }
  .c .v { text-align: right; overflow-wrap: anywhere; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:last-child { text-align: right; white-space: nowrap; }
  .head { display: flex; justify-content: space-between; }
  .item { margin-bottom: 4px; }
  .iname { word-break: break-word; }
  .iname .no { display: inline-block; min-width: 4mm; }
  .sku { padding-left: 4mm; }
  .item .row { padding-left: 4mm; }
  .barcode { margin: 6px 6mm 2px; }
</style></head>
<body>
  ${logoHtml}
  ${textBlock(headerText)}
  <hr class="dash" />

  <div class="meta">
    ${cell('Nota', esc(noNota))}
    ${cell('Tgl', tgl)}
    ${cell('Kasir', esc(sale.employeeName || '-'))}
    ${cell('Jam', jam)}
    ${cell('Plg', esc(customer))}
    ${cell('Tipe', esc(opts.orderType ? (ORDER_LABEL[opts.orderType] || opts.orderType) : '-'))}
  </div>

  <hr class="solid" />
  <div class="head"><span>ITEM</span><span>JUMLAH (Rp)</span></div>
  <hr class="dash" />
  ${items}
  <hr class="dash" />

  ${row('Total Item', `${sale.items.length} jenis / ${num(totalQty)} qty`)}
  ${row('Subtotal', rp(sale.subtotal))}
  ${sale.tax > 0 ? row(`PPN${opts.taxEnabled && opts.taxRate ? ` (${opts.taxRate}%)` : ''}`, rp(sale.tax)) : ''}
  ${sale.rounding ? row('Pembulatan', rp(sale.rounding)) : ''}
  <hr class="solid" />
  ${row('TOTAL', rp(sale.total), 'grand')}
  <hr class="solid" />
  ${row('Metode Bayar', esc(sale.paymentMethod))}
  ${row(isCash ? 'Tunai Diterima' : 'Dibayar', rp(isCash ? sale.tendered : sale.total))}
  ${isCash ? row('Kembalian', rp(sale.change), 'bold') : ''}
  <hr class="dash" />

  <div class="barcode">${barcodeSvg(sale.id)}</div>
  <div class="center nota">${esc(sale.id)}</div>
  <hr class="dash" />
  ${textBlock(footerText)}
  <div class="center" style="margin-top:4px">Dicetak: ${esc(printedAt)}</div>
</body></html>`;
};

/** Cetak struk lewat iframe tersembunyi (memunculkan dialog cetak browser / printer thermal). */
export const printReceipt = (sale: SalesTransaction, opts: ReceiptOptions) => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(buildReceiptHtml(sale, opts));
  doc.close();
  const win = iframe.contentWindow;
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => document.body.contains(iframe) && document.body.removeChild(iframe), 1500);
  }, 250);
};
