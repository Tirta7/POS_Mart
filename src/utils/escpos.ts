/**
 * ESC/POS Thermal Receipt Command Generator
 * Mendukung format struk thermal 58mm (32 karakter) dan 80mm (48 karakter).
 */

import type { SalesTransaction } from '../types';
import type { ReceiptOptions } from './receipt';
import { useSettingsStore, DEFAULT_INVOICE_FOOTER, defaultInvoiceHeader } from '../store/useSettingsStore';

// ESC/POS Command Constants
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

export interface EscPosOptions {
  paperWidth?: '58mm' | '80mm';
  autoCut?: boolean;
}

export class EscPosBuilder {
  private buffer: number[] = [];
  private width: number;

  constructor(paperWidth: '58mm' | '80mm' = '58mm') {
    this.width = paperWidth === '80mm' ? 48 : 32;
    this.init();
  }

  init(): this {
    this.buffer.push(ESC, 0x40); // Initialize printer
    return this;
  }

  alignCenter(): this {
    this.buffer.push(ESC, 0x61, 0x01);
    return this;
  }

  alignLeft(): this {
    this.buffer.push(ESC, 0x61, 0x00);
    return this;
  }

  alignRight(): this {
    this.buffer.push(ESC, 0x61, 0x02);
    return this;
  }

  bold(enable: boolean = true): this {
    this.buffer.push(ESC, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  doubleSize(enable: boolean = true): this {
    this.buffer.push(GS, 0x21, enable ? 0x11 : 0x00);
    return this;
  }

  doubleHeight(enable: boolean = true): this {
    this.buffer.push(GS, 0x21, enable ? 0x01 : 0x00);
    return this;
  }

  newLine(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code < 128 ? code : 0x20); // Fallback non-ASCII to space
    }
    return this;
  }

  textLine(str: string): this {
    return this.text(str).newLine();
  }

  divider(char: string = '-'): this {
    return this.alignLeft().textLine(char.repeat(this.width));
  }

  doubleDivider(): this {
    return this.divider('=');
  }

  /**
   * Baris 2 kolom: Rata kiri dan Rata kanan pas di batas kertas
   * Contoh: "Indomie Goreng          Rp 3.500"
   */
  twoColumns(left: string, right: string): this {
    const r = right.trim();
    const availableLeft = this.width - r.length - 1;
    let l = left.trim();
    if (l.length > availableLeft) {
      l = l.slice(0, availableLeft);
    }
    const spaces = Math.max(1, this.width - l.length - r.length);
    return this.textLine(l + ' '.repeat(spaces) + r);
  }

  cut(full: boolean = false): this {
    this.newLine(3);
    this.buffer.push(GS, 0x56, full ? 0x00 : 0x01); // Cut command
    return this;
  }

  getUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Format angka ke format Rupiah standar struk (tanpa simbol Rp agar hemat kolom)
 */
const fmtNum = (n: number | undefined): string => {
  return Number(n || 0).toLocaleString('id-ID');
};

/**
 * Generate binary ESC/POS untuk Struk Uji Coba Printer Bluetooth
 */
export const buildTestReceiptBytes = (storeName: string, options: EscPosOptions = {}): Uint8Array => {
  const pWidth = options.paperWidth || '58mm';
  const builder = new EscPosBuilder(pWidth);

  builder
    .alignCenter()
    .bold(true)
    .doubleSize(true)
    .textLine(storeName || 'POS MART')
    .doubleSize(false)
    .textLine('UJI COBA PRINTER BLUETOOTH')
    .bold(false)
    .divider('-')
    .alignLeft()
    .twoColumns('Koneksi', 'Bluetooth ESC/POS')
    .twoColumns('Lebar Kertas', pWidth)
    .twoColumns('Status', 'BERHASIL TERHUBUNG')
    .twoColumns('Waktu', new Date().toLocaleTimeString('id-ID'))
    .twoColumns('Tanggal', new Date().toLocaleDateString('id-ID'))
    .divider('-')
    .alignCenter()
    .bold(true)
    .textLine('*** PRINTER SIAP DIGUNAKAN ***')
    .bold(false)
    .textLine('Terima kasih telah menggunakan')
    .textLine('Sistem POS Swalayan Pintar')
    .newLine(2);

  if (options.autoCut) {
    builder.cut();
  } else {
    builder.newLine(3);
  }

  return builder.getUint8Array();
};

/**
 * Generate binary ESC/POS lengkap dari data transaksi penjualan
 */
export const buildReceiptEscPos = (
  sale: SalesTransaction,
  receiptOpts: ReceiptOptions,
  printerOpts: EscPosOptions = {}
): Uint8Array => {
  const pWidth = printerOpts.paperWidth || '58mm';
  const builder = new EscPosBuilder(pWidth);

  const settings = useSettingsStore.getState();
  const headerRaw = (settings.invoiceHeader || '').trim() || defaultInvoiceHeader(receiptOpts.storeName || settings.appName || 'POS MART');
  const footerRaw = (settings.invoiceFooter || '').trim() || DEFAULT_INVOICE_FOOTER;

  // 1. Header Toko
  const headerLines = headerRaw.split('\n').map((s: string) => s.trim()).filter(Boolean);

  builder.alignCenter().bold(true);
  if (headerLines.length > 0) {
    builder.doubleHeight(true).textLine(headerLines[0]).doubleHeight(false);
    for (let i = 1; i < headerLines.length; i++) {
      builder.textLine(headerLines[i]);
    }
  }
  builder.bold(false);

  // 2. Info Transaksi (Nota, Kasir, Tanggal)
  builder.divider('-');
  builder.alignLeft();
  builder.twoColumns('No. Nota', sale.id.replace('INV-', ''));
  const dateFormatted = new Date(sale.date).toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  builder.twoColumns('Waktu', dateFormatted);
  if (sale.employeeName || sale.employeeId) {
    builder.twoColumns('Kasir', sale.employeeName || sale.employeeId || 'Kasir');
  }
  if (sale.customerName && sale.customerName !== 'Retail') {
    builder.twoColumns('Pelanggan', sale.customerName);
  }
  builder.divider('-');

  // 3. Daftar Item
  builder.alignLeft();
  for (const item of sale.items) {
    const itemName = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    builder.bold(true).textLine(itemName).bold(false);

    const unitPrice = item.price;
    const qtyStr = `${item.qty} x ${fmtNum(unitPrice)}`;
    const subtotalStr = fmtNum(item.subtotal);
    builder.twoColumns(`  ${qtyStr}`, subtotalStr);

    if (item.isCustomPrice) {
      const note = item.customPriceNote ? `*${item.customPriceNote}` : '*Harga Khusus Manual';
      builder.textLine(`  ${note}`);
    }
  }

  // 4. Perhitungan Finansial
  builder.divider('-');
  builder.twoColumns('Subtotal', fmtNum(sale.subtotal));

  if (sale.tax && sale.tax > 0) {
    builder.twoColumns(`PPN (${receiptOpts.taxRate || settings.taxRate || 11}%)`, fmtNum(sale.tax));
  }

  if (sale.rounding && sale.rounding !== 0) {
    builder.twoColumns('Pembulatan', fmtNum(sale.rounding));
  }

  builder.divider('=');
  builder.bold(true).doubleHeight(true);
  builder.twoColumns('TOTAL', fmtNum(sale.total));
  builder.doubleHeight(false).bold(false);
  builder.divider('=');

  // 5. Pembayaran & Kembalian
  builder.twoColumns('Metode Bayar', sale.paymentMethod || 'TUNAI');
  const isCash = (sale.paymentMethod || 'TUNAI').toUpperCase() === 'TUNAI';
  if (isCash) {
    builder.twoColumns('Uang Tunai', fmtNum(sale.tendered || sale.total));
    builder.bold(true);
    builder.twoColumns('Kembalian', fmtNum(sale.change || 0));
    builder.bold(false);
  }

  builder.divider('-');

  // 6. Footer Struk
  const footerLines = footerRaw.split('\n').map((s: string) => s.trim()).filter(Boolean);

  builder.alignCenter();
  for (const line of footerLines) {
    builder.textLine(line);
  }

  // 7. Selesai & Potong Kertas
  if (printerOpts.autoCut) {
    builder.cut();
  } else {
    builder.newLine(4);
  }

  return builder.getUint8Array();
};
