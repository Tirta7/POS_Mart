/**
 * Barcode internal toko (untuk barang yang tidak punya barcode pabrikan).
 *
 * Format : "SK" + 6 digit urut  ->  SK000001, SK000002, ...
 * Simbologi cetak: Code128.
 *
 * Anti-bentrok:
 *  1. Awalan huruf "SK" -> barcode pabrikan (EAN-13/EAN-8/UPC) selalu angka murni,
 *     sehingga tidak mungkin sama dengan kode internal.
 *  2. Counter disimpan permanen di localStorage dan tidak pernah mundur, jadi nomor
 *     produk yang sudah dihapus tidak dipakai ulang (label lama yang masih menempel
 *     di barang tidak akan "nyasar" ke produk lain).
 *  3. Setiap kode baru dicek terhadap seluruh ID & barcode produk yang ada.
 */

export const INTERNAL_BARCODE_PREFIX = 'SK';
const COUNTER_KEY = 'internalBarcodeCounter';
const INTERNAL_PATTERN = /^SK\d{6}$/;

export const isInternalBarcode = (code?: string | null): boolean =>
  !!code && INTERNAL_PATTERN.test(code);

interface HasCodes {
  id: string;
  barcode?: string;
}

const parseSeq = (code?: string): number =>
  isInternalBarcode(code) ? parseInt((code as string).slice(INTERNAL_BARCODE_PREFIX.length), 10) : 0;

export const generateInternalBarcode = (products: HasCodes[]): string => {
  const used = new Set<string>();
  let maxExisting = 0;
  for (const p of products) {
    used.add(p.id);
    if (p.barcode) used.add(p.barcode);
    maxExisting = Math.max(maxExisting, parseSeq(p.id), parseSeq(p.barcode));
  }

  let next = maxExisting + 1;

  let code = INTERNAL_BARCODE_PREFIX + String(next).padStart(6, '0');
  while (used.has(code)) {
    next += 1;
    code = INTERNAL_BARCODE_PREFIX + String(next).padStart(6, '0');
  }

  return code;
};
