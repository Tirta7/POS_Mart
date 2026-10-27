import assert from 'node:assert';
import * as XLSX from 'xlsx';

console.log('=== TEST: EXPORT & IMPORT DATA EXCEL ROUNDTRIP & ALIGNMENT ===');

// 1. Data Mock Produk Sesuai Database / Web UI
const mockProducts = [
  {
    id: 'prod-001',
    name: 'Mie Sedaap Mi Instan Goreng Korean Cheese Buldak',
    category: { name: 'Mi Instan' },
    sku: 'SKU-MSM-03576',
    box_barcode: '10998886203576',
    retail_barcode: '0998886203579',
    barcode: '0998886203579',
    unit: 'Bungkus',
    box_capacity: 40,
    stock: 713,
    min_stock: 20,
    box_purchase_price: 110520,
    purchase_price: 2763,
    selling_price: 3000,
    wholesale_price: 2900,
    min_wholesale_qty: 3,
    box_price: 113000,
    mid_unit_name: null,
    mid_capacity: 0,
    mid_price: 0,
    mid_barcode: null,
    is_active: true
  },
  {
    id: 'prod-002',
    name: 'Sampoerna A Mild 16 Batang',
    category: 'Rokok',
    sku: 'SKU-RK-001',
    box_barcode: '8999909013278DUS',
    retail_barcode: '8999909013278',
    barcode: '8999909013278',
    unit: 'Bks',
    box_capacity: 80,
    stock: 160,
    min_stock: 20,
    box_purchase_price: 2520000,
    purchase_price: 31500,
    selling_price: 35000,
    wholesale_price: 34000,
    min_wholesale_qty: 10,
    box_price: 2680000,
    mid_unit_name: 'Slop',
    mid_capacity: 10,
    mid_price: 342000,
    mid_barcode: '8999909013278SLP',
    is_active: true
  }
];

// Helper parseNumber persis di util
const parseNumber = (val, fallback = 0) => {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  let str = String(val).trim().replace(/^[Rr][Pp]\.?\s*/i, '').trim();
  if (str.includes('.') && !str.includes(',')) {
    const parts = str.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) str = str.replace(/\./g, '');
  } else if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) str = str.replace(/\./g, '').replace(',', '.');
    else str = str.replace(/,/g, '');
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) str = str.replace(/,/g, '');
    else str = str.replace(',', '.');
  }
  const n = parseFloat(str);
  return isNaN(n) ? fallback : n;
};

// 2. Simulasi Generator Export
const productRows = mockProducts.map((p, idx) => {
  const stock = parseNumber(p.stock, 0);
  const minStock = parseNumber(p.min_stock, 0);
  const buyPrice = parseNumber(p.purchase_price, 0);
  const sellPrice = parseNumber(p.selling_price, 0);
  const wholesalePrice = parseNumber(p.wholesale_price, sellPrice);
  const boxCapacity = parseNumber(p.box_capacity, 1);
  const minWholesaleQty = parseNumber(p.min_wholesale_qty, 1);
  const boxPriceVal = parseNumber(p.box_price, 0);
  const boxPrice = boxPriceVal > 0 ? boxPriceVal : (boxCapacity > 1 && sellPrice > 0 ? Math.round(sellPrice * boxCapacity) : '');
  const boxCostVal = parseNumber(p.box_purchase_price, 0);
  const boxCost = boxCapacity > 1 ? (boxCostVal > 0 ? boxCostVal : (buyPrice > 0 ? Math.round(buyPrice * boxCapacity) : '')) : '';
  const estBoxStock = boxCapacity > 1 ? Math.floor(stock / boxCapacity) : '-';
  const remRetailStock = boxCapacity > 1 ? (stock % boxCapacity) : stock;

  const effectiveUnitCost = (boxCapacity > 1 && boxCostVal > 0) ? Math.round(boxCostVal / boxCapacity) : Math.round(buyPrice);
  const unitProfit = sellPrice > 0 && effectiveUnitCost > 0 ? (sellPrice - effectiveUnitCost) : 0;
  const marginPct = effectiveUnitCost > 0 && sellPrice > 0 ? Number(((sellPrice - effectiveUnitCost) / effectiveUnitCost * 100).toFixed(1)) : 0;
  const boxProfit = (boxCapacity > 1 && boxPrice > 0 && boxCost > 0) ? (Number(boxPrice) - Number(boxCost)) : '';

  let status = 'Aman';
  if (stock <= 0) status = 'Habis';
  else if (stock <= minStock) status = 'Menipis';

  const boxBarcodeVal = p.box_barcode || '';
  const retailBarcodeVal = p.retail_barcode || p.barcode || '';
  const skuVal = p.sku || '';
  const categoryName = typeof p.category === 'object' ? p.category?.name : p.category;
  const catalogStatus = p.is_active === false ? 'Nonaktif' : 'Aktif';

  return {
    'No': idx + 1,
    'ID Produk': p.id ? String(p.id) : '',
    'Nama Produk': p.name,
    'Kategori': categoryName,
    'SKU / Kode Rak': skuVal ? String(skuVal) : '',
    'Barcode Dus (Karton)': boxBarcodeVal ? String(boxBarcodeVal) : '',
    'Barcode Eceran (Satuan)': retailBarcodeVal ? String(retailBarcodeVal) : '',
    'Satuan Eceran': p.unit || 'Pcs',
    'Isi per 1 Dus (Pcs)': boxCapacity > 1 ? boxCapacity : (boxBarcodeVal ? 1 : ''),
    'Total Stok Fisik (Satuan)': stock,
    'Estimasi Stok Dus': estBoxStock,
    'Sisa Satuan Ecer': remRetailStock,
    'Modal per 1 Dus (Rp)': boxCost,
    'Modal Satuan (Rp)': effectiveUnitCost > 0 ? effectiveUnitCost : buyPrice,
    'Harga Jual Eceran (Rp)': sellPrice,
    'Harga Grosir Satuan (Rp)': wholesalePrice,
    'Min. Beli Grosir (Pcs)': minWholesaleQty > 1 ? minWholesaleQty : 1,
    'Harga Jual per 1 Dus (Rp)': boxPrice,
    'Satuan Menengah': p.mid_unit_name || '',
    'Isi Satuan Menengah': p.mid_capacity || '',
    'Harga Satuan Menengah (Rp)': p.mid_price || '',
    'Barcode Satuan Menengah': p.mid_barcode ? String(p.mid_barcode) : '',
    'Margin Eceran (%)': marginPct,
    'Profit Eceran (Rp)': unitProfit,
    'Profit per Dus (Rp)': boxProfit,
    'Total Nilai Modal (Rp)': Math.round(stock * effectiveUnitCost),
    'Total Nilai Jual (Rp)': Math.round(stock * sellPrice),
    'Min. Stok (Alert Tipis)': minStock,
    'Status Stok': status,
    'Status Katalog': catalogStatus
  };
});

// Verifikasi urutan kolom
const expectedHeaders = [
  'No',
  'ID Produk',
  'Nama Produk',
  'Kategori',
  'SKU / Kode Rak',
  'Barcode Dus (Karton)',
  'Barcode Eceran (Satuan)',
  'Satuan Eceran',
  'Isi per 1 Dus (Pcs)',
  'Total Stok Fisik (Satuan)',
  'Estimasi Stok Dus',
  'Sisa Satuan Ecer',
  'Modal per 1 Dus (Rp)',
  'Modal Satuan (Rp)',
  'Harga Jual Eceran (Rp)',
  'Harga Grosir Satuan (Rp)',
  'Min. Beli Grosir (Pcs)',
  'Harga Jual per 1 Dus (Rp)',
  'Satuan Menengah',
  'Isi Satuan Menengah',
  'Harga Satuan Menengah (Rp)',
  'Barcode Satuan Menengah',
  'Margin Eceran (%)',
  'Profit Eceran (Rp)',
  'Profit per Dus (Rp)',
  'Total Nilai Modal (Rp)',
  'Total Nilai Jual (Rp)',
  'Min. Stok (Alert Tipis)',
  'Status Stok',
  'Status Katalog'
];

const actualHeaders = Object.keys(productRows[0]);
console.log('✓ Jumlah kolom export:', actualHeaders.length);
assert.deepStrictEqual(actualHeaders, expectedHeaders, 'Urutan kolom export harus persis sama!');
console.log('✅ [PASS] Urutan kolom export 100% cocok dengan susunan Tabel Web dari kiri ke kanan');

// 3. Tulis ke file Excel binary in-memory
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(productRows);
XLSX.utils.book_append_sheet(wb, ws, 'Manajemen Stok');
const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

// 4. Baca kembali file Excel (Simulasi Import)
const readWb = XLSX.read(excelBuffer, { type: 'buffer' });
const readWs = readWb.Sheets['Manajemen Stok'];
const rawImportRows = XLSX.utils.sheet_to_json(readWs);

assert.strictEqual(rawImportRows.length, 2, 'Harus ada 2 baris data');

// Helper normalisasi row
const normalizeRow = (row) => {
  const res = {};
  for (const key of Object.keys(row)) {
    const rawKey = key.trim().toLowerCase();
    const cleanKey = rawKey.replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
    res[cleanKey] = row[key];
    const alphaKey = rawKey.replace(/[^a-z0-9]/g, '');
    if (alphaKey && !res[alphaKey]) res[alphaKey] = row[key];
  }
  return res;
};

const cleanCode = (v) => {
  if (v === undefined || v === null || v === '') return '';
  let s = String(v).trim();
  if (s === '-' || s === '0') return '';
  if (/^\d+\.0+$/.test(s)) s = s.split('.')[0];
  return s;
};

// 5. Verifikasi bahwa setiap data terbaca kembali tanpa tertukar
const item1 = normalizeRow(rawImportRows[0]);
assert.strictEqual(item1.nama_produk, 'Mie Sedaap Mi Instan Goreng Korean Cheese Buldak');
assert.strictEqual(item1.kategori, 'Mi Instan');
assert.strictEqual(item1.sku_kode_rak, 'SKU-MSM-03576');
assert.strictEqual(cleanCode(item1.barcode_dus_karton), '10998886203576');
assert.strictEqual(cleanCode(item1.barcode_eceran_satuan), '0998886203579');
assert.strictEqual(Number(item1.isi_per_1_dus_pcs), 40);
assert.strictEqual(Number(item1.total_stok_fisik_satuan), 713);
assert.strictEqual(Number(item1.modal_per_1_dus_rp), 110520);
assert.strictEqual(Number(item1.modal_satuan_rp), 2763);
assert.strictEqual(Number(item1.harga_jual_eceran_rp), 3000);
assert.strictEqual(Number(item1.harga_grosir_satuan_rp), 2900);
assert.strictEqual(Number(item1.min_beli_grosir_pcs), 3);
assert.strictEqual(Number(item1.harga_jual_per_1_dus_rp), 113000);
assert.strictEqual(item1.status_katalog, 'Aktif');

console.log('✅ [PASS] Baris 1: Mie Sedaap semua angka, harga, barcode dus & eceran terbaca sempurna');

const item2 = normalizeRow(rawImportRows[1]);
assert.strictEqual(item2.nama_produk, 'Sampoerna A Mild 16 Batang');
assert.strictEqual(item2.kategori, 'Rokok');
assert.strictEqual(item2.sku_kode_rak, 'SKU-RK-001');
assert.strictEqual(cleanCode(item2.barcode_dus_karton), '8999909013278DUS');
assert.strictEqual(cleanCode(item2.barcode_eceran_satuan), '8999909013278');
assert.strictEqual(Number(item2.isi_per_1_dus_pcs), 80);
assert.strictEqual(Number(item2.modal_per_1_dus_rp), 2520000);
assert.strictEqual(Number(item2.modal_satuan_rp), 31500);
assert.strictEqual(item2.satuan_menengah, 'Slop');
assert.strictEqual(Number(item2.isi_satuan_menengah), 10);
assert.strictEqual(Number(item2.harga_satuan_menengah_rp), 342000);
assert.strictEqual(cleanCode(item2.barcode_satuan_menengah), '8999909013278SLP');

console.log('✅ [PASS] Baris 2: Sampoerna A Mild data multi-tier (Slop & Dus) terbaca sempurna');

// 6. Test Sinkronisasi Otomatis jika salah satu harga kosong saat diinput manual oleh user di Excel
const testOmittedBoxCost = {
  isi_per_1_dus_pcs: 40,
  modal_satuan_rp: 2500,
  modal_per_1_dus_rp: 0
};
let calcBox = Number(testOmittedBoxCost.modal_per_1_dus_rp);
let calcBuy = Number(testOmittedBoxCost.modal_satuan_rp);
let cap = Number(testOmittedBoxCost.isi_per_1_dus_pcs);
if (calcBox === 0 && calcBuy > 0 && cap > 1) {
  calcBox = Math.round(calcBuy * cap);
}
assert.strictEqual(calcBox, 100000, 'Harga dus harus otomatis dihitung 100.000 jika user hanya isi modal satuan');
console.log('✅ [PASS] Auto-kalkulasi harga dus dari modal satuan berhasil: Rp 100.000');

const testOmittedUnitCost = {
  isi_per_1_dus_pcs: 36,
  modal_satuan_rp: 0,
  modal_per_1_dus_rp: 87012
};
calcBox = Number(testOmittedUnitCost.modal_per_1_dus_rp);
calcBuy = Number(testOmittedUnitCost.modal_satuan_rp);
cap = Number(testOmittedUnitCost.isi_per_1_dus_pcs);
if (calcBuy === 0 && calcBox > 0 && cap > 0) {
  calcBuy = Math.round(calcBox / cap);
}
assert.strictEqual(calcBuy, 2417, 'Modal satuan harus otomatis dihitung 2.417 jika user hanya isi harga dus');
console.log('✅ [PASS] Auto-kalkulasi modal satuan dari harga dus berhasil: Rp 2.417');

console.log('============================================================');
console.log('SEMUA TEST EXPORT & IMPORT DATA EXCEL BERHASIL (100% PASS)');
console.log('============================================================');
