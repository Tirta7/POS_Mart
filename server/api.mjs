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

const notifyTenant = (tenantId, entity) => {
  const io = getIo();
  if (io) {
    io.to(tenantId).emit('data_updated', entity);
  }
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

  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) {
    return res.status(401).json({ error: 'Missing x-tenant-id header.' });
  }
  
  // Pastikan tenant ada di database untuk menghindari error foreign key
  if (!knownTenants.has(tenantId)) {
    try {
      await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: { id: tenantId, name: tenantId }
      });
      
      // Auto-seed admin user jika belum ada user sama sekali di tenant ini
      const userCount = await prisma.user.count({ where: { tenant_id: tenantId } });
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
        });
      }

      knownTenants.add(tenantId);
    } catch(err) {
      if (err.code === 'P2002') {
        // Race condition: tenant baru saja dimasukkan oleh request lain secara bersamaan
        knownTenants.add(tenantId);
      } else {
        console.error("Gagal upsert tenant:", err);
      }
    }
  }
  
  req.tenantId = tenantId;
  next();
});

// ==========================================
// ENDPOINT PENGATURAN (SETTINGS)
// ==========================================
app.get('/api/saas/settings', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId }
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
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
    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId },
      data: {
        name: data.appName !== undefined ? data.appName : undefined,
        tax_enabled: data.taxEnabled !== undefined ? data.taxEnabled : undefined,
        tax_rate: data.taxRate !== undefined ? Number(data.taxRate) : undefined,
        rounding_unit: data.roundingUnit !== undefined ? Number(data.roundingUnit) : undefined,
        invoice_header: data.invoiceHeader !== undefined ? data.invoiceHeader : undefined,
        invoice_footer: data.invoiceFooter !== undefined ? data.invoiceFooter : undefined,
        app_logo: data.appLogo !== undefined ? data.appLogo : undefined
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
      where: { tenant_id: req.tenantId },
      include: { category: true }
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/products', async (req, res) => {
  try {
    const data = req.body;
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

    const product = await prisma.product.create({
      data: {
        tenant_id: req.tenantId,
        sku: data.sku,
        barcode: data.barcode,
        name: data.name,
        category_id: categoryId,
        purchase_price: Number(data.purchasePrice || 0),
        selling_price: Number(data.sellingPrice || 0),
        wholesale_price: Number(data.wholesalePrice || 0),
        stock: Number(data.stock || 0),
        min_stock: Number(data.minStock || 0),
        image_url: data.image
      },
      include: { category: true }
    });
    notifyTenant(req.tenantId, 'products');
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const updateData = {};
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.name !== undefined) updateData.name = data.name;
    if (categoryId !== undefined) updateData.category_id = categoryId;
    if (data.purchasePrice !== undefined) updateData.purchase_price = Number(data.purchasePrice);
    if (data.sellingPrice !== undefined) updateData.selling_price = Number(data.sellingPrice);
    if (data.wholesalePrice !== undefined) updateData.wholesale_price = Number(data.wholesalePrice);
    if (data.stock !== undefined) updateData.stock = Number(data.stock);
    if (data.minStock !== undefined) updateData.min_stock = Number(data.minStock);
    if (data.image !== undefined) updateData.image_url = data.image;

    const product = await prisma.product.update({
      where: { id: req.params.id, tenant_id: req.tenantId },
      data: updateData,
      include: { category: true }
    });
    notifyTenant(req.tenantId, 'products');
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/products/:id', async (req, res) => {
  try {
    await prisma.product.delete({
      where: { id: req.params.id, tenant_id: req.tenantId }
    });
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
    const customers = await prisma.customer.findMany({
      where: { tenant_id: req.tenantId }
    });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/customers', async (req, res) => {
  try {
    const data = req.body;
    const customer = await prisma.customer.create({
      data: {
        tenant_id: req.tenantId,
        name: data.name,
        phone: data.phone,
        address: data.address
      }
    });
    notifyTenant(req.tenantId, 'customers');
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/customers/:id', async (req, res) => {
  try {
    const data = req.body;
    const customer = await prisma.customer.update({
      where: { id: req.params.id, tenant_id: req.tenantId },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        address: data.address !== undefined ? data.address : undefined
      }
    });
    notifyTenant(req.tenantId, 'customers');
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/customers/:id', async (req, res) => {
  try {
    await prisma.customer.delete({
      where: { id: req.params.id, tenant_id: req.tenantId }
    });
    notifyTenant(req.tenantId, 'customers');
    res.json({ success: true });
  } catch (err) {
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
    const { receipt_number, total_amount, payment_method, cashier_id, cashier_name, items } = data;
    
    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Buat Header Transaksi
      const newTx = await tx.transaction.create({
        data: {
          tenant_id: req.tenantId,
          cashier_id: cashier_id || 'cashier-1',
          cashier_name: cashier_name || 'Unknown',
          receipt_number,
          total_amount: Number(total_amount),
          payment_method
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
          note: 'Penjualan Kasir'
        }
      });

      for (const item of items) {
        // Record di Nota
        await tx.transactionItem.create({
          data: {
            transaction_id: newTx.id,
            product_id: item.product_id,
            quantity: item.quantity,
            price_at_time: item.price,
            subtotal: item.subtotal
          }
        });

        // Record di Mutasi
        await tx.stockTransactionItem.create({
          data: {
            stock_transaction_id: stockMutation.id,
            product_id: item.product_id,
            qty: item.quantity,
            purchase_price: item.price,
            subtotal: item.subtotal
          }
        });

        // Kurangi stok secara ATOMIC (Mencegah Race Condition)
        const updatedProduct = await tx.product.update({
          where: { id: item.product_id, tenant_id: req.tenantId },
          data: { stock: { decrement: item.quantity } }
        });

        // Notify if stock is depleted
        if (updatedProduct.stock <= 0) {
          const io = getIo();
          if (io) {
            io.to(req.tenantId).emit('stock_depleted', {
              productName: updatedProduct.name,
              stock: updatedProduct.stock
            });
          }
        }
      }

      return newTx;
    });

    notifyTenant(req.tenantId, 'transactions');
    notifyTenant(req.tenantId, 'sales');
    notifyTenant(req.tenantId, 'products'); // Because stock changed
    
    // Explicit notification for incoming sale
    const io = getIo();
    if (io) {
      io.to(req.tenantId).emit('sale_completed', {
        amount: Number(total_amount),
        cashier: cashier_name || 'Unknown',
        receiptNumber: receipt_number,
        paymentMethod: payment_method
      });
    }

    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINT STOCK TRANSACTIONS
// ==========================================
app.get('/api/saas/stock-transactions', async (req, res) => {
  try {
    const txs = await prisma.stockTransaction.findMany({
      where: { tenant_id: req.tenantId },
      include: { items: true },
      orderBy: { date: 'desc' }
    });
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/stock-transactions', async (req, res) => {
  try {
    const data = req.body;
    const { type, documentNo, supplierId, employeeId, totalValue, note, customerId, customerName, items } = data;
    
    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Buat Header Transaksi
      const newTx = await tx.stockTransaction.create({
        data: {
          tenant_id: req.tenantId,
          type,
          document_no: documentNo,
          supplier_id: supplierId,
          employee_id: employeeId || 'cashier-1',
          total_value: Number(totalValue),
          note,
          customer_id: customerId,
          customer_name: customerName
        }
      });

      // 2. Masukkan Item dan Update Stok Produk
      for (const item of items) {
        await tx.stockTransactionItem.create({
          data: {
            stock_transaction_id: newTx.id,
            product_id: item.productId,
            qty: item.qty,
            batch_no: item.batchNo,
            expiry_date: item.expiryDate,
            purchase_price: Number(item.purchasePrice),
            subtotal: Number(item.subtotal)
          }
        });

        // Update stok (qty bisa positif atau negatif tergantung IN/OUT/ADJUSTMENT)
        let stockChange = Number(item.qty);
        if (type === 'OUT') stockChange = -Math.abs(stockChange);
        else if (type === 'IN') stockChange = Math.abs(stockChange);

        await tx.product.update({
          where: { id: item.productId, tenant_id: req.tenantId },
          data: { stock: { increment: stockChange } }
        });
      }

      return newTx;
    });

    notifyTenant(req.tenantId, 'stock-transactions');
    notifyTenant(req.tenantId, 'products'); // Because stock changed
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const data = req.body;
    const supplier = await prisma.supplier.create({
      data: {
        tenant_id: req.tenantId,
        name: data.name,
        contact: data.contact,
        phone: data.phone,
        payment_term_days: Number(data.paymentTermDays || 0)
      }
    });
    notifyTenant(req.tenantId, 'suppliers');
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/suppliers/:id', async (req, res) => {
  try {
    const data = req.body;
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id, tenant_id: req.tenantId },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        contact: data.contact !== undefined ? data.contact : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        payment_term_days: data.paymentTermDays !== undefined ? Number(data.paymentTermDays) : undefined
      }
    });
    notifyTenant(req.tenantId, 'suppliers');
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/suppliers/:id', async (req, res) => {
  try {
    await prisma.supplier.delete({
      where: { id: req.params.id, tenant_id: req.tenantId }
    });
    notifyTenant(req.tenantId, 'suppliers');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
