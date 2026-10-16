import JsBarcode from 'jsbarcode';
import type { SalesTransaction } from '../types';
import { useInventoryStore } from '../store/useInventoryStore';
import { useSettingsStore } from '../store/useSettingsStore';

export interface DistributorInvoiceOptions {
  storeName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyNpwp?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  poNumber?: string;
  paymentTerms?: string; // e.g. "Cash / Tunai", "Tempo 14 Hari", "COD"
  dueDate?: string;
  notes?: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  paperSize?: 'A4' | 'A5';
  title?: string; // "FAKTUR PENJUALAN" | "SURAT JALAN" | "INVOICE DISTRIBUTOR"
}

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const idr = (n: number) => Math.round(n || 0).toLocaleString('id-ID');
const rp = (n: number) => 'Rp ' + idr(n);
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * Konversi angka numerik ke teks terbilang dalam Rupiah
 * Contoh: 1.250.000 -> "Satu Juta Dua Ratus Lima Puluh Ribu Rupiah"
 */
export function terbilang(n: number): string {
  const bilangan = Math.floor(Math.abs(n));
  if (bilangan === 0) return 'Nol Rupiah';

  const angka = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function kata(num: number): string {
    if (num < 12) {
      return angka[num];
    } else if (num < 20) {
      return kata(num - 10) + ' Belas';
    } else if (num < 100) {
      return kata(Math.floor(num / 10)) + ' Puluh ' + kata(num % 10);
    } else if (num < 200) {
      return 'Seratus ' + kata(num - 100);
    } else if (num < 1000) {
      return kata(Math.floor(num / 100)) + ' Ratus ' + kata(num % 100);
    } else if (num < 2000) {
      return 'Seribu ' + kata(num - 1000);
    } else if (num < 1000000) {
      return kata(Math.floor(num / 1000)) + ' Ribu ' + kata(num % 1000);
    } else if (num < 1000000000) {
      return kata(Math.floor(num / 1000000)) + ' Juta ' + kata(num % 1000000);
    } else if (num < 1000000000000) {
      return kata(Math.floor(num / 1000000000)) + ' Miliar ' + kata(num % 1000000000);
    } else {
      return kata(Math.floor(num / 1000000000000)) + ' Triliun ' + kata(num % 1000000000000);
    }
  }

  const hasil = kata(bilangan).replace(/\s+/g, ' ').trim();
  return `${hasil} Rupiah`;
}

/**
 * Barcode SVG untuk No. Faktur / Invoice
 */
const generateBarcodeSvg = (code: string): string => {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, { format: 'CODE128', width: 1.5, height: 32, margin: 0, displayValue: false });
    const w = parseFloat(svg.getAttribute('width') || '0');
    const h = parseFloat(svg.getAttribute('height') || '0');
    if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('style', 'width:140px;height:32px;display:block;');
    return svg.outerHTML;
  } catch {
    return '';
  }
};

/**
 * Membangun dokumen HTML Faktur Penjualan / Invoice Komersial Standar Kertas A4
 * Khusus untuk kebutuhan B2B, Distributor, Grosir, dan Pengiriman Resmi.
 */
export const buildDistributorInvoiceHtml = (sale: SalesTransaction, opts: DistributorInvoiceOptions): string => {
  const products = useInventoryStore.getState().products;
  const st = useSettingsStore.getState();

  const d = new Date(sale.date);
  const tanggalFaktur = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const waktuFaktur = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const printedAt = new Date().toLocaleString('id-ID');

  const invoiceTitle = opts.title || 'FAKTUR PENJUALAN';
  const paperSize = opts.paperSize || 'A4';

  const companyName = opts.storeName || st.appName || 'POS MART DISTRIBUSI';
  const companyAddress = opts.companyAddress || st.companyAddress || localStorage.getItem('pos_dist_comp_address') || 'Jl. Raya Pusat Distribusi No. 88, Pergudangan Bisnis';
  const companyPhone = opts.companyPhone || st.companyPhone || localStorage.getItem('pos_dist_comp_phone') || '0812-3456-7890';
  const companyEmail = opts.companyEmail || st.companyEmail || localStorage.getItem('pos_dist_comp_email') || 'info@posmart.id';
  const companyNpwp = opts.companyNpwp || st.companyNpwp || localStorage.getItem('pos_dist_comp_npwp') || '-';

  const bankName = opts.bankName || st.bankName || localStorage.getItem('pos_dist_bank_name') || 'BCA (Bank Central Asia)';
  const bankAccount = opts.bankAccount || st.bankAccount || localStorage.getItem('pos_dist_bank_acc') || '8830-192-888';
  const bankHolder = opts.bankHolder || st.bankHolder || localStorage.getItem('pos_dist_bank_holder') || companyName;

  const notes = opts.notes || st.distributorTerms || localStorage.getItem('pos_dist_terms') || '1. Barang yang sudah diterima dalam kondisi baik tidak dapat dikembalikan tanpa persetujuan tertulis.\n2. Pembayaran bilyet giro/transfer dianggap sah setelah dana efektif masuk ke rekening.\n3. Komplain maksimal 2x24 jam sejak barang diterima bersama faktur asli.';

  const customerName = opts.customerName || sale.customerName || 'Distributor / Rekanan B2B';
  const customerAddress = opts.customerAddress || localStorage.getItem(`cust_addr_${sale.customerId}`) || 'Alamat tujuan pengiriman';
  const customerPhone = opts.customerPhone || '-';

  const paymentTerms = opts.paymentTerms || (sale.paymentMethod === 'TUNAI' ? 'Tunai / Cash' : sale.paymentMethod);
  const poNumber = opts.poNumber || '-';
  const dueDate = opts.dueDate || tanggalFaktur;

  const totalQty = sale.items.reduce((s, i) => s + i.qty, 0);

  // Tabel Items
  const itemsHtml = sale.items
    .map((item, idx) => {
      const p = products.find(x => x.id === item.productId);
      const unit = p?.unit || 'Pcs';
      const isCustom = Boolean(item.isCustomPrice || (item.originalPrice && item.originalPrice !== item.price));
      const discountPerItem = isCustom && item.originalPrice && item.originalPrice > item.price
        ? item.originalPrice - item.price
        : 0;

      return `
        <tr class="${idx % 2 === 1 ? 'even-row' : ''}">
          <td class="text-center">${idx + 1}</td>
          <td class="font-mono text-muted text-center">${esc(p?.sku || '-')}</td>
          <td>
            <div class="product-name font-bold">${esc(item.name)}</div>
            ${item.variantName ? `<div class="sub-text text-primary">Varian: ${esc(item.variantName)}</div>` : ''}
            ${item.customPriceNote ? `<div class="sub-text text-warning font-semibold">* Catatan: ${esc(item.customPriceNote)}</div>` : ''}
          </td>
          <td class="text-center font-bold">${num(item.qty)}</td>
          <td class="text-center text-muted">${esc(unit)}</td>
          <td class="text-right">${idr(item.originalPrice || item.price)}</td>
          <td class="text-right text-muted">${discountPerItem > 0 ? idr(discountPerItem) : '-'}</td>
          <td class="text-right font-bold">${idr(item.subtotal)}</td>
        </tr>
      `;
    })
    .join('');

  const logoHtml = st.appLogo
    ? `<img src="${st.appLogo}" alt="Logo" class="company-logo" />`
    : `<div class="company-logo-text">${esc(companyName.charAt(0))}</div>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${esc(invoiceTitle)} - ${esc(sale.id)}</title>
  <style>
    @page {
      size: ${paperSize === 'A5' ? 'A5 landscape' : 'A4 portrait'};
      margin: 12mm 14mm 12mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #1e293b;
      background: #f8fafc;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-wrapper {
      max-width: 210mm;
      min-height: 275mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 18mm 18mm;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
      }
      .invoice-wrapper {
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      .no-print {
        display: none !important;
      }
    }

    /* HEADER & KOP PERUSAHAAN */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
    }
    .header-table td {
      vertical-align: top;
    }
    .company-logo {
      max-width: 160px;
      max-height: 60px;
      object-fit: contain;
      margin-bottom: 6px;
    }
    .company-logo-text {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .company-name {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
      margin-bottom: 2px;
      text-transform: uppercase;
    }
    .company-desc {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.35;
      max-width: 320px;
    }
    .title-box {
      text-align: right;
    }
    .doc-title {
      font-size: 22px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .doc-number {
      font-size: 13px;
      font-weight: 700;
      color: #2563eb;
      font-family: "Courier New", Courier, monospace;
      margin-bottom: 4px;
    }
    .badge-paid {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 6px;
      background: #ecfdf5;
      color: #059669;
      border: 1px solid #10b981;
      font-weight: 800;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* INFO TRANSAKSI & DISTRIBUTOR */
    .info-grid {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 18px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .info-col {
      flex: 1;
    }
    .info-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 3px;
    }
    .target-name {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .target-detail {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.35;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 10.5px;
    }
    .meta-label {
      color: #64748b;
      font-weight: 500;
    }
    .meta-value {
      font-weight: 700;
      color: #0f172a;
      text-align: right;
    }

    /* TABEL PRODUK */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .items-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 7px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border: 1px solid #0f172a;
    }
    .items-table td {
      padding: 7px 8px;
      font-size: 10.5px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    .even-row {
      background: #f8fafc;
    }
    .product-name {
      font-size: 11px;
      color: #0f172a;
    }
    .sub-text {
      font-size: 9.5px;
      margin-top: 1px;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-muted { color: #64748b; }
    .text-primary { color: #2563eb; }
    .text-warning { color: #d97706; }
    .font-mono { font-family: "Courier New", Courier, monospace; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }

    /* REKAPITULASI & TERBILANG */
    .summary-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }
    .summary-left {
      flex: 1.2;
    }
    .summary-right {
      flex: 0.95;
    }
    .terbilang-box {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 12px;
    }
    .terbilang-label {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #1e40af;
      margin-bottom: 2px;
    }
    .terbilang-text {
      font-size: 11px;
      font-weight: 700;
      color: #1e3a8a;
      font-style: italic;
    }

    .bank-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 10.5px;
    }
    .bank-title {
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
      font-size: 10px;
      text-transform: uppercase;
    }

    .calc-table {
      width: 100%;
      border-collapse: collapse;
    }
    .calc-table td {
      padding: 4px 6px;
      font-size: 11px;
    }
    .calc-label {
      color: #475569;
      font-weight: 500;
    }
    .calc-value {
      text-align: right;
      font-weight: 700;
      color: #0f172a;
    }
    .grand-total-row td {
      padding: 8px 6px;
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      background: #f1f5f9;
    }
    .grand-total-label {
      font-size: 12.5px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
    }
    .grand-total-value {
      font-size: 14px;
      font-weight: 900;
      color: #0f172a;
      text-align: right;
    }

    /* SYARAT & KETENTUAN */
    .terms-box {
      font-size: 9.5px;
      color: #64748b;
      margin-bottom: 16px;
      line-height: 1.35;
      background: #ffffff;
      border: 1px dashed #cbd5e1;
      padding: 8px 10px;
      border-radius: 4px;
    }
    .terms-title {
      font-weight: 800;
      color: #334155;
      margin-bottom: 2px;
      text-transform: uppercase;
    }

    /* KOLOM TANDA TANGAN RESMI (4 PIHAK) */
    .signatures-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .signatures-table td {
      width: 25%;
      text-align: center;
      vertical-align: top;
      padding: 0 6px;
    }
    .sig-role {
      font-size: 10px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
      margin-bottom: 48px;
    }
    .sig-name {
      font-size: 10.5px;
      font-weight: 800;
      color: #0f172a;
      border-top: 1px solid #94a3b8;
      padding-top: 4px;
      display: inline-block;
      min-width: 120px;
    }
    .sig-sub {
      font-size: 9px;
      color: #64748b;
      margin-top: 1px;
    }

    /* FOOTER KECIL */
    .print-footer {
      margin-top: 14px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <div>
      <!-- KOP PERUSAHAAN & HEADER -->
      <table class="header-table">
        <tr>
          <td style="width: 55%;">
            ${logoHtml}
            <div class="company-name">${esc(companyName)}</div>
            <div class="company-desc">
              <div>${esc(companyAddress)}</div>
              <div>Telp/WA: <strong>${esc(companyPhone)}</strong> | Email: ${esc(companyEmail)}</div>
              ${companyNpwp && companyNpwp !== '-' ? `<div>NPWP: ${esc(companyNpwp)}</div>` : ''}
            </div>
          </td>
          <td style="width: 45%;">
            <div class="title-box">
              <div class="doc-title">${esc(invoiceTitle)}</div>
              <div class="doc-number">${esc(sale.id)}</div>
              <div style="margin-bottom: 6px;">
                <span class="badge-paid">${esc(sale.paymentMethod)}</span>
              </div>
              <div style="display: inline-block;">
                ${generateBarcodeSvg(sale.id)}
              </div>
            </div>
          </td>
        </tr>
      </table>

      <!-- INFORMASI TRANSAKSI & PELANGGAN B2B / DISTRIBUTOR -->
      <div class="info-grid">
        <div class="info-col">
          <div class="info-title">Ditujukan Kepada (Distributor / Mitra):</div>
          <div class="target-name">${esc(customerName)}</div>
          <div class="target-detail">
            <div>${esc(customerAddress)}</div>
            <div>Kontak: ${esc(customerPhone)}</div>
          </div>
        </div>
        <div class="info-col" style="border-left: 1px dashed #cbd5e1; padding-left: 16px;">
          <div class="info-title">Detail Faktur & Pengiriman:</div>
          <div class="meta-row">
            <span class="meta-label">Tanggal Faktur:</span>
            <span class="meta-value">${esc(tanggalFaktur)} (${esc(waktuFaktur)})</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">No. PO / Ref:</span>
            <span class="meta-value">${esc(poNumber)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Jatuh Tempo:</span>
            <span class="meta-value">${esc(dueDate)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Termin Pembayaran:</span>
            <span class="meta-value">${esc(paymentTerms)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Petugas / Sales:</span>
            <span class="meta-value">${esc(sale.employeeName || 'Admin')}</span>
          </div>
        </div>
      </div>

      <!-- TABEL RINCIAN PRODUK -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 4%;">No</th>
            <th style="width: 13%;">Kode / SKU</th>
            <th style="width: 35%;">Deskripsi Produk & Varian</th>
            <th style="width: 8%;">Qty</th>
            <th style="width: 8%;">Satuan</th>
            <th style="width: 14%;">Harga Satuan</th>
            <th style="width: 8%;">Potongan</th>
            <th style="width: 14%;">Total (Rp)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- RINGKASAN TOTAL & INFORMASI REKENING -->
      <div class="summary-section">
        <div class="summary-left">
          <div class="terbilang-box">
            <div class="terbilang-label">Terbilang:</div>
            <div class="terbilang-text">"${esc(terbilang(sale.total))}"</div>
          </div>

          <div class="bank-box">
            <div class="bank-title">Pembayaran Transfer Bank:</div>
            <div>Bank: <strong>${esc(bankName)}</strong></div>
            <div>No. Rekening: <strong class="font-mono" style="font-size: 12px; color: #2563eb;">${esc(bankAccount)}</strong></div>
            <div>Atas Nama: <strong>${esc(bankHolder)}</strong></div>
          </div>
        </div>

        <div class="summary-right">
          <table class="calc-table">
            <tr>
              <td class="calc-label">Total Qty Barang:</td>
              <td class="calc-value">${num(totalQty)} item (${sale.items.length} jenis)</td>
            </tr>
            <tr>
              <td class="calc-label">Subtotal:</td>
              <td class="calc-value">${rp(sale.subtotal)}</td>
            </tr>
            ${sale.tax > 0 ? `
            <tr>
              <td class="calc-label">PPN (${st.taxRate}%):</td>
              <td class="calc-value">${rp(sale.tax)}</td>
            </tr>` : ''}
            ${sale.rounding ? `
            <tr>
              <td class="calc-label">Pembulatan:</td>
              <td class="calc-value">${rp(sale.rounding)}</td>
            </tr>` : ''}
            <tr class="grand-total-row">
              <td class="grand-total-label">TOTAL TAGIHAN:</td>
              <td class="grand-total-value">${rp(sale.total)}</td>
            </tr>
            ${sale.paymentMethod === 'TUNAI' ? `
            <tr>
              <td class="calc-label">Tunai Diterima:</td>
              <td class="calc-value">${rp(sale.tendered)}</td>
            </tr>
            <tr>
              <td class="calc-label">Kembalian:</td>
              <td class="calc-value">${rp(sale.change)}</td>
            </tr>` : ''}
          </table>
        </div>
      </div>

      <!-- SYARAT & KETENTUAN -->
      <div class="terms-box">
        <div class="terms-title">Syarat & Ketentuan Faktur:</div>
        <div>${esc(notes).replace(/\n/g, '<br/>')}</div>
      </div>
    </div>

    <!-- TANDA TANGAN RESMI 4 PIHAK -->
    <div>
      <table class="signatures-table">
        <tr>
          <td>
            <div class="sig-role">Dibuat Oleh</div>
            <div class="sig-name">${esc(sale.employeeName || 'Admin Fakturis')}</div>
            <div class="sig-sub">Bagian Administrasi</div>
          </td>
          <td>
            <div class="sig-role">Gudang / Checker</div>
            <div class="sig-name">( .................................... )</div>
            <div class="sig-sub">Pemeriksa Barang</div>
          </td>
          <td>
            <div class="sig-role">Pengemudi / Ekspedisi</div>
            <div class="sig-name">( .................................... )</div>
            <div class="sig-sub">Pengantar Barang</div>
          </td>
          <td>
            <div class="sig-role">Penerima / Distributor</div>
            <div class="sig-name">${esc(customerName)}</div>
            <div class="sig-sub">Cap & Tanda Tangan</div>
          </td>
        </tr>
      </table>

      <div class="print-footer">
        <div>Dicetak oleh sistem pada: ${esc(printedAt)} | Lembar Asli Distributor</div>
        <div>Halaman 1 dari 1</div>
      </div>
    </div>
  </div>
</body>
</html>`;
};

/**
 * Mencetak Faktur Distributor A4 melalui iframe browser
 */
export const printDistributorInvoice = (sale: SalesTransaction, opts: DistributorInvoiceOptions) => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(buildDistributorInvoiceHtml(sale, opts));
  doc.close();
  const win = iframe.contentWindow;
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => document.body.contains(iframe) && document.body.removeChild(iframe), 2000);
  }, 300);
};

export interface PurchaseDocData {
  id: string;
  documentNo: string;
  date: string;
  supplierName: string;
  totalValue: number;
  items: {
    productName?: string;
    productId?: string;
    variantName?: string;
    qty: number;
    unit?: string;
    purchasePrice: number;
    subtotal: number;
  }[];
}

/**
 * Mencetak Faktur Pembelian / PO ke Supplier / Distributor dalam ukuran A4
 */
export const printPurchaseInvoiceA4 = (docData: PurchaseDocData) => {
  const saleDummy: SalesTransaction = {
    id: docData.documentNo || docData.id,
    date: docData.date,
    total: docData.totalValue,
    subtotal: docData.totalValue,
    tax: 0,
    rounding: 0,
    paymentMethod: 'TRANSFER / KREDIT',
    tendered: docData.totalValue,
    change: 0,
    customerName: docData.supplierName,
    employeeName: 'Bagian Pembelian / Purchasing',
    items: docData.items.map(it => ({
      productId: it.productId || it.productName || 'ITEM',
      variantName: it.variantName,
      name: it.productName || it.productId || 'Produk',
      qty: it.qty,
      price: it.purchasePrice,
      subtotal: it.subtotal
    }))
  };

  printDistributorInvoice(saleDummy, {
    storeName: useSettingsStore.getState().appName || 'POS MART',
    customerName: docData.supplierName,
    title: 'FAKTUR PEMBELIAN / PO DISTRIBUTOR',
    paymentTerms: 'Termin Supplier / B2B'
  });
};

