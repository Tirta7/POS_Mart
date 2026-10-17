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

  const padX = 12;
  let currY = 8;

  // 1. Header / Store Name or Shelf Tag Header
  if (opts.isShelfTag) {
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(data.storeName || 'POS MART', padX, currY);
    
    // Tanggal Cetak
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'right';
    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
    ctx.fillText(dateStr, widthPx - padX, currY + 2);
    currY += 22;
  }

  // 2. Product Name
  if (opts.showName !== false) {
    ctx.font = opts.isShelfTag ? 'bold 18px Arial, sans-serif' : 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'center';
    
    // Wrap product name into max 2 lines
    const words = (data.name || '').split(' ');
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
    currY += 18;
    if (line2) {
      ctx.fillText(line2, widthPx / 2, currY);
      currY += 18;
    }
  }

  // 3. Barcode (rendered using JsBarcode onto offscreen canvas or svg)
  const code = (data.code || data.sku || '000000').trim();
  const barcodeCanvas = document.createElement('canvas');
  try {
    JsBarcode(barcodeCanvas, code, {
      format: 'CODE128',
      width: widthPx < 300 ? 1.5 : 2,
      height: opts.isShelfTag ? 36 : 46,
      displayValue: true,
      fontSize: 14,
      font: 'monospace',
      margin: 0,
      textMargin: 2
    });

    const bW = barcodeCanvas.width;
    const bH = barcodeCanvas.height;
    const destX = Math.max(padX, (widthPx - bW) / 2);
    ctx.drawImage(barcodeCanvas, destX, currY);
    currY += bH + 6;
  } catch (err) {
    // Fallback if barcode fails to render
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, widthPx / 2, currY);
    currY += 24;
  }

  // 4. SKU & Satuan
  if (opts.showSku !== false && data.sku && data.sku !== code) {
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`SKU: ${data.sku}`, widthPx / 2, currY);
    currY += 15;
  }

  // 5. Price
  if (opts.showPrice !== false) {
    ctx.font = opts.isShelfTag ? 'bold 26px Arial, sans-serif' : 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    const priceFormatted = `Rp ${Number(data.price || 0).toLocaleString('id-ID')}`;
    const unitSuffix = data.unit ? ` / ${data.unit}` : '';
    ctx.fillText(`${priceFormatted}${unitSuffix}`, widthPx / 2, currY);
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

