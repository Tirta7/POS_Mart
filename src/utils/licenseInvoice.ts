import { terbilang } from './distributorInvoice';

export interface LicenseInvoiceData {
  invoiceNumber: string;
  storeName: string;
  merchantName: string;
  adminContact?: string;
  machineId: string;
  method: 'qris' | 'manual' | 'admin';
  packageLabel: string;
  amountNumber: number;
  amountText: string;
  uniqueCode: number;
  paidAt: string;
  expiresAtText: string;
  daysLeft?: number | null;
  licenseKey?: string | null;
}

const drawWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number => {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let currY = y;
  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currY);
      line = words[i];
      currY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currY);
    currY += lineHeight;
  }
  return currY;
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

function renderInvoiceCanvas(data: LicenseInvoiceData): HTMLCanvasElement {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const fontSans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const fontMono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const padX = 84;

  // White A4 paper
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Top emerald accent bar
  ctx.fillStyle = '#059669';
  ctx.fillRect(0, 0, W, 18);

  // Header Left: Brand & Issuer
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 34px ${fontSans}`;
  ctx.fillText('VOC POS MANAGEMENT SYSTEM', padX, 110);

  ctx.fillStyle = '#475569';
  ctx.font = `600 21px ${fontSans}`;
  ctx.fillText(data.merchantName || 'VIRTUAL OPERATION CONTROL', padX, 146);

  if (data.adminContact) {
    ctx.fillStyle = '#64748b';
    ctx.font = `500 18px ${fontSans}`;
    ctx.fillText(`Dukungan Admin: ${data.adminContact}`, padX, 178);
  }

  // Header Right: INVOICE badge + LUNAS pill
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `900 44px ${fontSans}`;
  ctx.fillText('INVOICE', W - padX, 114);

  ctx.fillStyle = '#475569';
  ctx.font = `600 20px ${fontMono}`;
  ctx.fillText(data.invoiceNumber, W - padX, 148);

  // PAID Stamp Pill
  const stampW = 190;
  const stampH = 44;
  const stampX = W - padX - stampW;
  const stampY = 166;
  ctx.fillStyle = '#ecfdf5';
  roundRect(ctx, stampX, stampY, stampW, stampH, 10);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#047857';
  ctx.font = `800 20px ${fontSans}`;
  ctx.fillText('LUNAS · PAID', stampX + stampW / 2, stampY + 29);

  // Divider
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, 245);
  ctx.lineTo(W - padX, 245);
  ctx.stroke();

  // Two-column billing info cards
  const boxY = 278;
  const colGap = 28;
  const colW = (W - padX * 2 - colGap) / 2;
  const boxH = 210;

  // Left card: Ditagihkan Kepada
  ctx.fillStyle = '#f8fafc';
  roundRect(ctx, padX, boxY, colW, boxH, 16);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `700 16px ${fontSans}`;
  ctx.fillText('DITERBITKAN UNTUK', padX + 24, boxY + 38);

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 25px ${fontSans}`;
  ctx.fillText(data.storeName || 'Outlet POS Mart', padX + 24, boxY + 76);

  ctx.fillStyle = '#475569';
  ctx.font = `600 17px ${fontSans}`;
  ctx.fillText('Machine ID Perangkat:', padX + 24, boxY + 118);

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 17px ${fontMono}`;
  drawWrappedText(ctx, data.machineId, padX + 24, boxY + 146, colW - 48, 24);

  // Right card: Detail Pembayaran
  const rightX = padX + colW + colGap;
  ctx.fillStyle = '#f8fafc';
  roundRect(ctx, rightX, boxY, colW, boxH, 16);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `700 16px ${fontSans}`;
  ctx.fillText('INFORMASI PEMBAYARAN', rightX + 24, boxY + 38);

  const infoRows: [string, string][] = [
    ['Waktu Lunas', data.paidAt],
    ['Metode', data.method === 'manual' ? 'Aktivasi License Key' : data.method === 'admin' ? 'Aktivasi Admin VOCML' : 'QRIS Otomatis'],
    [
      'Masa Aktif',
      data.daysLeft != null ? `s/d ${data.expiresAtText} (${data.daysLeft} hari)` : `s/d ${data.expiresAtText}`,
    ],
  ];

  let ry = boxY + 78;
  for (const [k, v] of infoRows) {
    ctx.fillStyle = '#64748b';
    ctx.font = `600 17px ${fontSans}`;
    ctx.fillText(k, rightX + 24, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 17px ${fontSans}`;
    ctx.fillText(v, rightX + colW - 24, ry);
    ctx.textAlign = 'left';
    ry += 40;
  }

  // Table header
  const tableY = 532;
  const tableW = W - padX * 2;
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, padX, tableY, tableW, 56, 12);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 18px ${fontSans}`;
  ctx.fillText('DESKRIPSI LAYANAN', padX + 24, tableY + 35);
  ctx.textAlign = 'center';
  ctx.fillText('DURASI / QTY', padX + tableW - 265, tableY + 35);
  ctx.textAlign = 'right';
  ctx.fillText('JUMLAH', W - padX - 24, tableY + 35);
  ctx.textAlign = 'left';

  // Table rows
  const hasAmount = data.amountNumber > 0;
  const baseAmt = hasAmount ? Math.max(0, data.amountNumber - (data.uniqueCode || 0)) : 0;
  const rows: { title: string; sub: string; qty: string; price: string }[] = [
    {
      title: `Lisensi Aplikasi POS Mart — Paket ${data.packageLabel || 'Aktif'}`,
      sub: `Aktivasi modul kasir, inventori & cloud (${data.merchantName})`,
      qty: data.packageLabel || '1 Paket',
      price: hasAmount
        ? `Rp${baseAmt.toLocaleString('id-ID')}`
        : data.method === 'manual'
        ? 'Teraktivasi'
        : data.amountText || '-',
    },
  ];

  if (data.uniqueCode > 0 && hasAmount && data.method === 'qris') {
    rows.push({
      title: 'Kode Unik Verifikasi Pembayaran Otomatis',
      sub: 'Kode identifikasi transfer QRIS real-time VOCML',
      qty: '1x',
      price: `Rp${data.uniqueCode.toLocaleString('id-ID')}`,
    });
  }

  let rowY = tableY + 68;
  for (const row of rows) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, rowY, tableW, 108);

    ctx.fillStyle = '#0f172a';
    ctx.font = `700 21px ${fontSans}`;
    ctx.fillText(row.title, padX + 24, rowY + 42);

    ctx.fillStyle = '#64748b';
    ctx.font = `500 17px ${fontSans}`;
    ctx.fillText(row.sub, padX + 24, rowY + 74, tableW - 390);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.font = `600 19px ${fontSans}`;
    ctx.fillText(row.qty, padX + tableW - 265, rowY + 54);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 21px ${fontSans}`;
    ctx.fillText(row.price, W - padX - 24, rowY + 54);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, rowY + 108);
    ctx.lineTo(W - padX, rowY + 108);
    ctx.stroke();

    rowY += 108;
  }

  // Summary Total Box
  const sumY = rowY + 34;
  const sumW = 520;
  const sumX = W - padX - sumW;
  const sumH = hasAmount ? 186 : 126;

  ctx.fillStyle = '#ecfdf5';
  roundRect(ctx, sumX, sumY, sumW, sumH, 16);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#065f46';
  ctx.font = `700 19px ${fontSans}`;
  ctx.fillText('TOTAL PEMBAYARAN', sumX + 28, sumY + 46);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#047857';
  ctx.font = `900 36px ${fontSans}`;
  ctx.fillText(data.amountText || 'LUNAS', sumX + sumW - 28, sumY + 52);
  ctx.textAlign = 'left';

  if (hasAmount) {
    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sumX + 28, sumY + 76);
    ctx.lineTo(sumX + sumW - 28, sumY + 76);
    ctx.stroke();

    ctx.fillStyle = '#065f46';
    ctx.font = `700 15px ${fontSans}`;
    ctx.fillText('TERBILANG:', sumX + 28, sumY + 108);

    ctx.fillStyle = '#047857';
    ctx.font = `italic 600 17px ${fontSans}`;
    drawWrappedText(ctx, `${terbilang(data.amountNumber)}`, sumX + 28, sumY + 136, sumW - 56, 24);
  } else {
    ctx.fillStyle = '#047857';
    ctx.font = `600 17px ${fontSans}`;
    ctx.fillText('Status: Terverifikasi & Aktif oleh Admin', sumX + 28, sumY + 92);
  }

  // License Key Box (when available)
  const licY = sumY + sumH + 46;
  ctx.fillStyle = '#f8fafc';
  roundRect(ctx, padX, licY, tableW, 134, 16);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = `700 16px ${fontSans}`;
  ctx.fillText('DETAIL LISENSI TERAKTIFKAN', padX + 24, licY + 38);

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 18px ${fontMono}`;
  ctx.fillText(`License Key : ${data.licenseKey || 'Tersinkronisasi ke Perangkat'}`, padX + 24, licY + 76);
  ctx.fillText(`Berlaku s/d : ${data.expiresAtText}`, padX + 24, licY + 108);

  // Footer verification note
  const footerY = H - 140;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, footerY);
  ctx.lineTo(W - padX, footerY);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `500 16px ${fontSans}`;
  ctx.fillText(
    'Invoice ini diterbitkan secara otomatis oleh VOCML Billing System sebagai bukti pembayaran resmi dan sah.',
    padX,
    footerY + 38
  );
  ctx.fillText(
    `Dicetak pada ${data.paidAt} · Machine ID: ${data.machineId}`,
    padX,
    footerY + 66
  );

  return canvas;
}

/**
 * Bangun file PDF 1-halaman A4 valid berisi gambar JPEG resolusi tinggi dari canvas invoice.
 */
function canvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
  const b64 = dataUrl.split(',')[1];
  const binStr = atob(b64);
  const jpegBytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    jpegBytes[i] = binStr.charCodeAt(i);
  }

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;

  const pushStr = (s: string) => {
    const bytes = encoder.encode(s);
    parts.push(bytes);
    byteLength += bytes.length;
  };
  const pushBytes = (bytes: Uint8Array) => {
    parts.push(bytes);
    byteLength += bytes.length;
  };

  const pageW = '595.28';
  const pageH = '841.89';
  const contentStream = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q\n`;

  pushStr('%PDF-1.4\n');

  offsets[1] = byteLength;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets[2] = byteLength;
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  offsets[3] = byteLength;
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  offsets[4] = byteLength;
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  offsets[5] = byteLength;
  pushStr(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  const xrefOffset = byteLength;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export function downloadLicenseInvoicePdf(data: LicenseInvoiceData) {
  const canvas = renderInvoiceCanvas(data);
  const blob = canvasToPdfBlob(canvas);
  const url = URL.createObjectURL(blob);
  const safeInv = data.invoiceNumber.replace(/[^A-Za-z0-9_-]+/g, '_');

  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeInv}.pdf`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}
