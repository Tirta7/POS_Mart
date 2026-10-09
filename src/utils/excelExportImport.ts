import * as XLSX from 'xlsx';

export interface ExportDataPayload {
  storeName?: string;
  exportedAt?: string;
  analytics?: {
    totalSalesAmount?: number;
    totalTransactions?: number;
    averageBasketSize?: number;
    totalProductsCount?: number;
    totalStockCost?: number;
    totalStockRetailValue?: number;
    estimatedProfitValue?: number;
    totalSupplierDebt?: number;
    paymentMethods?: Record<string, number>;
    topSellingProducts?: Array<{ name: string; qty: number; revenue: number }>;
  };
  products?: any[];
  categories?: any[];
  stockTransactions?: any[];
  transactions?: any[];
  customers?: any[];
  customerOrders?: any[];
  suppliers?: any[];
  users?: any[];
  drafts?: any[];
}

export interface ParsedImportData {
  fileName: string;
  isMasterWorkbook: boolean;
  sheetsFound: string[];
  products: any[];
  customers: any[];
  suppliers: any[];
  users: any[];
  totalRows: number;
}

const formatCurrency = (val: number | undefined | null) => Number(val || 0);

const setSheetCols = (ws: XLSX.WorkSheet, colsWidth: number[]) => {
  ws['!cols'] = colsWidth.map(w => ({ wch: w }));
};

/**
 * EXPORT MASTER EXCEL
 * Mengekspor seluruh database POS Mart ke dalam 1 file Excel (.xlsx) dengan banyak sheet terpisah
 */
export const exportMasterExcel = (data: ExportDataPayload, customName?: string) => {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toISOString().split('T')[0];
  const storeTitle = (data.storeName || 'POS_Mart').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = customName || `${storeTitle}_Master_Data_${dateStr}.xlsx`;

  // 1. SHEET: RINGKASAN & LAPORAN ANALITIK
  const analyticsRows: any[] = [
    { 'INDIKATOR': 'Nama Toko / Swalayan', 'NILAI': data.storeName || 'POS Mart' },
    { 'INDIKATOR': 'Waktu Export Data', 'NILAI': new Date().toLocaleString('id-ID') },
    { 'INDIKATOR': '', 'NILAI': '' },
    { 'INDIKATOR': '--- REKAPITULASI PENJUALAN ---', 'NILAI': '' },
    { 'INDIKATOR': 'Total Omset Penjualan (Rp)', 'NILAI': formatCurrency(data.analytics?.totalSalesAmount) },
    { 'INDIKATOR': 'Total Transaksi Kasir', 'NILAI': data.analytics?.totalTransactions || 0 },
    { 'INDIKATOR': 'Rata-rata Nilai Belanja / Nota (Rp)', 'NILAI': formatCurrency(data.analytics?.averageBasketSize) },
    { 'INDIKATOR': '', 'NILAI': '' },
    { 'INDIKATOR': '--- NILAI ASET & INVENTARIS ---', 'NILAI': '' },
    { 'INDIKATOR': 'Total Ragam Produk', 'NILAI': data.analytics?.totalProductsCount || (data.products?.length || 0) },
    { 'INDIKATOR': 'Total Modal Aset Stok (HPP) (Rp)', 'NILAI': formatCurrency(data.analytics?.totalStockCost) },
    { 'INDIKATOR': 'Total Potensi Nilai Jual Stok (Rp)', 'NILAI': formatCurrency(data.analytics?.totalStockRetailValue) },
    { 'INDIKATOR': 'Estimasi Potensi Margin / Laba (Rp)', 'NILAI': formatCurrency(data.analytics?.estimatedProfitValue) },
    { 'INDIKATOR': 'Total Hutang Dagang ke Supplier (Rp)', 'NILAI': formatCurrency(data.analytics?.totalSupplierDebt) },
    { 'INDIKATOR': '', 'NILAI': '' },
    { 'INDIKATOR': '--- PENJUALAN PER METODE BAYAR ---', 'NILAI': '' }
  ];

  if (data.analytics?.paymentMethods) {
    for (const [method, amount] of Object.entries(data.analytics.paymentMethods)) {
      analyticsRows.push({ 'INDIKATOR': `Metode: ${method}`, 'NILAI': formatCurrency(amount) });
    }
  }

  analyticsRows.push({ 'INDIKATOR': '', 'NILAI': '' });
  analyticsRows.push({ 'INDIKATOR': '--- TOP 15 PRODUK TERLARIS ---', 'NILAI': '' });

  if (data.analytics?.topSellingProducts && data.analytics.topSellingProducts.length > 0) {
    data.analytics.topSellingProducts.forEach((p, idx) => {
      analyticsRows.push({
        'INDIKATOR': `#${idx + 1} ${p.name}`,
        'NILAI': `${p.qty} Pcs (Omset: Rp ${p.revenue.toLocaleString('id-ID')})`
      });
    });
  }

  const wsAnalytics = XLSX.utils.json_to_sheet(analyticsRows);
  setSheetCols(wsAnalytics, [40, 45]);
  XLSX.utils.book_append_sheet(wb, wsAnalytics, 'Laporan & Analitik');

  // 2. SHEET: MANAJEMEN STOK (PRODUK)
  const productRows = (data.products || []).map((p, idx) => {
    const stock = Number(p.stock || 0);
    const minStock = Number(p.min_stock || 0);
    const buyPrice = Number(p.purchase_price || 0);
    const sellPrice = Number(p.selling_price || 0);
    const wholesalePrice = Number(p.wholesale_price || sellPrice);

    let status = 'Aman';
    if (stock <= 0) status = 'Habis';
    else if (stock <= minStock) status = 'Menipis';

    return {
      'No': idx + 1,
      'ID Produk': p.id,
      'Barcode / SKU': p.barcode || p.sku || '-',
      'Nama Produk': p.name,
      'Kategori': p.category?.name || p.category_name || '-',
      'Satuan': p.unit || 'Pcs',
      'Harga Beli (Modal)': buyPrice,
      'Harga Jual (Eceran)': sellPrice,
      'Harga Grosir': wholesalePrice,
      'Stok Saat Ini': stock,
      'Min. Stok': minStock,
      'Status Stok': status,
      'Total Nilai Modal (Rp)': stock * buyPrice,
      'Total Nilai Jual (Rp)': stock * sellPrice
    };
  });

  const wsProducts = XLSX.utils.json_to_sheet(productRows);
  setSheetCols(wsProducts, [6, 20, 20, 32, 18, 10, 18, 18, 18, 14, 12, 14, 22, 22]);
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Manajemen Stok');

  // 3. SHEET: MUTASI STOK (LOG PERGERAKAN BARANG)
  const mutationRows: any[] = [];
  (data.stockTransactions || []).forEach(st => {
    const docNo = st.document_no || st.documentNo || st.id;
    const typeLabel = st.type === 'IN' ? 'MASUK' : st.type === 'OUT' ? 'KELUAR' : 'PENYESUAIAN';
    const dateFormatted = st.date ? new Date(st.date).toLocaleString('id-ID') : '-';
    const party = st.customer_name || st.supplier?.name || '-';

    if (st.items && st.items.length > 0) {
      st.items.forEach((item: any) => {
        mutationRows.push({
          'No Dokumen': docNo,
          'Tanggal & Waktu': dateFormatted,
          'Tipe Mutasi': typeLabel,
          'Nama Produk': item.product?.name || item.name || 'Produk',
          'Qty': item.qty || item.quantity || 0,
          'Harga Satuan (Rp)': item.purchase_price || item.price || 0,
          'Total Nilai Item (Rp)': item.subtotal || 0,
          'Total Dokumen (Rp)': st.total_value || st.totalValue || 0,
          'Keterangan': st.note || '-',
          'Pelanggan / Supplier': party,
          'Petugas / Kasir': st.employee_id || 'Kasir'
        });
      });
    } else {
      mutationRows.push({
        'No Dokumen': docNo,
        'Tanggal & Waktu': dateFormatted,
        'Tipe Mutasi': typeLabel,
        'Nama Produk': '-',
        'Qty': 0,
        'Harga Satuan (Rp)': 0,
        'Total Nilai Item (Rp)': 0,
        'Total Dokumen (Rp)': st.total_value || st.totalValue || 0,
        'Keterangan': st.note || '-',
        'Pelanggan / Supplier': party,
        'Petugas / Kasir': st.employee_id || 'Kasir'
      });
    }
  });

  const wsMutations = XLSX.utils.json_to_sheet(mutationRows);
  setSheetCols(wsMutations, [22, 20, 14, 30, 10, 18, 20, 20, 24, 25, 18]);
  XLSX.utils.book_append_sheet(wb, wsMutations, 'Mutasi Stok');

  // 4. SHEET: PEMBELIAN & HUTANG SUPPLIER
  const purchaseRows = (data.drafts || []).map((d, idx) => {
    let draftData: any = {};
    try {
      draftData = typeof d.value === 'string' ? JSON.parse(d.value) : d.value;
    } catch {
      draftData = {};
    }

    const items = draftData.items || [];
    const total = items.reduce((sum: number, it: any) => sum + ((it.qty || 0) * (it.purchasePrice || it.price || 0)), 0);

    return {
      'No': idx + 1,
      'No Dokumen Draft': d.key,
      'Nama Supplier': draftData.supplierName || draftData.supplier || '-',
      'Jumlah Baris Item': items.length,
      'Total Nilai Pembelian (Rp)': total,
      'Termin Pembayaran': draftData.paymentTerm || '-',
      'Status': 'Draft / Penerimaan'
    };
  });

  const wsPurchases = XLSX.utils.json_to_sheet(purchaseRows);
  setSheetCols(wsPurchases, [6, 24, 28, 18, 26, 20, 20]);
  XLSX.utils.book_append_sheet(wb, wsPurchases, 'Pembelian Supplier');

  // 5. SHEET: DATA PELANGGAN
  const customerRows = (data.customers || []).map((c, idx) => {
    const isRetail = (c.name || '').trim().toLowerCase() === 'retail';
    const totalOrder = c.totalOrder !== undefined ? c.totalOrder : (c.orders?.length || 0);
    const totalSpent = c.totalSpent !== undefined ? c.totalSpent : (c.orders || []).reduce((acc: number, o: any) => acc + (o.total || 0), 0);

    return {
      'No': idx + 1,
      'ID Pelanggan': c.id,
      'Tipe Pelanggan': isRetail ? 'Retail (Eceran)' : 'Pelanggan Grosir',
      'Nama Pelanggan': c.name,
      'No. Telepon / WA': c.phone && c.phone !== '0' ? c.phone : '-',
      'Alamat': c.address || '-',
      'Total Order': totalOrder,
      'Total Belanja (Rp)': totalSpent
    };
  });

  const wsCustomers = XLSX.utils.json_to_sheet(customerRows);
  setSheetCols(wsCustomers, [6, 20, 20, 28, 18, 35, 14, 22]);
  XLSX.utils.book_append_sheet(wb, wsCustomers, 'Data Pelanggan');

  // 6. SHEET: RIWAYAT ORDER PELANGGAN (DETAIL RINCIAN BARANG ORDER)
  const customerOrderRows: any[] = [];
  (data.customerOrders || []).forEach(order => {
    const orderDate = order.date ? new Date(order.date).toLocaleString('id-ID') : '-';

    if (order.items && order.items.length > 0) {
      order.items.forEach((item: any, iIdx: number) => {
        customerOrderRows.push({
          'No Nota': order.orderId,
          'Tanggal & Waktu': orderDate,
          'Nama Pelanggan': order.customerName || 'Retail',
          'Kasir': order.cashier || 'Kasir',
          'Metode Pembayaran': order.paymentMethod || 'TUNAI',
          'Item Ke': iIdx + 1,
          'Nama Produk': item.name || 'Produk',
          'Qty': item.qty || 1,
          'Harga Satuan (Rp)': item.price || 0,
          'Subtotal Item (Rp)': item.subtotal || (item.qty * item.price),
          'Total Nilai Nota (Rp)': order.total || 0
        });
      });
    } else {
      customerOrderRows.push({
        'No Nota': order.orderId,
        'Tanggal & Waktu': orderDate,
        'Nama Pelanggan': order.customerName || 'Retail',
        'Kasir': order.cashier || 'Kasir',
        'Metode Pembayaran': order.paymentMethod || 'TUNAI',
        'Item Ke': 1,
        'Nama Produk': '-',
        'Qty': 1,
        'Harga Satuan (Rp)': order.total || 0,
        'Subtotal Item (Rp)': order.total || 0,
        'Total Nilai Nota (Rp)': order.total || 0
      });
    }
  });

  const wsCustomerOrders = XLSX.utils.json_to_sheet(customerOrderRows);
  setSheetCols(wsCustomerOrders, [24, 20, 25, 18, 18, 10, 30, 10, 18, 20, 22]);
  XLSX.utils.book_append_sheet(wb, wsCustomerOrders, 'Riwayat Order Pelanggan');

  // 7. SHEET: DATA SUPPLIER
  const supplierRows = (data.suppliers || []).map((s, idx) => ({
    'No': idx + 1,
    'ID Supplier': s.id,
    'Nama Supplier': s.name,
    'Kontak Person': s.contact || '-',
    'No. Telepon / WA': s.phone || '-',
    'Termin Pembayaran (Hari)': s.payment_term_days || s.paymentTermDays || 0,
    'Total Hutang Dagang (Rp)': s.payable || s.totalPayable || 0
  }));

  const wsSuppliers = XLSX.utils.json_to_sheet(supplierRows);
  setSheetCols(wsSuppliers, [6, 20, 28, 20, 18, 24, 25]);
  XLSX.utils.book_append_sheet(wb, wsSuppliers, 'Data Supplier');

  // 8. SHEET: DATA KARYAWAN
  const userRows = (data.users || []).map((u, idx) => ({
    'No': idx + 1,
    'ID Karyawan': u.id,
    'Username': u.username,
    'Nama Lengkap': u.name || u.username,
    'Role / Jabatan': u.role,
    'Status': u.is_active ? 'Aktif' : 'Non-Aktif',
    'Tanggal Terdaftar': u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID') : '-'
  }));

  const wsUsers = XLSX.utils.json_to_sheet(userRows);
  setSheetCols(wsUsers, [6, 20, 18, 25, 16, 14, 20]);
  XLSX.utils.book_append_sheet(wb, wsUsers, 'Data Karyawan');

  // 9. SHEET: TRANSAKSI PENJUALAN KASIR
  const transactionRows = (data.transactions || []).map((t, idx) => ({
    'No': idx + 1,
    'No Nota / Struk': t.receipt_number,
    'Tanggal Transaksi': t.created_at ? new Date(t.created_at).toLocaleString('id-ID') : '-',
    'Pelanggan': t.customer_name || 'Umum (Guest)',
    'Kasir': t.cashier_name || t.cashier_id,
    'Cara Bayar': t.payment_method,
    'Total Pembayaran (Rp)': t.total_amount,
    'Jumlah Item Barang': t.items?.length || 0
  }));

  const wsTransactions = XLSX.utils.json_to_sheet(transactionRows);
  setSheetCols(wsTransactions, [6, 24, 20, 25, 20, 16, 22, 20]);
  XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transaksi Kasir');

  // Simpan file
  XLSX.writeFile(wb, filename);
  return filename;
};

/**
 * PARSE EXCEL FILE UNTUK IMPORT
 * Mendeteksi sheet dan memetakan kolom-kolom Excel secara cerdas dan fleksibel
 */
export const parseExcelFile = async (file: File): Promise<ParsedImportData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const wb = XLSX.read(buffer, { type: 'binary' });

        const sheetsFound = wb.SheetNames;
        const isMasterWorkbook = sheetsFound.some(name => 
          name.toLowerCase().includes('stok') || 
          name.toLowerCase().includes('pelanggan') ||
          name.toLowerCase().includes('supplier')
        );

        let products: any[] = [];
        let customers: any[] = [];
        let suppliers: any[] = [];
        let users: any[] = [];

        // Helper normalisasi key objek
        const normalizeRow = (row: any) => {
          const res: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            const cleanKey = key.trim().toLowerCase()
              .replace(/[^a-z0-9]/g, '_')
              .replace(/_+/g, '_');
            res[cleanKey] = row[key];
          }
          return res;
        };

        sheetsFound.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
          if (rawRows.length === 0) return;

          const sName = sheetName.toLowerCase();

          // 1. Sheet Manajemen Stok / Produk
          if (sName.includes('stok') || sName.includes('produk') || sName.includes('product') || sName.includes('barang')) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const name = n.nama_produk || n.nama || n.name || n.product_name || n.deskripsi;
              if (!name) return;

              products.push({
                name: String(name).trim(),
                barcode: n.barcode_sku || n.barcode || n.sku || n.kode_barang || '',
                category: n.kategori || n.category || '',
                unit: n.satuan || n.unit || 'Pcs',
                purchase_price: Number(n.harga_beli_modal || n.harga_beli || n.modal || n.purchase_price || 0),
                selling_price: Number(n.harga_jual_eceran || n.harga_jual || n.selling_price || n.harga || 0),
                wholesale_price: Number(n.harga_grosir || n.wholesale_price || n.harga_jual || 0),
                stock: Number(n.stok_saat_ini || n.stok || n.stock || n.qty || 0),
                min_stock: Number(n.min_stok || n.minimum_stok || n.min_stock || 0)
              });
            });
          }

          // 2. Sheet Data Pelanggan
          if (sName.includes('pelanggan') || sName.includes('customer') || sName.includes('member')) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const name = n.nama_pelanggan || n.nama || n.name || n.customer;
              if (!name) return;

              customers.push({
                name: String(name).trim(),
                phone: String(n.no_telepon_wa || n.no_telepon || n.telepon || n.phone || n.no_hp || n.kontak || '0').trim(),
                address: String(n.alamat || n.address || '').trim()
              });
            });
          }

          // 3. Sheet Data Supplier
          if (sName.includes('supplier') || sName.includes('pemasok') || sName.includes('vendor')) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const name = n.nama_supplier || n.nama || n.name || n.supplier;
              if (!name) return;

              suppliers.push({
                name: String(name).trim(),
                contact: String(n.kontak_person || n.kontak || n.contact || '').trim(),
                phone: String(n.no_telepon_wa || n.no_telepon || n.telepon || n.phone || '').trim(),
                payment_term_days: Number(n.termin_pembayaran_hari || n.termin || n.payment_term || 0),
                payable: Number(n.total_hutang_dagang_rp || n.hutang || n.payable || 0)
              });
            });
          }

          // 4. Sheet Data Karyawan
          if (sName.includes('karyawan') || sName.includes('user') || sName.includes('pegawai') || sName.includes('staf')) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const username = n.username || n.id_karyawan;
              if (!username) return;

              users.push({
                username: String(username).trim().toLowerCase(),
                name: String(n.nama_lengkap || n.nama || username).trim(),
                role: String(n.role_jabatan || n.role || n.jabatan || 'Cashier').trim(),
                pin: String(n.pin || '123456')
              });
            });
          }
        });

        // Fallback jika file hanya 1 sheet umum tanpa nama spesifik
        if (products.length === 0 && customers.length === 0 && suppliers.length === 0 && users.length === 0) {
          const firstSheet = wb.Sheets[sheetsFound[0]];
          const rawRows: any[] = XLSX.utils.sheet_to_json(firstSheet);

          rawRows.forEach(r => {
            const n = normalizeRow(r);
            // Cek apakah produk
            if (n.nama_produk || n.harga_jual || n.stok || n.barcode) {
              const name = n.nama_produk || n.nama || n.name;
              if (name) {
                products.push({
                  name: String(name).trim(),
                  barcode: n.barcode || n.sku || '',
                  category: n.kategori || '',
                  unit: n.satuan || 'Pcs',
                  purchase_price: Number(n.harga_beli || n.modal || 0),
                  selling_price: Number(n.harga_jual || n.harga || 0),
                  wholesale_price: Number(n.harga_grosir || n.harga_jual || 0),
                  stock: Number(n.stok || n.qty || 0),
                  min_stock: Number(n.min_stok || 0)
                });
              }
            }
            // Cek apakah pelanggan
            else if (n.nama_pelanggan || n.no_telepon || n.alamat) {
              const name = n.nama_pelanggan || n.nama;
              if (name) {
                customers.push({
                  name: String(name).trim(),
                  phone: String(n.no_telepon || n.telepon || '0').trim(),
                  address: String(n.alamat || '').trim()
                });
              }
            }
          });
        }

        const totalRows = products.length + customers.length + suppliers.length + users.length;

        resolve({
          fileName: file.name,
          isMasterWorkbook,
          sheetsFound,
          products,
          customers,
          suppliers,
          users,
          totalRows
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

/**
 * DOWNLOAD TEMPLATE EXCEL
 * Menghasilkan file Excel contoh / template standar agar pengguna mudah mengisi data
 */
export const downloadExcelTemplate = (type: 'MASTER' | 'PRODUCT' | 'CUSTOMER' | 'SUPPLIER') => {
  const wb = XLSX.utils.book_new();

  if (type === 'MASTER' || type === 'PRODUCT') {
    const sampleProducts = [
      {
        'Barcode / SKU': 'SKU-001',
        'Nama Produk': 'STICK CUETECH SVB',
        'Kategori': 'Stick Billiard',
        'Satuan': 'Pcs',
        'Harga Beli (Modal)': 10000000,
        'Harga Jual (Eceran)': 13000000,
        'Harga Grosir': 12500000,
        'Stok Saat Ini': 20,
        'Min. Stok': 2
      },
      {
        'Barcode / SKU': 'SKU-002',
        'Nama Produk': 'PREDATOR CUE TIP',
        'Kategori': 'Aksesoris',
        'Satuan': 'Pcs',
        'Harga Beli (Modal)': 450000,
        'Harga Jual (Eceran)': 600000,
        'Harga Grosir': 550000,
        'Stok Saat Ini': 50,
        'Min. Stok': 5
      }
    ];
    const wsProd = XLSX.utils.json_to_sheet(sampleProducts);
    setSheetCols(wsProd, [18, 30, 20, 10, 18, 18, 18, 14, 12]);
    XLSX.utils.book_append_sheet(wb, wsProd, 'Manajemen Stok');
  }

  if (type === 'MASTER' || type === 'CUSTOMER') {
    const sampleCustomers = [
      {
        'Nama Pelanggan': 'Kasianto cue',
        'No. Telepon / WA': '081335533884',
        'Alamat': 'Jl. Basuki Rahmat No. 12, Surabaya'
      },
      {
        'Nama Pelanggan': 'Gembos sfix pro',
        'No. Telepon / WA': '081230378899',
        'Alamat': 'Kec. Porong, Kab. Sidoarjo'
      }
    ];
    const wsCust = XLSX.utils.json_to_sheet(sampleCustomers);
    setSheetCols(wsCust, [28, 20, 40]);
    XLSX.utils.book_append_sheet(wb, wsCust, 'Data Pelanggan');
  }

  if (type === 'MASTER' || type === 'SUPPLIER') {
    const sampleSuppliers = [
      {
        'Nama Supplier': 'PT Cuesports Indonesia',
        'Kontak Person': 'Bpk Hendra',
        'No. Telepon / WA': '081122334455',
        'Termin Pembayaran (Hari)': 30,
        'Total Hutang Dagang (Rp)': 0
      }
    ];
    const wsSup = XLSX.utils.json_to_sheet(sampleSuppliers);
    setSheetCols(wsSup, [30, 20, 20, 25, 24]);
    XLSX.utils.book_append_sheet(wb, wsSup, 'Data Supplier');
  }

  const filename = type === 'MASTER' ? 'Template_Master_POS_Mart.xlsx' : `Template_Import_${type}.xlsx`;
  XLSX.writeFile(wb, filename);
};
