import 'dotenv/config';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { PrismaClient } = pkg;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const saasApiMiddleware = async (req, res, next) => {
  // Hanya proses request yang menuju ke /api/saas/
  if (!req.url || !req.url.startsWith('/api/saas')) {
    return next();
  }

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tenant-id');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Middleware Auth Tenant
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing x-tenant-id header. Anda harus login untuk mengakses data toko.' }));
  }

  // ==========================================
  // ENDPOINT PRODUK
  // ==========================================
  if (req.method === 'GET' && req.url.startsWith('/api/saas/products')) {
    try {
      const products = await prisma.product.findMany({
        where: { tenant_id: tenantId },
        include: { category: true }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(products));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // ==========================================
  // ENDPOINT TRANSAKSI (KASIR)
  // ==========================================
  if (req.method === 'POST' && req.url.startsWith('/api/saas/transactions')) {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { receipt_number, total_amount, payment_method, cashier_id, items } = data;
        
        // Prisma Transaction
        const transaction = await prisma.$transaction(async (tx) => {
          // 1. Buat Header Transaksi
          const newTx = await tx.transaction.create({
            data: {
              tenant_id: tenantId,
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
              where: { id: item.product_id, tenant_id: tenantId },
              data: { stock: { decrement: item.quantity } }
            });
          }

          return newTx;
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(transaction));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Fallback API 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ error: 'Endpoint API tidak ditemukan' }));
};
