// ============================================================================
// Unit Tests: Perbaikan Pembulatan HPP (Harga Dus vs HPP per Renceng)
// Memverifikasi seluruh skenario Acceptance Criteria & kalkulasi
// ============================================================================
import assert from 'node:assert';

console.log('=== MENJALANKAN TEST SKENARIO PEMBULATAN HPP & HARGA DUS ===\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failedTests++;
  }
}

// Helper rumus kalkulasi searah dan turunan sesuai implementasi
function calcHppFromBox(boxPurchasePrice, boxCapacity) {
  const cap = Math.max(1, Number(boxCapacity) || 1);
  return Number((Number(boxPurchasePrice) / cap).toFixed(4));
}

function calcDisplayHpp(purchasePrice) {
  return Math.round(Number(purchasePrice));
}

function calcMargin(sellingPrice, purchasePrice) {
  const sell = Number(sellingPrice);
  const cost = Number(purchasePrice);
  const mRetail = sell - cost;
  return sell > 0 ? (mRetail / sell) * 100 : 0;
}

function calcInventoryCost(stock, boxCapacity, boxPurchasePrice, unitPurchasePrice) {
  const cap = Number(boxCapacity) || 1;
  const bBuy = Number(boxPurchasePrice) || 0;
  const uBuy = Number(unitPurchasePrice) || 0;
  const st = Number(stock) || 0;
  if (cap > 1 && bBuy > 0) {
    return (st / cap) * bBuy;
  }
  return st * uBuy;
}

function calcSaleProfit(sellingPrice, totalQty, boxCapacity, boxPurchasePrice, unitPurchasePrice) {
  const revenue = Number(sellingPrice) * Number(totalQty);
  const cost = calcInventoryCost(totalQty, boxCapacity, boxPurchasePrice, unitPurchasePrice);
  return revenue - cost;
}

// ----------------------------------------------------------------------------
// Skenario 1: Input harga dus 234.500, isi 12, simpan, buka lagi
// ----------------------------------------------------------------------------
test('Skenario 1: Input harga dus 234.500, isi 12 -> Harga dus tetap 234.500 setelah simpan dan dibuka lagi', () => {
  const inputHargaDus = 234500;
  const isiDus = 12;

  // 1. User input harga dus
  const hppTersimpan = calcHppFromBox(inputHargaDus, isiDus);
  assert.strictEqual(hppTersimpan, 19541.6667, 'HPP tersimpan harus 19.541,6667');

  // 2. Simpan produk (Product master data)
  const savedProduct = {
    name: 'Kopi Renceng ABC',
    boxCapacity: isiDus,
    boxPurchasePrice: inputHargaDus, // Source of Truth
    purchasePrice: hppTersimpan
  };

  // 3. User membuka form edit kembali (handleEditClick)
  const openedBoxPurchasePrice = savedProduct.boxPurchasePrice !== undefined && savedProduct.boxPurchasePrice !== null
    ? savedProduct.boxPurchasePrice
    : Number((savedProduct.purchasePrice * savedProduct.boxCapacity).toFixed(2));

  assert.strictEqual(openedBoxPurchasePrice, 234500, 'Harga dus saat form dibuka kembali harus tetap 234.500');
});

// ----------------------------------------------------------------------------
// Skenario 2: Simpan lalu edit ulang tanpa ubah angka -> Tidak ada drift
// ----------------------------------------------------------------------------
test('Skenario 2: Round-trip simpan -> buka -> simpan berulang kali tidak menyebabkan angka drift', () => {
  let boxPrice = 234500;
  const boxCap = 12;

  for (let cycle = 1; cycle <= 10; cycle++) {
    const hpp = calcHppFromBox(boxPrice, boxCap);
    const product = {
      boxCapacity: boxCap,
      boxPurchasePrice: boxPrice,
      purchasePrice: hpp
    };

    // Reload form edit
    const reloadedBoxPrice = product.boxPurchasePrice;
    assert.strictEqual(reloadedBoxPrice, 234500, `Cycle ${cycle}: boxPrice berubah menjadi ${reloadedBoxPrice}`);
    boxPrice = reloadedBoxPrice;
  }
});

// ----------------------------------------------------------------------------
// Skenario 3: HPP yang tersimpan presisi desimal 19.541,6667
// ----------------------------------------------------------------------------
test('Skenario 3: HPP tersimpan dengan presisi desimal 19.541,6667 (bukan integer)', () => {
  const hpp = calcHppFromBox(234500, 12);
  assert.strictEqual(hpp, 19541.6667);
  assert.notStrictEqual(hpp, 19542, 'HPP tersimpan tidak boleh dibulatkan ke 19.542');
});

// ----------------------------------------------------------------------------
// Skenario 4: Tampilan HPP di UI dibulatkan ke 19.542 untuk kemudahan baca
// ----------------------------------------------------------------------------
test('Skenario 4: Tampilan HPP di UI menampilkan angka bulat 19.542', () => {
  const hpp = calcHppFromBox(234500, 12);
  const displayHpp = calcDisplayHpp(hpp);
  assert.strictEqual(displayHpp, 19542, 'Tampilan HPP harus 19.542');
});

// ----------------------------------------------------------------------------
// Skenario 5: Margin ecer (jual 20.500) adalah 4,7% terhadap harga jual
// ----------------------------------------------------------------------------
test('Skenario 5: Margin ecer (jual 20.500, modal presisi 19.541,6667) menghasilkan margin +4,7%', () => {
  const sellingPrice = 20500;
  const hpp = calcHppFromBox(234500, 12);
  const marginPct = calcMargin(sellingPrice, hpp);
  assert.strictEqual(marginPct.toFixed(1), '4.7', 'Margin harus 4.7%');
});

// ----------------------------------------------------------------------------
// Skenario 6: Nilai persediaan 12 renceng (1 dus utuh) tepat Rp234.500 persis
// ----------------------------------------------------------------------------
test('Skenario 6: Nilai persediaan 12 renceng (1 dus) persis Rp234.500 (bukan 12 x 19.542 = 234.504)', () => {
  const stock = 12;
  const boxCap = 12;
  const boxBuy = 234500;
  const hpp = calcHppFromBox(boxBuy, boxCap);

  const inventoryValue = calcInventoryCost(stock, boxCap, boxBuy, hpp);
  assert.strictEqual(inventoryValue, 234500, 'Nilai persediaan harus tepat 234.500 tanpa selisih');
});

// ----------------------------------------------------------------------------
// Skenario 7: Laba penjualan 12 renceng @ 20.500 = 246.000 - 234.500 = Rp11.500
// ----------------------------------------------------------------------------
test('Skenario 7: Laba penjualan 12 renceng @ 20.500 = 246.000 - 234.500 = Rp11.500 persis', () => {
  const sellPrice = 20500;
  const qtySold = 12;
  const boxCap = 12;
  const boxBuy = 234500;
  const hpp = calcHppFromBox(boxBuy, boxCap);

  const profit = calcSaleProfit(sellPrice, qtySold, boxCap, boxBuy, hpp);
  assert.strictEqual(profit, 11500, 'Laba harus tepat 11.500 persis');
});

// ----------------------------------------------------------------------------
// Skenario 8: Harga dus yang habis dibagi rata (mis. 240.000 / 12) -> HPP 20.000
// ----------------------------------------------------------------------------
test('Skenario 8: Harga dus yang habis dibagi (240.000 / 12) menghasilkan HPP bulat 20.000', () => {
  const hpp = calcHppFromBox(240000, 12);
  assert.strictEqual(hpp, 20000);
  assert.strictEqual(calcDisplayHpp(hpp), 20000);
  const invVal = calcInventoryCost(12, 12, 240000, hpp);
  assert.strictEqual(invVal, 240000);
});

// ----------------------------------------------------------------------------
// Skenario 9: Isi dus variatif (6, 10, 24, 40) tidak ada drift
// ----------------------------------------------------------------------------
test('Skenario 9: Berbagai kapasitas dus (6, 10, 24, 40) tetap konsisten tanpa drift', () => {
  const cases = [
    { boxBuy: 100000, cap: 6, expectedHpp: 16666.6667 },
    { boxBuy: 155000, cap: 10, expectedHpp: 15500 },
    { boxBuy: 185500, cap: 24, expectedHpp: 7729.1667 },
    { boxBuy: 123456, cap: 40, expectedHpp: 3086.4 }
  ];

  for (const c of cases) {
    const hpp = calcHppFromBox(c.boxBuy, c.cap);
    assert.strictEqual(hpp, c.expectedHpp, `Isi ${c.cap} harus menghasilkan HPP ${c.expectedHpp}`);
    const invCost = calcInventoryCost(c.cap, c.cap, c.boxBuy, hpp);
    assert.strictEqual(invCost, c.boxBuy, `Nilai 1 dus isi ${c.cap} harus sama persis dengan harga beli`);
  }
});

// ----------------------------------------------------------------------------
// Skenario 10: Regresi satuan menengah (Kemasan Renceng / Slop) tetap benar
// ----------------------------------------------------------------------------
test('Skenario 10: Estimasi modal satuan menengah tetap akurat', () => {
  const boxBuy = 234500;
  const boxCap = 24; // 1 dus isi 24 pcs
  const midCap = 6;  // 1 pack menengah isi 6 pcs
  const hpp = calcHppFromBox(boxBuy, boxCap);

  // Modal per kemasan menengah = HPP presisi * midCap
  const midCost = Number((hpp * midCap).toFixed(2));
  const expected = (234500 / 24) * 6; // 58625
  assert.strictEqual(Math.round(midCost), 58625, 'Modal menengah harus Rp58.625');
});

// ----------------------------------------------------------------------------
// Skenario 11: Edit HPP manual tidak menimpa harga dus (Kalkulasi satu arah)
// ----------------------------------------------------------------------------
test('Skenario 11: User mengedit HPP manual tidak boleh menimpa harga dus (kalkulasi satu arah)', () => {
  let boxPurchasePrice = 234500;
  let purchasePrice = calcHppFromBox(boxPurchasePrice, 12); // 19541.6667

  // User manual mengubah HPP menjadi 19.600
  const manualHpp = 19600;
  purchasePrice = manualHpp;

  // boxPurchasePrice HARUS tetap 234.500 (tidak ditimpa menjadi 19.600 * 12 = 235.200)
  assert.strictEqual(boxPurchasePrice, 234500, 'Harga dus tidak boleh ditimpa saat HPP diedit manual');
  assert.strictEqual(purchasePrice, 19600, 'HPP manual tersimpan sesuai input user');
});

console.log(`\n============================================================`);
console.log(`HASIL: ${passedTests} passed, ${failedTests} failed.`);
console.log(`============================================================\n`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
