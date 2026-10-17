/**
 * Bluetooth & ESC/POS Label / Sticker Printer Utility
 * Supports printing barcode stickers and shelf price tags (40x30mm, 50x30mm, 58mm/80mm)
 * to Bluetooth thermal printers using ESC/POS Raster Bit Image & TSPL.
 */

import JsBarcode from 'jsbarcode';
import { usePrinterStore } from '../store/usePrinterStore';

export interface LabelData {
  name: string;
  code: string;
  sku?: string;
  price: number;
  unit?: string;
  storeName?: string;
}

export interface LabelPrintOptions {
  copies?: number;
  labelWidthMm?: number; // default 40
  labelHeightMm?: number; // default 30
  showName?: boolean;
  showSku?: boolean;
  showPrice?: boolean;
  isShelfTag?: boolean; // Label rak harga besar
}

/**
 * Render a label to an HTML Canvas element
 */
export async function renderLabelToCanvas(
  data: LabelData,
  opts: LabelPrintOptions = {}
): Promise<HTMLCanvasElement> {
  const widthMm = opts.labelWidthMm || 40;
  const heightMm = opts.labelHeightMm || 30;
  
  // 203 DPI = 8 dots/mm
  // 40mm = 320px, 30mm = 240px. Must align width to byte boundary (multiple of 8).
  const widthPx = Math.ceil((widthMm * 8) / 8) * 8;
  const heightPx = Math.round(heightMm * 8);

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Fill pure white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const padX = 10;
  let currY = 6;

  if (opts.isShelfTag) {
    // -----------------------------------------------------------------
    // LAYOUT LABEL RAK TOKO (PRICE TAG SWALAYAN MODERN / INDOMARET)
    // -----------------------------------------------------------------
    // 1. Header: Nama Usaha & Tanggal Cetak
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText((data.storeName || 'POS MART').toUpperCase(), padX, currY);

    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'right';
    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
    ctx.fillText(`TGL: ${dateStr}`, widthPx - padX, currY + 1);
    currY += 18;

    // Garis pemisah header
    ctx.fillRect(padX, currY, widthPx - padX * 2, 1);
    currY += 5;

    // 2. Nama Produk (Full Width, Bold, 1-2 baris)
    if (opts.showName !== false) {
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'left';

      const words = (data.name || '').toUpperCase().split(' ');
      let line1 = '';
      let line2 = '';
      const maxW = widthPx - (padX * 2);

      for (const w of words) {
        const test = line1 ? `${line1} ${w}` : w;
        if (ctx.measureText(test).width <= maxW && !line2) {
          line1 = test;
        } else {
          const test2 = line2 ? `${line2} ${w}` : w;
          if (ctx.measureText(test2).width <= maxW) {
            line2 = test2;
          }
        }
      }

      ctx.fillText(line1 || data.name, padX, currY);
      currY += 17;
      if (line2) {
        ctx.fillText(line2, padX, currY);
        currY += 17;
      }
    }

    // Garis pemisah tengah
    ctx.fillRect(padX, currY, widthPx - padX * 2, 1);
    currY += 8;

    // 3. Kolom Kiri: Barcode & SKU
    const code = (data.code || data.sku || '000000').trim();
    const barcodeCanvas = document.createElement('canvas');
    try {
      JsBarcode(barcodeCanvas, code, {
        format: 'CODE128',
        width: 1.3,
        height: 48,
        displayValue: true,
        fontSize: 12,
        font: 'monospace',
        margin: 0,
        textMargin: 2
      });

      ctx.drawImage(barcodeCanvas, padX, currY);
    } catch (err) {
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(code, padX, currY + 20);
    }

    if (opts.showSku !== false && data.sku && data.sku !== code) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SKU: ${data.sku}`, padX, currY + 68);
    }

    // 4. Kolom Kanan: Harga Jual Sangat Besar Mencolok
    if (opts.showPrice !== false) {
      const rightX = widthPx - padX;

      const tagText = 'HARGA PAS';
      ctx.font = 'bold 11px Arial, sans-serif';
      const tagW = ctx.measureText(tagText).width + 8;
      ctx.fillStyle = '#000000';
      ctx.fillRect(rightX - tagW, currY, tagW, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(tagText, rightX - 4, currY + 2);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'right';
      const priceFormatted = `Rp ${Number(data.price || 0).toLocaleString('id-ID')}`;
      ctx.fillText(priceFormatted, rightX, currY + 22);

      if (data.unit) {
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`PER ${data.unit.toUpperCase()}`, rightX, currY + 52);
      }
    }
  } else {
    // -----------------------------------------------------------------
    // LAYOUT STIKER BARCODE PRODUK STANDAR (BARCODE DOMINAN)
    // -----------------------------------------------------------------
    // 1. Nama Produk di Atas
    if (opts.showName !== false) {
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.textAlign = 'center';

      const words = (data.name || '').toUpperCase().split(' ');
      let line1 = '';
      let line2 = '';
      const maxW = widthPx - (padX * 2);

      for (const w of words) {
        const test = line1 ? `${line1} ${w}` : w;
        if (ctx.measureText(test).width <= maxW && !line2) {
          line1 = test;
        } else {
          const test2 = line2 ? `${line2} ${w}` : w;
          if (ctx.measureText(test2).width <= maxW) {
            line2 = test2;
          }
        }
      }

      ctx.fillText(line1 || data.name, widthPx / 2, currY);
      currY += 16;
      if (line2) {
        ctx.fillText(line2, widthPx / 2, currY);
        currY += 16;
      }
    }

    // 2. Barcode Besar di Tengah
    const code = (data.code || data.sku || '000000').trim();
    const barcodeCanvas = document.createElement('canvas');
    try {
      JsBarcode(barcodeCanvas, code, {
        format: 'CODE128',
        width: widthPx < 300 ? 1.5 : 2,
        height: 60,
        displayValue: true,
        fontSize: 13,
        font: 'monospace',
        margin: 0,
        textMargin: 3
      });

      const bW = barcodeCanvas.width;
      const bH = barcodeCanvas.height;
      const destX = Math.max(padX, (widthPx - bW) / 2);
      ctx.drawImage(barcodeCanvas, destX, currY);
      currY += bH + 6;
    } catch (err) {
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(code, widthPx / 2, currY);
      currY += 24;
    }

    // 3. SKU
    if (opts.showSku !== false && data.sku && data.sku !== code) {
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`SKU: ${data.sku}`, widthPx / 2, currY);
      currY += 14;
    }

    // 4. Harga Jual di Bawah
    if (opts.showPrice !== false) {
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      const priceFormatted = `Rp ${Number(data.price || 0).toLocaleString('id-ID')}`;
      const unitSuffix = data.unit ? ` / ${data.unit}` : '';
      ctx.fillText(`${priceFormatted}${unitSuffix}`, widthPx / 2, currY);
    }
  }

  return canvas;
}

/**
 * Convert Canvas to ESC/POS Raster Bit Image Bytes (`GS v 0`)
 */
export function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const widthBytes = Math.ceil(width / 8);
  const rasterDataLength = widthBytes * height;

  // ESC/POS Command: GS v 0 0 xL xH yL yH
  const header = [
    0x1D, 0x76, 0x30, 0x00, // GS v 0 0
    widthBytes & 0xFF,
    (widthBytes >> 8) & 0xFF,
    height & 0xFF,
    (height >> 8) & 0xFF,
  ];

  const rasterBytes = new Uint8Array(rasterDataLength);
  let byteIndex = 0;

  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < widthBytes; xByte++) {
      let b = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x < width) {
          const pixelIndex = (y * width + x) * 4;
          const r = pixels[pixelIndex];
          const g = pixels[pixelIndex + 1];
          const bPixel = pixels[pixelIndex + 2];
          const a = pixels[pixelIndex + 3];

          // Hitung luminance grayscale (0-255)
          const lum = (0.299 * r + 0.587 * g + 0.114 * bPixel);
          // Bila pixel gelap (< 160) dan tidak transparan -> jadikan dot hitam (1)
          if (a > 64 && lum < 160) {
            b |= (0x80 >> bit);
          }
        }
      }
      rasterBytes[byteIndex++] = b;
    }
  }

  // Gabungkan command inisialisasi + raster + feed line
  const init = [0x1B, 0x40]; // ESC @ (Init)
  const feed = [0x1B, 0x64, 0x02]; // ESC d 2 (Feed 2 lines)

  const finalLength = init.length + header.length + rasterBytes.length + feed.length;
  const result = new Uint8Array(finalLength);
  let offset = 0;

  result.set(init, offset);
  offset += init.length;

  result.set(header, offset);
  offset += header.length;

  result.set(rasterBytes, offset);
  offset += rasterBytes.length;

  result.set(feed, offset);
  offset += feed.length;

  return result;
}

/**
 * Print Barcode Sticker via Connected Bluetooth Printer
 */
export async function printLabelBluetooth(
  data: LabelData,
  opts: LabelPrintOptions = {}
): Promise<{ success: boolean; message?: string }> {
  const printerStore = usePrinterStore.getState();

  // Cek apakah printer bluetooth terhubung
  if (!printerStore.isConnected) {
    // Coba hubungkan perangkat Bluetooth yang sudah disimpan atau minta koneksi
    const connected = await printerStore.reconnectSavedDevice(true);
    if (!connected) {
      const manualConnect = await printerStore.connect();
      if (!manualConnect) {
        return {
          success: false,
          message: 'Printer Bluetooth belum terhubung. Silakan sambungkan printer terlebih dahulu.',
        };
      }
    }
  }

  try {
    const canvas = await renderLabelToCanvas(data, opts);
    const bytes = canvasToEscPosRaster(canvas);

    const copies = Math.max(1, opts.copies || 1);
    for (let i = 0; i < copies; i++) {
      const sent = await printerStore.sendBytes(bytes);
      if (!sent) {
        throw new Error(`Gagal mengirim data label ke-${i + 1}`);
      }
      // Berikan jeda 250ms antar label jika mencetak banyak
      if (copies > 1 && i < copies - 1) {
        await new Promise((res) => setTimeout(res, 250));
      }
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Terjadi kesalahan saat mencetak label ke printer Bluetooth.',
    };
  }
}

/**
 * Print Batch / All Barcode Stickers via Connected Bluetooth Printer
 */
export async function printBatchLabelsBluetooth(
  items: Array<{ data: LabelData; copies: number }>,
  opts: LabelPrintOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; message?: string }> {
  const printerStore = usePrinterStore.getState();

  // Cek apakah printer bluetooth terhubung
  if (!printerStore.isConnected) {
    const connected = await printerStore.reconnectSavedDevice(true);
    if (!connected) {
      const manualConnect = await printerStore.connect();
      if (!manualConnect) {
        return {
          success: false,
          message: 'Printer Bluetooth belum terhubung. Silakan sambungkan printer terlebih dahulu.',
        };
      }
    }
  }

  try {
    const totalLabels = items.reduce((s, it) => s + Math.max(1, it.copies), 0);
    let printed = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const canvas = await renderLabelToCanvas(item.data, opts);
      const bytes = canvasToEscPosRaster(canvas);
      const copies = Math.max(1, item.copies);

      for (let c = 0; c < copies; c++) {
        const sent = await printerStore.sendBytes(bytes);
        if (!sent) {
          throw new Error(`Gagal mengirim label ke-${printed + 1} (${item.data.name})`);
        }
        printed++;
        if (onProgress) {
          onProgress(printed, totalLabels);
        }
        // Jeda kecil 220ms antar label agar buffer printer tidak overflow
        await new Promise((res) => setTimeout(res, 220));
      }
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Terjadi kesalahan saat mencetak masal ke printer Bluetooth.',
    };
  }
}

