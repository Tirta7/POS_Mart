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
app.use('/api/saas', (req, res, next) => {
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
  
  req.tenantId = tenantId;
  next();
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
// ENDPOINT TRANSAKSI (KASIR)
// ==========================================
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

// Wrapper untuk middleware Vite
export const saasApiMiddleware = (req, res, next) => {
  if (req.url && req.url.startsWith('/api/saas')) {
    return app(req, res, next);
  }
  next();
};
