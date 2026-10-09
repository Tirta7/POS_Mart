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
      include: { items: { include: { product: true } } },
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

    // JIKA INI PEMBELIAN DARI SUPPLIER, OTOMATIS TAMBAH HUTANG!
    if (type === 'IN' && supplierId && totalValue > 0) {
       try {
         await prisma.supplier.updateMany({
           where: { id: supplierId, tenant_id: req.tenantId },
           data: {
             payable: { increment: Number(totalValue) }
           }
         });
         notifyTenant(req.tenantId, 'suppliers');
       } catch (err) {
         console.error("Gagal menambah hutang supplier:", err);
       }
    }

    notifyTenant(req.tenantId, 'stock-transactions');
    notifyTenant(req.tenantId, 'transactions');
    notifyTenant(req.tenantId, 'products'); // Because stock changed
    const io = getIo();
    if (io) {
      io.to(req.tenantId).emit('stock_mutation_updated', {
        type,
        documentNo,
        totalValue: Number(totalValue),
        note
      });
    }
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
        payment_term_days: Number(data.paymentTermDays || 0),
        payable: Number(data.payable || 0)
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
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.contact !== undefined) updateData.contact = data.contact;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.paymentTermDays !== undefined) updateData.payment_term_days = Number(data.paymentTermDays);
    if (data.payable !== undefined) updateData.payable = Number(data.payable);

    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: updateData
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
      where: { id: req.params.id }
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
    const data = req.body;
    const payment = await prisma.supplierPayment.create({
      data: {
        tenant_id: req.tenantId,
        supplier_id: data.supplierId,
        amount: Number(data.amount),
        payment_method: data.paymentMethod || "CASH",
        note: data.note
      }
    });
    
    // Kurangi hutang supplier
    await prisma.supplier.update({
      where: { id: data.supplierId, tenant_id: req.tenantId },
      data: {
        payable: { decrement: Number(data.amount) }
      }
    });

    notifyTenant(req.tenantId, 'suppliers'); // Trigger refresh to frontend
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      where: { tenant_id: tenantId },
      include: { category: true },
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
          name: i.product?.name || 'Produk',
          qty: i.quantity,
          price: Number(i.price_at_time || 0),
          subtotal: Number(i.subtotal || 0)
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
    const stats = { products: 0, customers: 0, suppliers: 0, users: 0, updatedProducts: 0 };

    // 1. Import Produk
    if (Array.isArray(products) && products.length > 0) {
      for (const p of products) {
        if (!p.name && !p.nama) continue;
        const pName = String(p.name || p.nama || '').trim();
        const pBarcode = p.barcode ? String(p.barcode).trim() : null;
        const pCategory = p.category || p.kategori ? String(p.category || p.kategori).trim() : null;
        const pSellPrice = Number(p.selling_price || p.harga_jual || p.hargaJual || 0);
        const pBuyPrice = Number(p.purchase_price || p.harga_beli || p.hargaBeli || 0);
        const pWholesalePrice = Number(p.wholesale_price || p.harga_grosir || p.hargaGrosir || pSellPrice);
        const pStock = Number(p.stock || p.stok || 0);
        const pMinStock = Number(p.min_stock || p.min_stok || 0);

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
        if (pBarcode) {
          existing = await prisma.product.findFirst({
            where: { tenant_id: tenantId, barcode: pBarcode }
          });
        }
        if (!existing) {
          existing = await prisma.product.findFirst({
            where: { tenant_id: tenantId, name: { equals: pName, mode: 'insensitive' } }
          });
        }

        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              name: pName,
              barcode: pBarcode || existing.barcode,
              category_id: categoryId || existing.category_id,
              selling_price: pSellPrice > 0 ? pSellPrice : existing.selling_price,
              purchase_price: pBuyPrice > 0 ? pBuyPrice : existing.purchase_price,
              wholesale_price: pWholesalePrice > 0 ? pWholesalePrice : existing.wholesale_price,
              stock: pStock !== undefined && !isNaN(pStock) ? pStock : existing.stock,
              min_stock: pMinStock >= 0 ? pMinStock : existing.min_stock
            }
          });
          stats.updatedProducts++;
        } else {
          await prisma.product.create({
            data: {
              tenant_id: tenantId,
              name: pName,
              barcode: pBarcode,
              category_id: categoryId,
              selling_price: pSellPrice,
              purchase_price: pBuyPrice,
              wholesale_price: pWholesalePrice,
              stock: pStock,
              min_stock: pMinStock
            }
          });
          stats.products++;
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
        const cPhone = String(c.phone || c.telepon || c.no_telp || c.no_telepon || '0').trim();
        const cAddress = String(c.address || c.alamat || '').trim();

        const existing = await prisma.customer.findFirst({
          where: {
            tenant_id: tenantId,
            OR: [
              { name: { equals: cName, mode: 'insensitive' } },
              ...(cPhone && cPhone !== '0' ? [{ phone: cPhone }] : [])
            ]
          }
        });

        if (existing) {
          await prisma.customer.update({
            where: { id: existing.id },
            data: {
              phone: cPhone || existing.phone,
              address: cAddress || existing.address
            }
          });
        } else {
          await prisma.customer.create({
            data: {
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
        const sContact = String(s.contact || s.kontak || '').trim();
        const sPhone = String(s.phone || s.telepon || '').trim();
        const sTerm = Number(s.payment_term_days || s.termin || 0);
        const sPayable = Number(s.payable || s.hutang || 0);

        const existing = await prisma.supplier.findFirst({
          where: { tenant_id: tenantId, name: { equals: sName, mode: 'insensitive' } }
        });

        if (existing) {
          await prisma.supplier.update({
            where: { id: existing.id },
            data: {
              contact: sContact || existing.contact,
              phone: sPhone || existing.phone,
              payment_term_days: sTerm >= 0 ? sTerm : existing.payment_term_days,
              payable: sPayable >= 0 ? sPayable : existing.payable
            }
          });
        } else {
          await prisma.supplier.create({
            data: {
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
        const name = String(u.name || u.nama || username).trim();
        const role = String(u.role || u.peran || 'Cashier').trim();
        const pin = String(u.pin || '123456');

        const existing = await prisma.user.findFirst({
          where: { tenant_id: tenantId, username }
        });

        if (existing) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { name, role, pin }
          });
        } else {
          await prisma.user.create({
            data: {
              tenant_id: tenantId,
              username,
              name,
              password_hash: u.password || 'admin',
              pin,
              role,
              is_active: true
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
    prisma.tenant.findFirst().then(tenant => {
      const appName = tenant?.name || 'VOC POS';
      const manifest = {
        name: appName,
        short_name: appName,
        description: "Aplikasi Point of Sale & Back-Office swalayan.",
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
