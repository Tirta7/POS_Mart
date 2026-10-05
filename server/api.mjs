import 'dotenv/config';
import express from 'express';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { PrismaClient } = pkg;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
app.use(express.json());

// Middleware CORS dan Auth
app.use('/api/saas', async (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tenant-id');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) {
    return res.status(401).json({ error: 'Missing x-tenant-id header.' });
  }
  
  // Pastikan tenant ada di database untuk menghindari error foreign key
  try {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: tenantId }
    });
  } catch(err) {
    console.error("Gagal upsert tenant:", err);
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
    res.json(transactions);
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
    const { receipt_number, total_amount, payment_method, cashier_id, items } = data;
    
    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Buat Header Transaksi
      const newTx = await tx.transaction.create({
        data: {
          tenant_id: req.tenantId,
          cashier_id: cashier_id || 'cashier-1',
          receipt_number,
          total_amount: Number(total_amount),
          payment_method
        }
      });

      // 2. Masukkan Item dan Kurangi Stok Produk
      for (const item of items) {
        await tx.transactionItem.create({
          data: {
            transaction_id: newTx.id,
            product_id: item.product_id,
            quantity: item.quantity,
            price_at_time: item.price,
            subtotal: item.subtotal
          }
        });

        // Kurangi stok
        await tx.product.update({
          where: { id: item.product_id, tenant_id: req.tenantId },
          data: { stock: { decrement: item.quantity } }
        });
      }

      return newTx;
    });

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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wrapper untuk middleware Vite
export const saasApiMiddleware = (req, res, next) => {
  if (req.url && req.url.startsWith('/api/saas')) {
    return app(req, res, next);
  }
  next();
};
