import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, database: 'posmart' });

async function runApiRoundTripTest() {
  console.log('=== MENJALANKAN TEST DATABASE ROUNDTRIP ===\n');

  // Cari atau buat tenant
  const tenantRes = await pool.query('SELECT id FROM tenants LIMIT 1');
  if (tenantRes.rows.length === 0) {
    console.log('Tidak ada tenant, lewati DB integration test.');
    process.exit(0);
  }
  const tenantId = tenantRes.rows[0].id;
  const testSku = 'TEST-HPP-' + Date.now();

  // 1. Simpan produk baru dengan harga dus 234.500 dan isi 12
  const insertRes = await pool.query(`
    INSERT INTO products (
      id, tenant_id, sku, barcode, name, unit, 
      box_capacity, box_purchase_price, purchase_price, selling_price, stock
    ) VALUES (
      gen_random_uuid(), $1, $2, $2, 'Kopi Susu Renceng Test', 'Renceng',
      12, 234500, 19541.6667, 20500, 12
    ) RETURNING *
  `, [tenantId, testSku]);

  const created = insertRes.rows[0];
  console.log('1. Produk dibuat di DB:');
  console.log(`   - ID: ${created.id}`);
  console.log(`   - box_purchase_price: ${created.box_purchase_price}`);
  console.log(`   - purchase_price: ${created.purchase_price}`);
  console.log(`   - box_capacity: ${created.box_capacity}`);

  assert.strictEqual(Number(created.box_purchase_price), 234500, 'Harga dus harus persis 234.500');
  assert.strictEqual(Number(created.purchase_price), 19541.6667, 'HPP harus 19.541,6667');

  // 2. Simulasi form edit reload: pastikan harga dus dibaca dari box_purchase_price
  const loadedRes = await pool.query('SELECT * FROM products WHERE id = $1', [created.id]);
  const loaded = loadedRes.rows[0];
  assert.strictEqual(Number(loaded.box_purchase_price), 234500);

  // 3. Simulasi update produk (misal ganti nama atau simpan ulang tanpa ubah angka)
  await pool.query(`
    UPDATE products
    SET name = 'Kopi Susu Renceng Test Updated',
        box_purchase_price = $1,
        purchase_price = $2
    WHERE id = $3
  `, [loaded.box_purchase_price, loaded.purchase_price, loaded.id]);

  const reloadedRes = await pool.query('SELECT * FROM products WHERE id = $1', [created.id]);
  const reloaded = reloadedRes.rows[0];
  assert.strictEqual(Number(reloaded.box_purchase_price), 234500, 'Tidak boleh drift setelah update');
  console.log('\n2. Reloaded & Updated successfully tanpa drift:');
  console.log(`   - box_purchase_price tetap: ${reloaded.box_purchase_price}`);
  console.log(`   - purchase_price tetap: ${reloaded.purchase_price}`);

  // 4. Bersihkan data test
  await pool.query('DELETE FROM products WHERE id = $1', [created.id]);
  console.log('\n✅ DB Roundtrip test passed!\n');
  process.exit(0);
}

runApiRoundTripTest().catch(err => {
  console.error('❌ DB Roundtrip error:', err);
  process.exit(1);
});
