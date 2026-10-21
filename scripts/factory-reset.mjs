import 'dotenv/config';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { PrismaClient } = pkg;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function factoryReset() {
  console.log('\n==========================================================');
  console.log('         MEMPROSES FACTORY RESET DATABASE POS MART        ');
  console.log('==========================================================\n');

  console.log('[1/4] Mengosongkan seluruh data tabel (TRUNCATE CASCADE)...');
  
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      sales_return_items,
      sales_returns,
      transaction_payments,
      stock_transaction_items,
      stock_transactions,
      transaction_items,
      transactions,
      product_variants,
      products,
      categories,
      drafts,
      supplier_payments,
      suppliers,
      customers,
      users,
      tenants
    RESTART IDENTITY CASCADE;
  `);

  console.log('  [✓] Seluruh tabel transaksi, produk, stok, dan kontak telah dikosongkan.');

  console.log('\n[2/4] Menyiapkan data awal standar toko (Factory State)...');

  // 1. Tenant Default
  await prisma.tenant.create({
    data: {
      id: 'TID-DEMO-123',
      name: 'POS MART',
      tax_enabled: true,
      tax_rate: 11,
      rounding_unit: 0,
      invoice_header: 'POS MART\nJl. Swalayan Modern No. 1\nTelp: 0812-3456-7890',
      invoice_footer: 'Terima kasih atas kunjungan Anda.\nBarang yang sudah dibeli tidak dapat ditukar/dikembalikan.'
    }
  });
  console.log('  [✓] Toko / Tenant berhasil dibuat: POS MART (ID: TID-DEMO-123)');

  // 2. Akun Administrator
  await prisma.user.create({
    data: {
      tenant_id: 'TID-DEMO-123',
      name: 'Administrator',
      username: 'admin',
      password_hash: 'admin',
      pin: '123456',
      role: 'Admin',
      is_active: true,
      shift: 'A'
    }
  });
  console.log('  [✓] Akun Administrator: Username: admin | Password: admin | PIN: 123456');

  // 3. Akun Kasir Default
  await prisma.user.create({
    data: {
      tenant_id: 'TID-DEMO-123',
      name: 'Kasir 1',
      username: 'kasir',
      password_hash: 'kasir',
      pin: '111111',
      role: 'Cashier',
      is_active: true,
      shift: 'A'
    }
  });
  console.log('  [✓] Akun Kasir 1      : Username: kasir | Password: kasir | PIN: 111111');

  // 4. Kategori Default (Umum)
  await prisma.category.create({
    data: {
      tenant_id: 'TID-DEMO-123',
      name: 'Umum'
    }
  });
  console.log('  [✓] Kategori Standar  : "Umum"');

  // 5. Pelanggan Retail / Umum
  await prisma.customer.create({
    data: {
      tenant_id: 'TID-DEMO-123',
      name: 'Umum (Retail)',
      phone: '0',
      address: '-'
    }
  });
  console.log('  [✓] Pelanggan Standar : "Umum (Retail)"');

  console.log('\n[3/4] Membersihkan file database lokal sementara jika ada...');
  const devDbPath = path.resolve(process.cwd(), 'dev.db');
  if (fs.existsSync(devDbPath)) {
    try {
      fs.unlinkSync(devDbPath);
      console.log('  [✓] dev.db lama dibersihkan.');
    } catch (e) {
      // Abaikan jika sedang terkunci
    }
  }

  console.log('\n[4/4] Verifikasi Integritas Database...');
  const tenantCount = await prisma.tenant.count();
  const userCount = await prisma.user.count();
  const prodCount = await prisma.product.count();
  const trxCount = await prisma.transaction.count();

  console.log(`  - Tenant Aktif : ${tenantCount}`);
  console.log(`  - Pengguna     : ${userCount} (admin & kasir)`);
  console.log(`  - Produk       : ${prodCount} (Bersih & Kosong)`);
  console.log(`  - Transaksi    : ${trxCount} (Bersih & Kosong)`);

  console.log('\n==========================================================');
  console.log('    ✓ FACTORY RESET BERHASIL! DATABASE KEMBALI SEPERTI BARU');
  console.log('==========================================================\n');
}

factoryReset()
  .catch((err) => {
    console.error('\n[X] Terjadi kegagalan saat factory reset:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
