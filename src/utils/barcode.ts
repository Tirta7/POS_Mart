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

/**
 * Buat SKU otomatis yang diambil dari nama produk dan kode barcode.
 * Contoh:
 * - Nama "Beras Premium", Barcode "89999012345" -> "SKU-BP-12345"
 * - Nama "Sampoerna Mild", Barcode "89999090132" -> "SKU-SM-0132"
 * - Nama "Desaku Marinasi", Barcode "SK000011" -> "SKU-DM-000011"
 */
export const generateAutoSKU = (name?: string, barcode?: string): string => {
  const cleanName = (name || '').trim();
  const cleanBarcode = (barcode || '').trim();

  let namePart = '';
  if (cleanName) {
    const words = cleanName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    if (words.length >= 2) {
      // Ambil 2-3 huruf inisial kata pertama
      namePart = words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
      if (namePart.length < 3 && words[0].length >= 2) {
        namePart = (words[0].slice(0, 2) + words[1].slice(0, 1)).toUpperCase();
      }
    } else if (words.length === 1) {
      // 1 kata: ambil 3 konsonan atau huruf awal (misal "Desaku" -> "DSK")
      const consonants = words[0].replace(/[aeiouAEIOU]/g, '').toUpperCase();
      namePart = consonants.length >= 3 ? consonants.slice(0, 3) : words[0].slice(0, 3).toUpperCase();
    }
  }

  if (!namePart) {
    namePart = 'PRD';
  }

  let barcodePart = '';
  if (cleanBarcode) {
    const sanitized = cleanBarcode.replace(/[^a-zA-Z0-9]/g, '');
    barcodePart = sanitized.length > 5 ? sanitized.slice(-5) : sanitized;
  }

  if (!barcodePart) {
    barcodePart = Math.floor(1000 + Math.random() * 9000).toString();
  }

  return `SKU-${namePart}-${barcodePart}`;
};
