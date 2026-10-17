import 'dotenv/config';
import express from 'express';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { getIo } from './socket.mjs';

const { PrismaClient } = pkg;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const knownTenants = new Set();

// Bersihkan dummy/test tenant jika pernah dibuat saat testing agar database bersih
(async () => {
  try {
    await prisma.customer.deleteMany({
      where: { tenant_id: { in: ['TID-TEST-12345', 'TID-UNKNOWN'] } }
    }).catch(() => {});
    await prisma.tenant.deleteMany({
      where: { id: { in: ['TID-TEST-12345', 'TID-UNKNOWN'] } }
    }).catch(() => {});
  } catch (e) {}
})();

const notifyTenant = (tenantId, entity) => {
  const io = getIo();
  if (io) {
    io.to(tenantId).emit('data_updated', entity);
  }
};

// Produk selalu dikirim bersama kategori & daftar variannya
const PRODUCT_INCLUDE = {
  category: true,
  variants: { orderBy: { created_at: 'asc' } }
};

const optNum = (v) => (v === undefined || v === null || v === '' || Number(v) <= 0 ? null : Number(v));
// Qty boleh desimal (mis. 2,5 kg). Dibulatkan 3 angka di belakang koma agar tidak muncul sisa floating point.
const round3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

/**
 * Sinkronkan daftar varian sebuah produk (dipanggil di dalam transaksi DB).
 * - Varian dengan id yang sudah ada  -> nama & harga diperbarui (stok TIDAK diubah di sini;
 *   perubahan stok harus lewat Mutasi Stok agar tercatat).
 * - Varian baru                      -> dibuat dengan stok awal (umumnya 0, lalu diisi lewat mutasi IN).
 * - Varian yang tidak dikirim lagi   -> dihapus.
 * Setelah itu Product.stock = total stok semua varian.
 */
const syncProductVariants = async (tx, tenantId, productId, variants) => {
  const existing = await tx.productVariant.findMany({ where: { product_id: productId } });
  const existingIds = new Set(existing.map(v => v.id));
  const incomingIds = new Set();

  for (const v of variants) {
    const name = String(v.name || '').trim();
    if (!name) continue;
    const prices = {
      purchase_price: optNum(v.purchasePrice ?? v.purchase_price ?? v.harga_beli),
      selling_price: optNum(v.sellingPrice ?? v.selling_price ?? v.harga_jual),
      wholesale_price: optNum(v.wholesalePrice ?? v.wholesale_price ?? v.harga_grosir)
    };

    const matchByName = existing.find(e => e.name.toLowerCase() === name.toLowerCase());
    const vId = (v.id && existingIds.has(v.id)) ? v.id : (matchByName ? matchByName.id : null);

    if (vId && existingIds.has(vId)) {
      incomingIds.add(vId);
      const updateData = { name, ...prices };
      if (v.stock !== undefined && !isNaN(v.stock)) {
        updateData.stock = round3(v.stock);
      }
      await tx.productVariant.update({ where: { id: vId }, data: updateData });
    } else {
      const created = await tx.productVariant.create({
        data: {
          ...(v.id ? { id: v.id } : {}),
          tenant_id: tenantId,
          product_id: productId,
          name,
          stock: round3(v.stock || 0),
          ...prices
        }
      });
      incomingIds.add(created.id);
    }
  }

  const toDelete = existing.filter(v => !incomingIds.has(v.id)).map(v => v.id);
  if (toDelete.length > 0) {
    await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } });
  }

  if (incomingIds.size > 0) {
    const agg = await tx.productVariant.aggregate({ where: { product_id: productId }, _sum: { stock: true } });
    await tx.product.update({ where: { id: productId }, data: { stock: agg._sum.stock || 0 } });
  }
  return incomingIds.size;
};

// Middleware CORS dan Auth
app.use('/api/saas', async (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tenant-id');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = req.headers['x-tenant-id'] || 'TID-DEMO-123';
  req.tenantId = tenantId;

  // Pastikan tenant selalu ada di database (Self-Healing saat database di-reset/kosong)
  try {
    const existing = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });

    if (!existing) {
      await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: { 
          id: tenantId, 
          name: tenantId === 'TID-DEMO-123' ? 'VOC POS' : tenantId 
        }
      });
      
      // Auto-seed admin user jika belum ada user sama sekali di tenant ini
      const userCount = await prisma.user.count({ where: { tenant_id: tenantId } }).catch(() => 0);
      if (userCount === 0) {
        await prisma.user.create({
          data: {
            tenant_id: tenantId,
            username: 'admin',
            password_hash: 'admin',
            role: 'Admin',
            name: 'Administrator',
            is_active: true
          }
        }).catch(() => {});
      }
    }
  } catch(err) {
    if (err.code !== 'P2002') {
      console.error("Gagal verifikasi/upsert tenant:", err.message);
    }
  }
  
  next();
});

// ==========================================
// ENDPOINT PENGATURAN (SETTINGS)
// ==========================================
app.get('/api/saas/settings', async (req, res) => {
  try {
    let tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId }
    });
    if (!tenant) {
      tenant = await prisma.tenant.upsert({
        where: { id: req.tenantId },
        update: {},
        create: {
          id: req.tenantId,
          name: req.tenantId === 'TID-DEMO-123' ? 'VOC POS' : req.tenantId
        }
      });
    }
    res.json({
      appName: tenant.name,
      taxEnabled: tenant.tax_enabled,
      taxRate: tenant.tax_rate,
      roundingUnit: tenant.rounding_unit,
      invoiceHeader: tenant.invoice_header,
      invoiceFooter: tenant.invoice_footer,
      appLogo: tenant.app_logo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/settings', async (req, res) => {
  try {
    const data = req.body;
    const tenant = await prisma.tenant.upsert({
      where: { id: req.tenantId },
      update: {
        name: data.appName !== undefined ? data.appName : undefined,
        tax_enabled: data.taxEnabled !== undefined ? data.taxEnabled : undefined,
        tax_rate: data.taxRate !== undefined ? Number(data.taxRate) : undefined,
        rounding_unit: data.roundingUnit !== undefined ? Number(data.roundingUnit) : undefined,
        invoice_header: data.invoiceHeader !== undefined ? data.invoiceHeader : undefined,
        invoice_footer: data.invoiceFooter !== undefined ? data.invoiceFooter : undefined,
        app_logo: data.appLogo !== undefined ? data.appLogo : undefined
      },
      create: {
        id: req.tenantId,
        name: data.appName || 'VOC POS',
        tax_enabled: data.taxEnabled !== undefined ? data.taxEnabled : true,
        tax_rate: data.taxRate !== undefined ? Number(data.taxRate) : 11,
        rounding_unit: data.roundingUnit !== undefined ? Number(data.roundingUnit) : 0,
        invoice_header: data.invoiceHeader || null,
        invoice_footer: data.invoiceFooter || null,
        app_logo: data.appLogo || null
      }
    });
    notifyTenant(req.tenantId, 'settings');
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINT PRODUK
// ==========================================
app.get('/api/saas/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { tenant_id: req.tenantId, deleted_at: null },
      include: PRODUCT_INCLUDE
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/products', async (req, res) => {
  try {
    const data = req.body || {};
    if (!String(data.name || '').trim()) throw new ValidationError('Nama produk wajib diisi.');
    for (const [k, label] of [['purchasePrice', 'Harga beli'], ['sellingPrice', 'Harga jual'], ['wholesalePrice', 'Harga grosir'], ['stock', 'Stok'], ['minStock', 'Stok minimum']]) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '' && (!Number.isFinite(Number(data[k])) || Number(data[k]) < 0)) {
        throw new ValidationError(`${label} tidak valid.`);
      }
    }
    if (data.barcode) {
      const dupBarcode = await prisma.product.findFirst({ where: { tenant_id: req.tenantId, barcode: data.barcode, deleted_at: null } });
      if (dupBarcode) throw new ValidationError(`Barcode "${data.barcode}" sudah dipakai produk "${dupBarcode.name}".`);
    }
    let categoryId = null;
    
    // Jika ada nama kategori, cari atau buat kategori tersebut
    if (data.category) {
      const cat = await prisma.category.findFirst({
        where: { name: data.category, tenant_id: req.tenantId }
      });
      if (cat) {
        categoryId = cat.id;
      } else {
        const newCat = await prisma.category.create({
          data: { name: data.category, tenant_id: req.tenantId }
        });
        categoryId = newCat.id;
      }
    }

    const incomingVariants = Array.isArray(data.variants) ? data.variants.filter(v => v && String(v.name || '').trim()) : [];

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          tenant_id: req.tenantId,
          sku: data.sku,
          barcode: data.barcode,
          name: data.name,
          category_id: categoryId,
          purchase_price: Number(data.purchasePrice || 0),
          selling_price: Number(data.sellingPrice || 0),
          wholesale_price: Number(data.wholesalePrice || 0),
          stock: incomingVariants.length > 0 ? 0 : round3(data.stock),
          min_stock: Number(data.minStock || 0),
          unit: data.unit ? String(data.unit) : 'Pcs',
          image_url: data.image
        }
      });
      if (incomingVariants.length > 0) {
        await syncProductVariants(tx, req.tenantId, created.id, incomingVariants);
      }
      return tx.product.findUnique({ where: { id: created.id }, include: PRODUCT_INCLUDE });
    });
    notifyTenant(req.tenantId, 'products');
    res.json(product);
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/saas/products/:id', async (req, res) => {
  try {
    const data = req.body;
    let categoryId = undefined;
    
    if (data.category) {
      const cat = await prisma.category.findFirst({
        where: { name: data.category, tenant_id: req.tenantId }
      });
      if (cat) {
        categoryId = cat.id;
      } else {
        const newCat = await prisma.category.create({
          data: { name: data.category, tenant_id: req.tenantId }
        });
        categoryId = newCat.id;
      }
    }

    // Jika daftar varian dikirim -> sinkronkan; stok produk = total stok varian (data.stock diabaikan)
    const variantsProvided = Array.isArray(data.variants);
    const incomingVariants = variantsProvided ? data.variants.filter(v => v && String(v.name || '').trim()) : [];
    const hasVariants = incomingVariants.length > 0;

    const updateData = {};
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.name !== undefined) updateData.name = data.name;
    if (categoryId !== undefined) updateData.category_id = categoryId;
    if (data.purchasePrice !== undefined) updateData.purchase_price = Number(data.purchasePrice);
    if (data.sellingPrice !== undefined) updateData.selling_price = Number(data.sellingPrice);
    if (data.wholesalePrice !== undefined) updateData.wholesale_price = Number(data.wholesalePrice);
    if (data.stock !== undefined && !hasVariants) updateData.stock = Number(data.stock);
    if (data.minStock !== undefined) updateData.min_stock = Number(data.minStock);
    if (data.unit !== undefined && data.unit) updateData.unit = String(data.unit);
    if (data.image !== undefined) updateData.image_url = data.image;

    const product = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: req.params.id, tenant_id: req.tenantId },
        data: updateData
      });
      if (variantsProvided) {
        await syncProductVariants(tx, req.tenantId, req.params.id, incomingVariants);
      }
      return tx.product.findUnique({ where: { id: req.params.id }, include: PRODUCT_INCLUDE });
    });
    notifyTenant(req.tenantId, 'products');
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenant_id: req.tenantId }
    });
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan', code: 'NOT_FOUND' });

    // Produk yang sudah pernah terjual / punya mutasi stok dihapus secara SOFT DELETE:
    // hilang dari daftar produk & Kasir, tetapi barisnya tetap ada sehingga laporan penjualan,
    // invoice & riwayat mutasi stok tetap utuh (nama produk tetap tampil di riwayat).
    const [saleCount, mutationCount] = await Promise.all([
      prisma.transactionItem.count({ where: { product_id: product.id } }),
      prisma.stockTransactionItem.count({ where: { product_id: product.id } })
    ]);
    if (saleCount > 0 || mutationCount > 0) {
      await prisma.product.update({
        where: { id: product.id },
        data: { deleted_at: new Date(), is_active: false }
      });
      notifyTenant(req.tenantId, 'products');
      return res.json({ success: true, archived: true, saleCount, mutationCount });
    }

    await prisma.product.delete({
      where: { id: product.id }
    });
    notifyTenant(req.tenantId, 'products');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aktif/nonaktifkan produk (nonaktif = tidak tampil di Kasir POS, data & riwayat tetap utuh)
app.patch('/api/saas/products/:id/active', async (req, res) => {
  try {
    const active = !!req.body.active;
    const result = await prisma.product.updateMany({
      where: { id: req.params.id, tenant_id: req.tenantId },
      data: { is_active: active }
    });
    if (result.count === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: PRODUCT_INCLUDE });
    notifyTenant(req.tenantId, 'products');
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINT KATEGORI (CATEGORIES)
// ==========================================
app.get('/api/saas/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { tenant_id: req.tenantId }
    });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/categories', async (req, res) => {
  try {
    const data = req.body;
    const existing = await prisma.category.findFirst({
      where: { tenant_id: req.tenantId, name: data.name }
    });
    if (existing) return res.json(existing);
    
    const category = await prisma.category.create({
      data: { tenant_id: req.tenantId, name: data.name }
    });
    notifyTenant(req.tenantId, 'categories');
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/categories/by-name/:name', async (req, res) => {
  try {
    const data = req.body; // { newName: string }
    const oldName = req.params.name;
    
    // First find the category by name
    const category = await prisma.category.findFirst({
      where: { name: oldName, tenant_id: req.tenantId }
    });
    
    if (category) {
      await prisma.category.update({
        where: { id: category.id },
        data: { name: data.newName }
      });
    } else {
      // Create if it didn't exist
      await prisma.category.create({
        data: { tenant_id: req.tenantId, name: data.newName }
      });
    }
    
    notifyTenant(req.tenantId, 'categories');
    notifyTenant(req.tenantId, 'products');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/categories/by-name/:name', async (req, res) => {
  try {
    const category = await prisma.category.findFirst({
      where: { name: req.params.name, tenant_id: req.tenantId }
    });
    
    if (category) {
      // First update products that have this category to null or 'Uncategorized'
      await prisma.product.updateMany({
        where: { category_id: category.id, tenant_id: req.tenantId },
        data: { category_id: null }
      });
      
      await prisma.category.delete({
        where: { id: category.id }
      });
    }
    
    notifyTenant(req.tenantId, 'categories');
    notifyTenant(req.tenantId, 'products');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINT PELANGGAN (CUSTOMERS)
// ==========================================
app.get('/api/saas/customers', async (req, res) => {
  try {
    let customers = await prisma.customer.findMany({
      where: { tenant_id: req.tenantId },
      orderBy: { name: 'asc' }
    });

    // Pastikan pelanggan default "Retail" selalu ada untuk menampung transaksi kasir reguler/eceran
    const hasRetail = customers.some(c => (c.name || '').trim().toLowerCase() === 'retail');
    if (!hasRetail) {
      try {
        const retailCust = await prisma.customer.create({
          data: {
            tenant_id: req.tenantId,
            name: 'Retail',
            phone: '0',
            address: 'Pelanggan Umum / Eceran Kasir'
          }
        });
        customers = [retailCust, ...customers];
      } catch (e) {
        console.error('Failed to auto-create Retail customer:', e);
      }
    }

    const transactions = await prisma.transaction.findMany({
      where: { tenant_id: req.tenantId },
      include: { items: { include: { product: true } } },
      orderBy: { created_at: 'desc' }
    });

    const stockTransactions = await prisma.stockTransaction.findMany({
      where: { tenant_id: req.tenantId, type: 'OUT' },
      include: { items: { include: { product: true } } },
      orderBy: { date: 'desc' }
    });

    // Gabungkan order dari tabel transaksi & mutasi keluar (deduplikasi berdasarkan nomor dokumen/nota)
    const txMap = new Map();
    for (const t of transactions) {
      const docNo = t.receipt_number;
      if (!docNo) continue;
      txMap.set(docNo, {
        orderId: docNo,
        date: t.created_at,
        total: Number(t.total_amount || 0),
        paymentMethod: t.payment_method || 'TUNAI',
        cashier: t.cashier_name || t.cashier_id || 'Kasir',
        customerId: t.customer_id,
        customerName: t.customer_name,
        items: (t.items || []).map(i => ({
          productId: i.product_id,
          variantId: i.variant_id || undefined,
          variantName: i.variant_name || undefined,
          name: i.product?.name || 'Produk',
          qty: i.quantity,
          price: Number(i.price_at_time || 0),
          subtotal: Number(i.subtotal || 0)
        }))
      });
    }

    for (const st of stockTransactions) {
      const docNo = st.document_no;
      if (!docNo || txMap.has(docNo)) continue;
      txMap.set(docNo, {
        orderId: docNo,
        date: st.date,
        total: Number(st.total_value || 0),
        paymentMethod: 'TUNAI',
        cashier: st.employee_id || 'Kasir',
        customerId: st.customer_id,
        customerName: st.customer_name,
        items: (st.items || []).map(i => ({
          productId: i.product_id,
          variantId: i.variant_id || undefined,
          variantName: i.variant_name || undefined,
          name: i.product?.name || 'Produk',
          qty: i.qty,
          price: Number(i.purchase_price || 0),
          subtotal: Number(i.subtotal || 0)
        }))
      });
    }

    const allOrders = Array.from(txMap.values());

    const customersWithOrders = customers.map(c => {
      const isRetail = (c.name || '').trim().toLowerCase() === 'retail';
      const custOrders = allOrders.filter(t => {
        if (t.customerId && t.customerId === c.id) return true;
        if (t.customerName && t.customerName.trim().toLowerCase() === (c.name || '').trim().toLowerCase()) return true;
        if (isRetail && (!t.customerId || t.customerName === 'Umum (Guest)' || (t.customerName || '').trim().toLowerCase() === 'retail')) {
          return true;
        }
        return false;
      });

      return {
        ...c,
        orders: custOrders,
        totalOrder: custOrders.length,
        totalSpent: custOrders.reduce((sum, o) => sum + (o.total || 0), 0)
      };
    });

    res.json(customersWithOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/customers', async (req, res) => {
  try {
    const data = req.body;
    if (!data.name || !data.name.trim()) {
      return res.status(400).json({ error: 'Nama pelanggan wajib diisi.' });
    }

    // Pastikan tenant selalu ada di database untuk mencegah foreign key violation
    await prisma.tenant.upsert({
      where: { id: req.tenantId },
      update: {},
      create: {
        id: req.tenantId,
        name: req.tenantId === 'TID-DEMO-123' ? 'VOC POS' : req.tenantId
      }
    }).catch(() => {});

    const custId = (data.id && String(data.id).trim()) ? String(data.id).trim() : ('CUST-' + Date.now().toString());

    // Cek apakah ID sudah ada
    const existing = await prisma.customer.findUnique({
      where: { id: custId }
    });

    let customer;
    if (existing) {
      customer = await prisma.customer.update({
        where: { id: custId },
        data: {
          name: data.name.trim(),
          phone: data.phone ? String(data.phone).trim() : '',
          address: data.address ? String(data.address).trim() : ''
        }
      });
    } else {
      customer = await prisma.customer.create({
        data: {
          id: custId,
          tenant_id: req.tenantId,
          name: data.name.trim(),
          phone: data.phone ? String(data.phone).trim() : '',
          address: data.address ? String(data.address).trim() : ''
        }
      });
    }

    notifyTenant(req.tenantId, 'customers');
    res.json(customer);
  } catch (err) {
    console.error("Gagal tambah customer:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/customers/:id', async (req, res) => {
  try {
    const data = req.body;
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        name: data.name !== undefined ? String(data.name).trim() : undefined,
        phone: data.phone !== undefined ? String(data.phone).trim() : undefined,
        address: data.address !== undefined ? String(data.address).trim() : undefined
      }
    });
    notifyTenant(req.tenantId, 'customers');
    res.json(customer);
  } catch (err) {
    console.error("Gagal update customer:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/customers/:id', async (req, res) => {
  try {
    await prisma.customer.delete({
      where: { id: req.params.id }
    });
    notifyTenant(req.tenantId, 'customers');
    res.json({ success: true });
  } catch (err) {
    console.error("Gagal delete customer:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINT TRANSAKSI (KASIR)
// ==========================================
app.get('/api/saas/transactions', async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { tenant_id: req.tenantId },
      include: { items: { include: { product: true } } },
      orderBy: { created_at: 'desc' }
    });

    const result = transactions.map(t => ({
      ...t,
      cashier_name: t.cashier_name || t.cashier_id
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saas/transactions/:id', async (req, res) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id, tenant_id: req.tenantId },
      include: { items: { include: { product: true } } }
    });
    if (!transaction) return res.status(404).json({ error: "Not found" });
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/transactions', async (req, res) => {
  try {
    const data = req.body;
    const { receipt_number, total_amount, payment_method, cashier_id, cashier_name, items, customer_id, customer_name } = data;
    
    if (!receipt_number) throw new ValidationError('Nomor struk wajib diisi.');
    if (!Array.isArray(items) || items.length === 0) throw new ValidationError('Keranjang kosong.');
    if (!Number.isFinite(Number(total_amount)) || Number(total_amount) < 0) throw new ValidationError('Total transaksi tidak valid.');
    if (!payment_method) throw new ValidationError('Metode pembayaran wajib diisi.');
    for (const it of items) {
      if (!it || !it.product_id) throw new ValidationError('Ada item tanpa produk.');
      if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) throw new ValidationError('Jumlah item harus lebih dari 0.');
    }
    const productIds = [...new Set(items.map(it => it.product_id))];
    const validCount = await prisma.product.count({ where: { id: { in: productIds }, tenant_id: req.tenantId } });
    if (validCount !== productIds.length) throw new ValidationError('Ada produk di keranjang yang tidak ditemukan. Muat ulang halaman lalu coba lagi.');

    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Buat Header Transaksi
      const newTx = await tx.transaction.create({
        data: {
          tenant_id: req.tenantId,
          cashier_id: cashier_id || 'cashier-1',
          cashier_name: cashier_name || 'Unknown',
          receipt_number,
          total_amount: Number(total_amount),
          payment_method,
          customer_id: customer_id || null,
          customer_name: customer_name || null
        }
      });

      // 2. Masukkan Item Transaksi & Mutasi Stok (Atomic)
      const stockMutation = await tx.stockTransaction.create({
        data: {
          tenant_id: req.tenantId,
          type: 'OUT',
          document_no: receipt_number,
          employee_id: cashier_id || 'cashier-1',
          total_value: Number(total_amount),
          note: 'Penjualan Kasir',
          customer_id: customer_id || null,
          customer_name: customer_name || null
        }
      });

      for (const item of items) {
        // Validasi varian (jika item ini varian) & ambil nama varian sebagai snapshot
        let variantId = null;
        let variantName = null;
        if (item.variant_id) {
          const variant = await tx.productVariant.findFirst({
            where: { id: item.variant_id, product_id: item.product_id, tenant_id: req.tenantId }
          });
          if (!variant) throw new Error('Varian produk tidak ditemukan: ' + (item.variant_name || item.variant_id));
          variantId = variant.id;
          variantName = variant.name;
        }

        // Record di Nota
        await tx.transactionItem.create({
          data: {
            transaction_id: newTx.id,
            product_id: item.product_id,
            quantity: round3(item.quantity),
            price_at_time: item.price,
            subtotal: item.subtotal,
            variant_id: variantId,
            variant_name: variantName,
            original_price: item.original_price != null ? Number(item.original_price) : (item.originalPrice != null ? Number(item.originalPrice) : item.price),
            is_custom_price: Boolean(item.is_custom_price || item.isCustomPrice),
            custom_price_note: item.custom_price_note || item.customPriceNote || (Boolean(item.is_custom_price || item.isCustomPrice) ? 'Harga Khusus' : null)
          }
        });

        // Record di Mutasi
        await tx.stockTransactionItem.create({
          data: {
            stock_transaction_id: stockMutation.id,
            product_id: item.product_id,
            qty: round3(item.quantity),
            purchase_price: item.price,
            subtotal: item.subtotal,
            variant_id: variantId,
            variant_name: variantName
          }
        });

        // Kurangi stok varian (jika ada) secara ATOMIC
        let variantStockAfter = null;
        if (variantId) {
          const uv = await tx.productVariant.update({
            where: { id: variantId },
            data: { stock: { decrement: round3(item.quantity) } }
          });
          variantStockAfter = uv.stock;
        }

        // Kurangi stok produk (total) secara ATOMIC (Mencegah Race Condition)
        const updatedProduct = await tx.product.update({
          where: { id: item.product_id, tenant_id: req.tenantId },
          data: { stock: { decrement: round3(item.quantity) } }
        });

        // Notify if stock is depleted
        const depleted = variantId ? variantStockAfter <= 0 : updatedProduct.stock <= 0;
        if (depleted) {
          const io = getIo();
          if (io) {
            io.to(req.tenantId).emit('stock_depleted', {
              productName: variantName ? `${updatedProduct.name} - ${variantName}` : updatedProduct.name,
              stock: variantId ? variantStockAfter : updatedProduct.stock
            });
          }
        }
      }

      return newTx;
    });

    notifyTenant(req.tenantId, 'transactions');
    notifyTenant(req.tenantId, 'sales');
    notifyTenant(req.tenantId, 'products'); // Because stock changed
    notifyTenant(req.tenantId, 'stock-transactions'); // Mutasi stok otomatis ter-update
    notifyTenant(req.tenantId, 'customers'); // Pelanggan orders re-sync otomatis

    // Explicit notification for incoming sale & stock mutation
    const io = getIo();
    if (io) {
      io.to(req.tenantId).emit('sale_completed', {
        amount: Number(total_amount),
        cashier: cashier_name || 'Unknown',
        receiptNumber: receipt_number,
        paymentMethod: payment_method,
        customerId: customer_id || null,
        customerName: customer_name || null
      });
      io.to(req.tenantId).emit('stock_mutation_updated', {
        type: 'OUT',
        documentNo: receipt_number,
        totalValue: Number(total_amount),
        note: 'Penjualan Kasir'
      });
      io.to(req.tenantId).emit('customer_orders_updated', {
        customerId: customer_id || null,
        customerName: customer_name || null,
        receiptNumber: receipt_number
      });
    }

    res.json(transaction);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// ENDPOINT STOCK TRANSACTIONS
// ==========================================
app.get('/api/saas/stock-transactions', async (req, res) => {
  try {
    const txs = await prisma.stockTransaction.findMany({
      where: { tenant_id: req.tenantId },
      include: { items: { include: { product: true } } },
      orderBy: { date: 'desc' }
    });
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const sendError = (res, err) => {
  if (!(err instanceof ValidationError)) console.error('[API]', err);
  res.status(err.status || 500).json({ error: err.message });
};
const STOCK_TYPES = ['IN', 'OUT', 'ADJUSTMENT'];

app.post('/api/saas/stock-transactions', async (req, res) => {
  try {
    const data = req.body || {};
    const type = String(data.type || '').toUpperCase();
    if (!STOCK_TYPES.includes(type)) throw new ValidationError('Tipe transaksi tidak valid (IN / OUT / ADJUSTMENT).');

    const documentNo = String(data.documentNo || '').trim();
    if (!documentNo) throw new ValidationError('Nomor dokumen wajib diisi.');

    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) throw new ValidationError('Minimal 1 barang harus diisi.');

    const supplierId = data.supplierId || null;
    const note = data.note || null;
    const onCredit = data.onCredit !== false; // default: pembelian dari supplier = hutang

    const transaction = await prisma.$transaction(async (tx) => {
      // --- Validasi header ---
      if (supplierId) {
        const supp = await tx.supplier.findFirst({ where: { id: supplierId, tenant_id: req.tenantId } });
        if (!supp) throw new ValidationError('Supplier tidak ditemukan.');
        if (type === 'IN') {
          const dup = await tx.stockTransaction.findFirst({
            where: { tenant_id: req.tenantId, type: 'IN', supplier_id: { not: null }, document_no: documentNo }
          });
          if (dup) throw new ValidationError(`No. Faktur "${documentNo}" sudah pernah dipakai. Gunakan nomor lain.`);
        }
      }

      // --- Validasi & normalisasi setiap baris ---
      const seen = new Set();
      const productCache = new Map();
      const lines = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i] || {};
        const label = `Baris ${i + 1}`;
        if (!item.productId) throw new ValidationError(`${label}: produk belum dipilih.`);

        let product = productCache.get(item.productId);
        if (!product) {
          product = await tx.product.findFirst({
            where: { id: item.productId, tenant_id: req.tenantId, deleted_at: null },
            include: { variants: true }
          });
          if (product) productCache.set(item.productId, product);
        }
        if (!product) throw new ValidationError(`${label}: produk tidak ditemukan / sudah dihapus.`);

        const qty = round3(item.qty);
        if (!Number.isFinite(qty) || qty === 0) throw new ValidationError(`${label} (${product.name}): jumlah harus diisi.`);
        if (type !== 'ADJUSTMENT' && qty < 0) throw new ValidationError(`${label} (${product.name}): jumlah tidak boleh negatif.`);

        const price = Number(item.purchasePrice || 0);
        if (!Number.isFinite(price) || price < 0) throw new ValidationError(`${label} (${product.name}): harga beli tidak valid.`);
        if (type === 'IN' && price <= 0) throw new ValidationError(`${label} (${product.name}): harga beli wajib lebih dari 0.`);

        // --- Varian ---
        const hasVariants = product.variants.length > 0;
        const newVariantName = String(item.newVariantName || '').trim();
        let variant = null;
        let createVariantName = null;

        if (item.variantId) {
          variant = product.variants.find(v => v.id === item.variantId);
          if (!variant) throw new ValidationError(`${label} (${product.name}): varian tidak ditemukan.`);
        } else if (newVariantName) {
          if (type !== 'IN') throw new ValidationError(`${label} (${product.name}): varian baru hanya bisa dibuat saat barang masuk.`);
          // Nama sama dengan varian yang sudah ada -> pakai varian itu (tidak duplikat)
          variant = product.variants.find(v => v.name.trim().toLowerCase() === newVariantName.toLowerCase()) || null;
          if (!variant) {
            if (!hasVariants && product.stock > 0) {
              throw new ValidationError(`${label} (${product.name}): produk ini belum punya varian tetapi masih ada stok ${product.stock}. Atur varian terlebih dahulu di Manajemen Stok agar stok awal tidak hilang.`);
            }
            createVariantName = newVariantName;
          }
        } else if (hasVariants) {
          throw new ValidationError(`${label} (${product.name}): pilih varian (produk ini memiliki ${product.variants.length} varian).`);
        }

        const key = `${product.id}::${variant ? variant.id : createVariantName ? 'new:' + createVariantName.toLowerCase() : ''}`;
        if (seen.has(key)) throw new ValidationError(`${label} (${product.name}${variant ? ' - ' + variant.name : createVariantName ? ' - ' + createVariantName : ''}): barang sama muncul dua kali. Gabungkan jumlahnya.`);
        seen.add(key);

        let stockChange = qty;
        if (type === 'OUT') stockChange = -Math.abs(qty);
        else if (type === 'IN') stockChange = Math.abs(qty);

        if (type === 'OUT') {
          const available = variant ? variant.stock : product.stock;
          if (available < Math.abs(qty)) throw new ValidationError(`${label} (${product.name}): stok tidak cukup (tersedia ${available}).`);
        }

        lines.push({ item, product, variant, createVariantName, qty, price, stockChange });
      }

      // --- Header (total dihitung ulang di server) ---
      const totalValue = type === 'IN'
        ? lines.reduce((s, l) => s + Math.round(Math.abs(l.qty) * l.price), 0)
        : Number(data.totalValue || 0);

      const newTx = await tx.stockTransaction.create({
        data: {
          tenant_id: req.tenantId,
          type,
          ...(data.date && !isNaN(new Date(data.date).getTime()) ? { date: new Date(data.date) } : {}),
          document_no: documentNo,
          supplier_id: supplierId,
          employee_id: data.employeeId || 'cashier-1',
          total_value: totalValue,
          note,
          customer_id: data.customerId || null,
          customer_name: data.customerName || null,
          on_credit: onCredit
        }
      });

      // --- Eksekusi baris ---
      for (const l of lines) {
        let variantId = l.variant ? l.variant.id : null;
        let variantName = l.variant ? l.variant.name : null;

        if (l.createVariantName) {
          const created = await tx.productVariant.create({
            data: {
              tenant_id: req.tenantId,
              product_id: l.product.id,
              name: l.createVariantName,
              stock: 0,
              purchase_price: optNum(l.price),
              selling_price: optNum(l.item.sellingPrice)
            }
          });
          variantId = created.id;
          variantName = created.name;
        }

        await tx.stockTransactionItem.create({
          data: {
            stock_transaction_id: newTx.id,
            product_id: l.product.id,
            qty: l.qty,
            batch_no: l.item.batchNo || null,
            expiry_date: l.item.expiryDate || null,
            purchase_price: l.price,
            subtotal: Math.round(Math.abs(l.qty) * l.price),
            variant_id: variantId,
            variant_name: variantName
          }
        });

        if (variantId) {
          await tx.productVariant.update({
            where: { id: variantId },
            data: { stock: { increment: l.stockChange } }
          });
        }

        const productUpdate = { stock: { increment: l.stockChange } };
        // Barang masuk dari pembelian -> HPP produk dihitung rata-rata tertimbang (weighted average)
        if (type === 'IN' && l.price > 0) {
          const oldQty = Math.max(0, l.product.stock);
          const newQty = oldQty + Math.abs(l.qty);
          productUpdate.purchase_price = newQty > 0
            ? Math.round(((oldQty * (l.product.purchase_price || 0)) + (Math.abs(l.qty) * l.price)) / newQty)
            : l.price;
          // Produk dengan beberapa baris varian: stok awal baris berikutnya harus ikut yang terbaru
          l.product.stock = newQty;
          l.product.purchase_price = productUpdate.purchase_price;
        }
        await tx.product.update({
          where: { id: l.product.id },
          data: productUpdate
        });
      }

      // --- Hutang supplier (satu transaksi DB dengan stok: gagal = rollback semua) ---
      if (type === 'IN' && supplierId && onCredit && totalValue > 0) {
        await tx.supplier.updateMany({
          where: { id: supplierId, tenant_id: req.tenantId },
          data: { payable: { increment: totalValue } }
        });
      }

      return tx.stockTransaction.findUnique({
        where: { id: newTx.id },
        include: { items: true }
      });
    });

    notifyTenant(req.tenantId, 'stock-transactions');
    notifyTenant(req.tenantId, 'transactions');
    notifyTenant(req.tenantId, 'products'); // Because stock changed
    if (type === 'IN' && supplierId) notifyTenant(req.tenantId, 'suppliers');
    const io = getIo();
    if (io) {
      io.to(req.tenantId).emit('stock_mutation_updated', {
        type,
        documentNo,
        totalValue: transaction.total_value,
        note
      });
    }
    res.json(transaction);
  } catch (err) {
    sendError(res, err);
  }
});

// Ubah / pindahkan supplier pada faktur pembelian (satu atau banyak). Hutang ikut berpindah otomatis.
app.patch('/api/saas/stock-transactions/supplier', async (req, res) => {
  try {
    const body = req.body || {};
    const list = Array.isArray(body.ids) ? [...new Set(body.ids.filter(Boolean))] : [];
    if (list.length === 0) throw new ValidationError('Pilih minimal 1 faktur.');
    const newSupplierId = body.supplierId || null;
    const onCredit = body.onCredit !== false;

    await prisma.$transaction(async (tx) => {
      if (newSupplierId) {
        const target = await tx.supplier.findFirst({ where: { id: newSupplierId, tenant_id: req.tenantId } });
        if (!target) throw new ValidationError('Supplier tujuan tidak ditemukan.');
      }
      const txs = await tx.stockTransaction.findMany({ where: { id: { in: list }, tenant_id: req.tenantId } });
      if (txs.length !== list.length) throw new ValidationError('Sebagian faktur tidak ditemukan.', 404);

      for (const t of txs) {
        if (t.type !== 'IN') throw new ValidationError(`Faktur ${t.document_no} bukan pembelian / barang masuk.`);
        const total = Number(t.total_value) || 0;

        // 1) Tarik hutang dari supplier lama (jika faktur ini dulu tercatat hutang)
        if (t.supplier_id && t.on_credit && total > 0) {
          const old = await tx.supplier.findFirst({ where: { id: t.supplier_id, tenant_id: req.tenantId } });
          if (old) {
            await tx.supplier.update({ where: { id: old.id }, data: { payable: Math.max(0, old.payable - total) } });
          }
        }
        // 2) Bebankan ke supplier baru (jika dicatat hutang)
        if (newSupplierId && onCredit && total > 0) {
          await tx.supplier.update({ where: { id: newSupplierId }, data: { payable: { increment: total } } });
        }
        await tx.stockTransaction.update({
          where: { id: t.id },
          data: { supplier_id: newSupplierId, on_credit: newSupplierId ? onCredit : false }
        });
      }
    });

    notifyTenant(req.tenantId, 'stock-transactions');
    notifyTenant(req.tenantId, 'suppliers');
    res.json({ success: true, count: list.length });
  } catch (err) {
    sendError(res, err);
  }
});

// Batalkan faktur pembelian (IN): stok & hutang dikembalikan. Mutasi lain (penjualan/koreksi) tidak boleh dihapus.
app.delete('/api/saas/stock-transactions/:id', async (req, res) => {
  try {
    const transactionId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const stockTx = await tx.stockTransaction.findFirst({
        where: { id: transactionId, tenant_id: req.tenantId },
        include: { items: true }
      });
      if (!stockTx) throw new ValidationError('Transaksi tidak ditemukan.', 404);
      if (stockTx.type !== 'IN') {
        throw new ValidationError('Hanya faktur pembelian / barang masuk yang dapat dibatalkan.');
      }

      // Validasi: stok saat ini harus cukup untuk ditarik kembali (jangan sampai stok minus)
      for (const item of stockTx.items) {
        const qty = Math.abs(round3(item.qty));
        const product = await tx.product.findFirst({ where: { id: item.product_id, tenant_id: req.tenantId } });
        if (!product) continue;
        const variant = item.variant_id ? await tx.productVariant.findUnique({ where: { id: item.variant_id } }) : null;
        const available = variant ? variant.stock : product.stock;
        if (available < qty) {
          const nm = variant ? `${product.name} - ${variant.name}` : product.name;
          throw new ValidationError(`Tidak bisa dibatalkan: stok "${nm}" tinggal ${available}, sedangkan faktur ini memasukkan ${qty}. Sebagian barang sudah terjual/terpakai.`);
        }
      }

      for (const item of stockTx.items) {
        const dec = Math.abs(round3(item.qty));
        if (item.variant_id) {
          const v = await tx.productVariant.findUnique({ where: { id: item.variant_id } });
          if (v) {
            await tx.productVariant.update({ where: { id: v.id }, data: { stock: { decrement: dec } } });
          }
        }
        await tx.product.update({
          where: { id: item.product_id },
          data: { stock: { decrement: dec } }
        });
      }

      // Hutang dikembalikan (tidak boleh minus) hanya jika faktur ini memang menambah hutang
      if (stockTx.on_credit && stockTx.total_value > 0) {
        const supp = await tx.supplier.findFirst({ where: { id: stockTx.supplier_id, tenant_id: req.tenantId } });
        if (supp) {
          await tx.supplier.update({
            where: { id: supp.id },
            data: { payable: Math.max(0, supp.payable - Number(stockTx.total_value)) }
          });
        }
      }

      await tx.stockTransactionItem.deleteMany({ where: { stock_transaction_id: transactionId } });
      await tx.stockTransaction.delete({ where: { id: transactionId } });
      return stockTx;
    });

    notifyTenant(req.tenantId, 'stock-transactions');
    notifyTenant(req.tenantId, 'transactions');
    notifyTenant(req.tenantId, 'products');
    notifyTenant(req.tenantId, 'suppliers');

    res.json({ success: true, message: 'Faktur pembelian dibatalkan, stok dan hutang telah dikembalikan.' });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// ENDPOINT SUPPLIER
// ==========================================
app.get('/api/saas/suppliers', async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { tenant_id: req.tenantId }
    });
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/suppliers', async (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.name || '').trim();
    if (!name) throw new ValidationError('Nama supplier wajib diisi.');
    const payable = Number(data.payable || 0);
    const term = Number(data.paymentTermDays || 0);
    if (!Number.isFinite(payable) || payable < 0) throw new ValidationError('Hutang awal tidak valid.');
    if (!Number.isFinite(term) || term < 0) throw new ValidationError('Tempo pembayaran tidak valid.');
    const dup = await prisma.supplier.findFirst({
      where: { tenant_id: req.tenantId, name: { equals: name, mode: 'insensitive' } }
    });
    if (dup) throw new ValidationError(`Supplier "${name}" sudah terdaftar.`);
    const supplier = await prisma.supplier.create({
      data: {
        tenant_id: req.tenantId,
        name,
        contact: data.contact,
        phone: data.phone,
        payment_term_days: term,
        payable
      }
    });
    notifyTenant(req.tenantId, 'suppliers');
    res.json(supplier);
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/saas/suppliers/:id', async (req, res) => {
  try {
    const data = req.body || {};
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenant_id: req.tenantId } });
    if (!existing) throw new ValidationError('Supplier tidak ditemukan.', 404);

    const updateData = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new ValidationError('Nama supplier wajib diisi.');
      updateData.name = name;
    }
    if (data.contact !== undefined) updateData.contact = data.contact;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.paymentTermDays !== undefined) {
      const term = Number(data.paymentTermDays);
      if (!Number.isFinite(term) || term < 0) throw new ValidationError('Tempo pembayaran tidak valid.');
      updateData.payment_term_days = term;
    }
    if (data.payable !== undefined) {
      const payable = Number(data.payable);
      if (!Number.isFinite(payable) || payable < 0) throw new ValidationError('Hutang tidak valid.');
      updateData.payable = payable;
    }

    const supplier = await prisma.supplier.update({
      where: { id: existing.id },
      data: updateData
    });
    notifyTenant(req.tenantId, 'suppliers');
    res.json(supplier);
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/saas/suppliers/:id', async (req, res) => {
  try {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenant_id: req.tenantId } });
    if (!existing) throw new ValidationError('Supplier tidak ditemukan.', 404);
    if (existing.payable > 0) throw new ValidationError('Supplier masih memiliki hutang. Lunasi dulu sebelum menghapus.', 409);
    const [paymentCount, purchaseCount] = await Promise.all([
      prisma.supplierPayment.count({ where: { supplier_id: existing.id } }),
      prisma.stockTransaction.count({ where: { tenant_id: req.tenantId, supplier_id: existing.id } })
    ]);
    if (paymentCount > 0 || purchaseCount > 0) {
      throw new ValidationError('Supplier sudah memiliki riwayat pembelian/pembayaran sehingga tidak dapat dihapus.', 409);
    }
    await prisma.supplier.delete({ where: { id: existing.id } });
    notifyTenant(req.tenantId, 'suppliers');
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// ENDPOINT KARYAWAN (USERS)
// ==========================================
app.get('/api/saas/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenant_id: req.tenantId }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/users', async (req, res) => {
  try {
    const data = req.body;
    const user = await prisma.user.create({
      data: {
        tenant_id: req.tenantId,
        username: data.username,
        password_hash: data.password, // Ideally hashed, using plain for now as per legacy auth
        role: data.role || 'Cashier',
        name: data.name,
        pin: data.pin,
        shift: data.shift || "A",
        is_active: data.isActive !== undefined ? data.isActive : true,
        id: data.id // Optional explicit ID
      }
    });
    notifyTenant(req.tenantId, 'users');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/users/:id', async (req, res) => {
  try {
    const data = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id, tenant_id: req.tenantId },
      data: {
        username: data.username !== undefined ? data.username : undefined,
        password_hash: data.password !== undefined ? data.password : undefined,
        role: data.role !== undefined ? data.role : undefined,
        name: data.name !== undefined ? data.name : undefined,
        pin: data.pin !== undefined ? data.pin : undefined,
        shift: data.shift !== undefined && data.shift ? data.shift : undefined,
        is_active: data.isActive !== undefined ? data.isActive : undefined
      }
    });
    notifyTenant(req.tenantId, 'users');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/users/:id', async (req, res) => {
  try {
    await prisma.user.delete({
      where: { id: req.params.id, tenant_id: req.tenantId }
    });
    notifyTenant(req.tenantId, 'users');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINT DRAFTS (Draft Tersimpan Realtime)
// ==========================================
app.get('/api/saas/drafts/:key', async (req, res) => {
  try {
    const draft = await prisma.draft.findUnique({
      where: { tenant_id_key: { tenant_id: req.tenantId, key: req.params.key } }
    });
    res.json(draft ? JSON.parse(draft.value) : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/drafts/:key', async (req, res) => {
  try {
    const data = req.body; // should be JSON object/array
    const draft = await prisma.draft.upsert({
      where: { tenant_id_key: { tenant_id: req.tenantId, key: req.params.key } },
      update: { value: JSON.stringify(data) },
      create: { tenant_id: req.tenantId, key: req.params.key, value: JSON.stringify(data) }
    });
    // Broadcast explicitly for this draft key
    const io = getIo();
    if (io) {
      io.to(req.tenantId).emit(`draft_updated_${req.params.key}`, data);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// ENDPOINT SUPPLIER PAYMENTS (PEMBAYARAN HUTANG)
// ==========================================
app.get('/api/saas/supplier-payments', async (req, res) => {
  try {
    const payments = await prisma.supplierPayment.findMany({
      where: { tenant_id: req.tenantId },
      include: { supplier: true },
      orderBy: { created_at: 'desc' }
    });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/supplier-payments', async (req, res) => {
  try {
    const data = req.body || {};
    const amount = Number(data.amount);
    if (!data.supplierId) throw new ValidationError('Supplier wajib dipilih.');
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Nominal pembayaran harus lebih dari 0.');

    const payment = await prisma.$transaction(async (tx) => {
      const supp = await tx.supplier.findFirst({ where: { id: data.supplierId, tenant_id: req.tenantId } });
      if (!supp) throw new ValidationError('Supplier tidak ditemukan.', 404);
      if (amount > supp.payable) {
        throw new ValidationError(`Nominal melebihi total hutang (${supp.payable}).`);
      }
      const created = await tx.supplierPayment.create({
        data: {
          tenant_id: req.tenantId,
          supplier_id: supp.id,
          amount,
          payment_method: data.paymentMethod || "CASH",
          note: data.note
        }
      });
      await tx.supplier.update({
        where: { id: supp.id },
        data: { payable: { decrement: amount } }
      });
      return created;
    });

    notifyTenant(req.tenantId, 'suppliers'); // Trigger refresh to frontend
    res.json(payment);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// ENDPOINTS EXPORT & IMPORT DATA (EXCEL)
// ==========================================
app.get('/api/saas/export/all', async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // 1. Settings & Tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    // 2. Products with category
    const products = await prisma.product.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' }
    });

    // 3. Categories
    const categories = await prisma.category.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' }
    });

    // 4. Stock Transactions (Mutasi Stok)
    const stockTransactions = await prisma.stockTransaction.findMany({
      where: { tenant_id: tenantId },
      include: { items: { include: { product: true } } },
      orderBy: { date: 'desc' }
    });

    // 5. Sales Transactions (Kasir)
    const transactions = await prisma.transaction.findMany({
      where: { tenant_id: tenantId },
      include: { items: { include: { product: true } } },
      orderBy: { created_at: 'desc' }
    });

    // 6. Customers
    const customers = await prisma.customer.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' }
    });

    // 7. Suppliers with payments
    const suppliers = await prisma.supplier.findMany({
      where: { tenant_id: tenantId },
      include: { payments: true },
      orderBy: { name: 'asc' }
    });

    // 8. Employees / Users
    const users = await prisma.user.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        is_active: true,
        created_at: true
      },
      orderBy: { name: 'asc' }
    });

    // 9. Drafts (Purchase Orders / Penerimaan Barang)
    const drafts = await prisma.draft.findMany({
      where: { tenant_id: tenantId }
    });

    // 10. Hitung Riwayat Order Pelanggan Rinci (Cross-reference dari transactions & stock mutations)
    const txMap = new Map();
    for (const t of transactions) {
      const docNo = t.receipt_number;
      if (!docNo) continue;
      txMap.set(docNo, {
        orderId: docNo,
        date: t.created_at,
        total: Number(t.total_amount || 0),
        paymentMethod: t.payment_method || 'TUNAI',
        cashier: t.cashier_name || t.cashier_id || 'Kasir',
        customerId: t.customer_id,
        customerName: t.customer_name,
        items: (t.items || []).map(i => ({
          productId: i.product_id,
          variantId: i.variant_id || undefined,
          variantName: i.variant_name || undefined,
          name: i.product?.name || 'Produk',
          qty: i.quantity,
          price: Number(i.price_at_time || 0),
          subtotal: Number(i.subtotal || 0),
          originalPrice: i.original_price != null ? Number(i.original_price) : undefined,
          isCustomPrice: Boolean(i.is_custom_price),
          customPriceNote: i.custom_price_note || undefined
        }))
      });
    }

    for (const st of stockTransactions) {
      if (st.type !== 'OUT') continue;
      const docNo = st.document_no;
      if (!docNo || txMap.has(docNo)) continue;
      txMap.set(docNo, {
        orderId: docNo,
        date: st.date,
        total: Number(st.total_value || 0),
        paymentMethod: 'TUNAI',
        cashier: st.employee_id || 'Kasir',
        customerId: st.customer_id,
        customerName: st.customer_name,
        items: (st.items || []).map(i => ({
          productId: i.product_id,
          variantId: i.variant_id || undefined,
          variantName: i.variant_name || undefined,
          name: i.product?.name || 'Produk',
          qty: i.qty,
          price: Number(i.purchase_price || 0),
          subtotal: Number(i.subtotal || 0)
        }))
      });
    }

    const allCustomerOrders = Array.from(txMap.values());

    const customersWithOrders = customers.map(c => {
      const isRetail = (c.name || '').trim().toLowerCase() === 'retail';
      const custOrders = allCustomerOrders.filter(t => {
        if (t.customerId && t.customerId === c.id) return true;
        if (t.customerName && t.customerName.trim().toLowerCase() === (c.name || '').trim().toLowerCase()) return true;
        if (isRetail && (!t.customerId || t.customerName === 'Umum (Guest)' || (t.customerName || '').trim().toLowerCase() === 'retail')) {
          return true;
        }
        return false;
      });

      return {
        ...c,
        orders: custOrders,
        totalOrder: custOrders.length,
        totalSpent: custOrders.reduce((sum, o) => sum + (o.total || 0), 0)
      };
    });

    // Calculate Financial & Sales Analytics
    const totalSalesAmount = transactions.reduce((acc, t) => acc + (t.total_amount || 0), 0);
    const totalStockCost = products.reduce((acc, p) => acc + ((p.stock || 0) * (p.purchase_price || 0)), 0);
    const totalStockRetailValue = products.reduce((acc, p) => acc + ((p.stock || 0) * (p.selling_price || 0)), 0);
    const totalSupplierDebt = suppliers.reduce((acc, s) => acc + (s.payable || 0), 0);

    const paymentMethodsMap = {};
    for (const t of transactions) {
      const pm = t.payment_method || 'TUNAI';
      paymentMethodsMap[pm] = (paymentMethodsMap[pm] || 0) + (t.total_amount || 0);
    }

    const productSalesMap = {};
    for (const t of transactions) {
      for (const item of (t.items || [])) {
        const pName = item.product?.name || 'Produk';
        if (!productSalesMap[pName]) {
          productSalesMap[pName] = { name: pName, qty: 0, revenue: 0 };
        }
        productSalesMap[pName].qty += (item.quantity || 0);
        productSalesMap[pName].revenue += (item.subtotal || 0);
      }
    }
    const topProducts = Object.values(productSalesMap).sort((a, b) => b.qty - a.qty).slice(0, 20);

    res.json({
      storeName: tenant?.name || 'POS Mart',
      exportedAt: new Date().toISOString(),
      analytics: {
        totalSalesAmount,
        totalTransactions: transactions.length,
        averageBasketSize: transactions.length > 0 ? Math.round(totalSalesAmount / transactions.length) : 0,
        totalProductsCount: products.length,
        totalStockCost,
        totalStockRetailValue,
        estimatedProfitValue: totalStockRetailValue - totalStockCost,
        totalSupplierDebt,
        paymentMethods: paymentMethodsMap,
        topSellingProducts: topProducts
      },
      products,
      categories,
      stockTransactions,
      transactions,
      customers: customersWithOrders,
      customerOrders: allCustomerOrders,
      suppliers,
      users,
      drafts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/import/master', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { products, customers, suppliers, users } = req.body;
    const stats = { products: 0, customers: 0, suppliers: 0, users: 0, updatedProducts: 0, variants: 0 };

    // 1. Import Produk
    if (Array.isArray(products) && products.length > 0) {
      for (const p of products) {
        if (!p.name && !p.nama) continue;
        const pName = String(p.name || p.nama || '').trim();
        const pId = p.id ? String(p.id).trim() : null;
        const pBarcode = (p.barcode && String(p.barcode).trim() !== '-') ? String(p.barcode).trim() : null;
        const pSku = (p.sku && String(p.sku).trim() !== '-') ? String(p.sku).trim() : null;
        const pCategory = p.category || p.kategori ? String(p.category || p.kategori).trim() : null;
        const pUnit = p.unit || p.satuan ? String(p.unit || p.satuan).trim() : 'Pcs';

        const pSellPrice = Number(p.selling_price ?? p.sellingPrice ?? p.harga_jual ?? p.hargaJual ?? 0);
        const pBuyPrice = Number(p.purchase_price ?? p.purchasePrice ?? p.harga_beli ?? p.hargaBeli ?? 0);
        const pWholesalePrice = Number(p.wholesale_price ?? p.wholesalePrice ?? p.harga_grosir ?? p.hargaGrosir ?? pSellPrice);
        const pStock = Number(p.stock ?? p.stok ?? 0);
        const pMinStock = Number(p.min_stock ?? p.minStock ?? p.min_stok ?? 0);

        let categoryId = null;
        if (pCategory) {
          let cat = await prisma.category.findFirst({
            where: { tenant_id: tenantId, name: { equals: pCategory, mode: 'insensitive' } }
          });
          if (!cat) {
            cat = await prisma.category.create({
              data: { tenant_id: tenantId, name: pCategory }
            });
          }
          categoryId = cat.id;
        }

        let existing = null;
        // Priority 1: Match by Product ID (unique primary key from database)
        if (pId) {
          existing = await prisma.product.findFirst({
            where: { tenant_id: tenantId, deleted_at: null, id: pId }
          });
        }
        // Priority 2: Match by Barcode
        if (!existing && pBarcode) {
          existing = await prisma.product.findFirst({
            where: { tenant_id: tenantId, deleted_at: null, barcode: pBarcode }
          });
        }
        // Priority 3: Match by SKU
        if (!existing && pSku) {
          existing = await prisma.product.findFirst({
            where: { tenant_id: tenantId, deleted_at: null, sku: pSku }
          });
        }
        // Priority 4: Match by exact or normalized product name
        if (!existing) {
          existing = await prisma.product.findFirst({
            where: { tenant_id: tenantId, deleted_at: null, name: { equals: pName, mode: 'insensitive' } }
          });
          if (!existing) {
            // Check normalized whitespace (e.g. multiple spaces in name)
            const normName = pName.replace(/\s+/g, ' ').trim().toLowerCase();
            const allCandidates = await prisma.product.findMany({
              where: { tenant_id: tenantId, deleted_at: null }
            });
            existing = allCandidates.find(c => c.name.replace(/\s+/g, ' ').trim().toLowerCase() === normName) || null;
          }
        }

        let targetProdId = null;
        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              name: pName,
              sku: pSku || existing.sku,
              barcode: pBarcode || existing.barcode,
              unit: pUnit || existing.unit || 'Pcs',
              category_id: categoryId || existing.category_id,
              // Jangan timpa harga valid dengan 0 jika data impor bernilai 0/kosong
              selling_price: pSellPrice > 0 ? pSellPrice : existing.selling_price,
              purchase_price: pBuyPrice > 0 ? pBuyPrice : existing.purchase_price,
              wholesale_price: pWholesalePrice > 0 ? pWholesalePrice : existing.wholesale_price,
              // Produk bervarian: stok dihitung dari total varian, jangan ditimpa lewat import
              stock: (await prisma.productVariant.count({ where: { product_id: existing.id } })) > 0
                ? existing.stock
                : (pStock !== undefined && !isNaN(pStock) && pStock !== 0 ? pStock : existing.stock),
              min_stock: !isNaN(pMinStock) && pMinStock >= 0 ? pMinStock : existing.min_stock
            }
          });
          targetProdId = existing.id;
          stats.updatedProducts++;
        } else {
          let safeId = undefined;
          if (pId) {
            const idTaken = await prisma.product.findUnique({ where: { id: pId } });
            if (!idTaken) safeId = pId;
          }

          const created = await prisma.product.create({
            data: {
              id: safeId,
              tenant_id: tenantId,
              name: pName,
              sku: pSku,
              barcode: pBarcode,
              unit: pUnit,
              category_id: categoryId,
              selling_price: !isNaN(pSellPrice) && pSellPrice >= 0 ? pSellPrice : 0,
              purchase_price: !isNaN(pBuyPrice) && pBuyPrice >= 0 ? pBuyPrice : 0,
              wholesale_price: !isNaN(pWholesalePrice) && pWholesalePrice >= 0 ? pWholesalePrice : pSellPrice,
              stock: !isNaN(pStock) ? pStock : 0,
              min_stock: !isNaN(pMinStock) ? pMinStock : 0
            }
          });
          targetProdId = created.id;
          stats.products++;
        }

        // Sinkronisasi varian jika data produk memiliki rincian varian
        if (targetProdId && Array.isArray(p.variants) && p.variants.length > 0) {
          const varCount = await syncProductVariants(prisma, tenantId, targetProdId, p.variants);
          stats.variants = (stats.variants || 0) + (varCount || 0);
        }
      }
      notifyTenant(tenantId, 'products');
      notifyTenant(tenantId, 'categories');
    }

    // 2. Import Pelanggan
    if (Array.isArray(customers) && customers.length > 0) {
      for (const c of customers) {
        if (!c.name && !c.nama) continue;
        const cName = String(c.name || c.nama || '').trim();
        const cId = c.id ? String(c.id).trim() : null;
        const cPhone = String(c.phone || c.telepon || c.no_telp || c.no_telepon || '0').trim();
        const cAddress = String(c.address || c.alamat || '').trim();

        let existing = null;
        if (cId) {
          existing = await prisma.customer.findFirst({
            where: { tenant_id: tenantId, id: cId }
          });
        }
        if (!existing && cPhone && cPhone !== '0' && cPhone !== '-') {
          existing = await prisma.customer.findFirst({
            where: { tenant_id: tenantId, phone: cPhone }
          });
        }
        if (!existing) {
          existing = await prisma.customer.findFirst({
            where: { tenant_id: tenantId, name: { equals: cName, mode: 'insensitive' } }
          });
        }

        if (existing) {
          await prisma.customer.update({
            where: { id: existing.id },
            data: {
              name: cName,
              phone: (cPhone && cPhone !== '0' && cPhone !== '-') ? cPhone : existing.phone,
              address: cAddress || existing.address
            }
          });
          stats.updatedCustomers = (stats.updatedCustomers || 0) + 1;
        } else {
          await prisma.customer.create({
            data: {
              id: cId || undefined,
              tenant_id: tenantId,
              name: cName,
              phone: cPhone,
              address: cAddress
            }
          });
          stats.customers++;
        }
      }
      notifyTenant(tenantId, 'customers');
    }

    // 3. Import Supplier
    if (Array.isArray(suppliers) && suppliers.length > 0) {
      for (const s of suppliers) {
        if (!s.name && !s.nama) continue;
        const sName = String(s.name || s.nama || '').trim();
        const sId = s.id ? String(s.id).trim() : null;
        const sContact = String(s.contact || s.kontak || '').trim();
        const sPhone = String(s.phone || s.telepon || '').trim();
        const sTerm = Number(s.payment_term_days || s.termin || 0);
        const sPayable = Number(s.payable || s.hutang || 0);

        let existing = null;
        if (sId) {
          existing = await prisma.supplier.findFirst({
            where: { tenant_id: tenantId, id: sId }
          });
        }
        if (!existing) {
          existing = await prisma.supplier.findFirst({
            where: { tenant_id: tenantId, name: { equals: sName, mode: 'insensitive' } }
          });
        }

        if (existing) {
          await prisma.supplier.update({
            where: { id: existing.id },
            data: {
              name: sName,
              contact: sContact || existing.contact,
              phone: sPhone || existing.phone,
              payment_term_days: sTerm >= 0 ? sTerm : existing.payment_term_days,
              payable: sPayable >= 0 ? sPayable : existing.payable
            }
          });
          stats.updatedSuppliers = (stats.updatedSuppliers || 0) + 1;
        } else {
          await prisma.supplier.create({
            data: {
              id: sId || undefined,
              tenant_id: tenantId,
              name: sName,
              contact: sContact,
              phone: sPhone,
              payment_term_days: sTerm,
              payable: sPayable
            }
          });
          stats.suppliers++;
        }
      }
      notifyTenant(tenantId, 'suppliers');
    }

    // 4. Import Karyawan (Users)
    if (Array.isArray(users) && users.length > 0) {
      for (const u of users) {
        if (!u.username) continue;
        const username = String(u.username).trim().toLowerCase();
        const uId = u.id ? String(u.id).trim() : null;
        const name = String(u.name || u.nama || username).trim();
        const role = String(u.role || u.peran || 'Cashier').trim();
        const pin = String(u.pin || '123456');

        let existing = null;
        if (uId) {
          existing = await prisma.user.findFirst({
            where: { tenant_id: tenantId, id: uId }
          });
        }
        if (!existing) {
          existing = await prisma.user.findFirst({
            where: { tenant_id: tenantId, username }
          });
        }

        const shift = u.shift ? String(u.shift).toUpperCase() : 'A';
        const isActive = u.is_active !== undefined ? Boolean(u.is_active) : true;

        if (existing) {
          const updateData = { name, role, pin };
          if (u.shift) updateData.shift = shift;
          if (u.is_active !== undefined) updateData.is_active = isActive;
          if (u.password) updateData.password_hash = u.password;
          await prisma.user.update({
            where: { id: existing.id },
            data: updateData
          });
          stats.updatedUsers = (stats.updatedUsers || 0) + 1;
        } else {
          await prisma.user.create({
            data: {
              id: uId || undefined,
              tenant_id: tenantId,
              username,
              name,
              password_hash: u.password || 'admin123',
              pin,
              role,
              shift: shift,
              is_active: isActive
            }
          });
          stats.users++;
        }
      }
      notifyTenant(tenantId, 'users');
    }

    res.json({
      success: true,
      message: 'Import data berhasil diproses',
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Wrapper untuk middleware Vite
export const saasApiMiddleware = (req, res, next) => {
  if (req.url && req.url.startsWith('/api/saas')) {
    app(req, res, (err) => {
      if (!req.url) req.url = '/';
      next(err);
    });
    return;
  }
  next();
};

export const manifestMiddleware = (req, res, next) => {
  if (req.url === '/manifest.webmanifest' || req.url === '/manifest.json') {
    prisma.tenant.findUnique({ where: { id: 'TID-DEMO-123' } }).then(async (mainTenant) => {
      let tenant = mainTenant;
      if (!tenant || tenant.name.startsWith('TID-')) {
        const customTenant = await prisma.tenant.findFirst({
          where: { NOT: { name: { startsWith: 'TID-' } } }
        });
        if (customTenant) tenant = customTenant;
      }
      const appName = tenant?.name || 'VELCO PRO SHOP';
      const manifest = {
        name: appName,
        short_name: appName,
        description: `Aplikasi Point of Sale & Back-Office ${appName}.`,
        lang: "id",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#ffffff",
        theme_color: "#f9f9fb",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      };
      res.setHeader('Content-Type', 'application/manifest+json');
      res.end(JSON.stringify(manifest));
    }).catch(err => {
      console.error("Gagal generate manifest:", err);
      next();
    });
    return;
  }
  next();
};
