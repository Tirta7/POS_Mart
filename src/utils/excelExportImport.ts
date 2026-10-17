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
  totalVariants?: number;
}

export const parseNumber = (val: any, fallback = 0): number => {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  let str = String(val).trim().replace(/^[Rr][Pp]\.?\s*/i, '').trim();
  // Handle thousand and decimal separators:
  if (str.includes('.') && !str.includes(',')) {
    const parts = str.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      str = str.replace(/\./g, '');
    }
  } else if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  }
  const n = parseFloat(str);
  return isNaN(n) ? fallback : n;
};

const formatCurrency = (val: number | undefined | null) => parseNumber(val, 0);

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
    const stock = parseNumber(p.stock, 0);
    const minStock = parseNumber(p.minStock ?? p.min_stock, 0);
    const buyPrice = parseNumber(p.purchasePrice ?? p.purchase_price, 0);
    const sellPrice = parseNumber(p.sellingPrice ?? p.selling_price, 0);
    const wholesalePrice = parseNumber(p.wholesalePrice ?? p.wholesale_price, sellPrice);

    let status = 'Aman';
    if (stock <= 0) status = 'Habis';
    else if (stock <= minStock) status = 'Menipis';

    const barcodeVal = p.barcode || p.id || '';
    const skuVal = p.sku || '';
    const categoryName = typeof p.category === 'object' ? (p.category?.name || '-') : (p.category || p.category_name || '-');

    const variantSummary = (p.variants && Array.isArray(p.variants) && p.variants.length > 0)
      ? p.variants.map((v: any) => `${v.name}:${v.stock}`).join(', ')
      : '-';

    return {
      'No': idx + 1,
      'ID Produk': p.id,
      'Barcode': barcodeVal,
      'SKU': skuVal,
      'Nama Produk': p.name,
      'Kategori': categoryName,
      'Satuan': p.unit || 'Pcs',
      'Harga Beli (Modal)': buyPrice,
      'Harga Jual (Eceran)': sellPrice,
      'Harga Grosir': wholesalePrice,
      'Stok Saat Ini': stock,
      'Min. Stok': minStock,
      'Status Stok': status,
      'Daftar Varian': variantSummary,
      'Total Nilai Modal (Rp)': stock * buyPrice,
      'Total Nilai Jual (Rp)': stock * sellPrice
    };
  });

  const wsProducts = XLSX.utils.json_to_sheet(productRows);
  setSheetCols(wsProducts, [6, 20, 20, 18, 32, 18, 10, 18, 18, 18, 14, 12, 14, 25, 22, 22]);
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Manajemen Stok');

  // 2b. SHEET: VARIAN PRODUK (RINCIAN VARIAN PER ITEM)
  const variantRows: any[] = [];
  let vIdx = 1;
  (data.products || []).forEach(p => {
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      p.variants.forEach((v: any) => {
        variantRows.push({
          'No': vIdx++,
          'ID Produk Induk': p.id,
          'Barcode Induk': p.barcode || '',
          'SKU Induk': p.sku || '',
          'Nama Produk Induk': p.name,
          'Nama Varian': v.name,
          'Stok Varian': parseNumber(v.stock, 0),
          'Harga Beli Varian': v.purchasePrice || v.purchase_price || '',
          'Harga Jual Varian': v.sellingPrice || v.selling_price || '',
          'Harga Grosir Varian': v.wholesalePrice || v.wholesale_price || ''
        });
      });
    }
  });

  if (variantRows.length > 0) {
    const wsVariants = XLSX.utils.json_to_sheet(variantRows);
    setSheetCols(wsVariants, [6, 22, 18, 18, 30, 20, 14, 20, 20, 20]);
    XLSX.utils.book_append_sheet(wb, wsVariants, 'Varian Produk');
  }

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
            const rawKey = key.trim().toLowerCase();
            // 1. Clean key with alphanumeric and underscore, stripping leading & trailing underscores
            const cleanKey = rawKey
              .replace(/[^a-z0-9]/g, '_')
              .replace(/^_+|_+$/g, '')
              .replace(/_+/g, '_');
            res[cleanKey] = row[key];

            // 2. Also create an alpha-only key (e.g. "hargabelimodal", "hargajualeceran", "hargagrosir")
            const alphaKey = rawKey.replace(/[^a-z0-9]/g, '');
            if (alphaKey && !res[alphaKey]) {
              res[alphaKey] = row[key];
            }
          }
          return res;
        };

        sheetsFound.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
          if (rawRows.length === 0) return;

          const sName = sheetName.toLowerCase().trim();

          // Lewati sheet panduan / petunjuk agar tidak diproses sebagai baris data
          if (
            sName.includes('panduan') ||
            sName.includes('petunjuk') ||
            sName.includes('instruksi') ||
            sName.includes('guide') ||
            sName.includes('readme') ||
            sName.includes('baca')
          ) {
            return;
          }

          // 1. Sheet Manajemen Stok / Produk (Katalog Produk)
          // PENTING: Jangan masukkan sheet 'Mutasi Stok', 'Laporan', 'Transaksi' karena itu adalah riwayat/log pergerakan, bukan katalog
          const isProductSheet = (
            sName === 'manajemen stok' ||
            sName === 'stok' ||
            sName === 'produk' ||
            sName === 'products' ||
            sName === 'master produk' ||
            sName === 'daftar produk' ||
            sName === 'katalog' ||
            ((sName.includes('produk') || sName.includes('product') || sName.includes('barang') || sName.includes('item') || sName.includes('katalog') || sName.includes('stok')) &&
              !sName.includes('mutasi') &&
              !sName.includes('laporan') &&
              !sName.includes('transaksi') &&
              !sName.includes('riwayat') &&
              !sName.includes('log') &&
              !sName.includes('order') &&
              !sName.includes('pembelian') &&
              !sName.includes('varian') &&
              !sName.includes('variant'))
          );

          if (isProductSheet) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const name = n.nama_produk || n.nama || n.name || n.product_name || n.deskripsi || n.namaproduk;
              if (!name) return;

              const buyPrice = parseNumber(
                n.harga_beli_modal ?? n.harga_beli ?? n.modal ?? n.harga_modal ?? n.beli ?? n.purchase_price ?? n.hpp ?? n.hargabelimodal ?? n.hargabeli,
                0
              );
              const sellPrice = parseNumber(
                n.harga_jual_eceran ?? n.harga_jual ?? n.selling_price ?? n.harga ?? n.jual ?? n.eceran ?? n.hargajualeceran ?? n.hargajual,
                0
              );
              const wholesalePrice = parseNumber(
                n.harga_grosir_partai ?? n.harga_grosir ?? n.wholesale_price ?? n.grosir ?? n.partai ?? n.hargagrosirpartai ?? n.hargagrosir,
                sellPrice
              );
              const stock = parseNumber(
                n.stok_awal ?? n.stok_saat_ini ?? n.stok ?? n.stock ?? n.qty ?? n.jumlah_stok ?? n.stokawal ?? n.stoksaatini,
                0
              );
              const minStock = parseNumber(
                n.min_stok_alert_tipis ?? n.min_stok ?? n.minimum_stok ?? n.min_stock ?? n.stok_minimum ?? n.min_stok_peringatan_tipis ?? n.minstokalerttipis ?? n.minstok,
                0
              );

              const barcodeRaw = String(n.barcode_scan_angka ?? n.barcode ?? n.kode_barcode ?? n.barcode_sku ?? n.kode_barang ?? n.kode ?? '').trim();
              const barcode = (barcodeRaw === '-' || barcodeRaw === '0') ? '' : barcodeRaw;

              const skuRaw = String(n.sku_kode_unik_rak ?? n.sku ?? (n.barcode_sku && !n.barcode ? n.barcode_sku : '') ?? '').trim();
              const sku = skuRaw === '-' ? '' : skuRaw;

              const idRaw = String(n.id_produk_opsional ?? n.id_produk ?? n.id ?? '').trim();
              const id = idRaw === '-' ? '' : idRaw;

              const statusRaw = String(n.status ?? n.status_produk ?? n.status_aktif_non_aktif ?? n.aktif ?? n.is_active ?? 'Aktif').toLowerCase().trim();
              const isActive = !(statusRaw.includes('non') || statusRaw.includes('tidak') || statusRaw === 'false' || statusRaw === '0');

              const existingIdx = products.findIndex(p => 
                (barcode && p.barcode === barcode) || 
                (sku && p.sku === sku) || 
                (p.name.toLowerCase() === String(name).trim().toLowerCase())
              );

              // Deteksi varian inline di baris produk jika ada (misal "S: 138, M: 232, H: 130")
              const rawVariantStr = String(n.daftar_varian_ringkas_opsional ?? n.daftar_varian_ringkas ?? n.daftar_varian ?? n.varian ?? n.variant ?? n.variants ?? n.opsi ?? '').trim();
              let parsedVariants: any[] = [];
              if (rawVariantStr && rawVariantStr !== '-') {
                const parts = rawVariantStr.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
                for (const part of parts) {
                  if (part.includes(':')) {
                    const vParts = part.split(':').map(s => s.trim());
                    const vName = vParts[0];
                    const vStock = parseNumber(vParts[1], 0);
                    const vSell = vParts[2] ? parseNumber(vParts[2], 0) : undefined;
                    const vBuy = vParts[3] ? parseNumber(vParts[3], 0) : undefined;
                    const vWholesale = vParts[4] ? parseNumber(vParts[4], 0) : undefined;
                    if (vName) {
                      parsedVariants.push({
                        name: vName,
                        stock: vStock,
                        sellingPrice: vSell,
                        purchasePrice: vBuy,
                        wholesalePrice: vWholesale
                      });
                    }
                  } else if (/\(([^)]+)\)/.test(part)) {
                    const match = part.match(/^(.*?)\s*\(([^)]+)\)$/);
                    if (match) {
                      const vName = match[1].trim();
                      const vStock = parseNumber(match[2], 0);
                      if (vName) {
                        parsedVariants.push({ name: vName, stock: vStock });
                      }
                    }
                  } else {
                    parsedVariants.push({ name: part, stock: 0 });
                  }
                }
              }

              const itemObj: any = {
                id: id || undefined,
                name: String(name).trim(),
                barcode: barcode,
                sku: sku,
                category: String(n.kategori || n.category || 'Umum').trim(),
                unit: String(n.satuan || n.unit || 'Pcs').trim(),
                purchase_price: buyPrice,
                selling_price: sellPrice,
                wholesale_price: wholesalePrice,
                purchasePrice: buyPrice,
                sellingPrice: sellPrice,
                wholesalePrice: wholesalePrice,
                stock: parsedVariants.length > 0 ? parsedVariants.reduce((sum, v) => sum + v.stock, 0) : stock,
                min_stock: minStock,
                minStock: minStock,
                isActive: isActive,
                variants: parsedVariants.length > 0 ? parsedVariants : undefined
              };

              if (existingIdx >= 0) {
                // Jangan timpa harga valid dengan harga 0
                const cur = products[existingIdx];
                products[existingIdx] = {
                  ...cur,
                  ...itemObj,
                  purchase_price: buyPrice > 0 ? buyPrice : cur.purchase_price,
                  selling_price: sellPrice > 0 ? sellPrice : cur.selling_price,
                  wholesale_price: wholesalePrice > 0 ? wholesalePrice : cur.wholesale_price,
                  purchasePrice: buyPrice > 0 ? buyPrice : cur.purchasePrice,
                  sellingPrice: sellPrice > 0 ? sellPrice : cur.sellingPrice,
                  wholesalePrice: wholesalePrice > 0 ? wholesalePrice : cur.wholesalePrice,
                  stock: parsedVariants.length > 0 ? parsedVariants.reduce((sum, v) => sum + v.stock, 0) : (stock !== 0 ? stock : cur.stock),
                  variants: parsedVariants.length > 0 ? parsedVariants : cur.variants
                };
              } else {
                products.push(itemObj);
              }
            });
          }

          // 1b. Sheet Varian Produk (Rincian per varian terpisah)
          const isVariantSheet = (
            sName === 'varian produk' ||
            sName === 'varian' ||
            sName === 'variants' ||
            sName === 'product variants' ||
            sName === 'opsi produk' ||
            ((sName.includes('varian') || sName.includes('variant')) && !sName.includes('laporan') && !sName.includes('mutasi'))
          );

          if (isVariantSheet) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const prodName = String(n.nama_produk_induk || n.nama_produk || n.produk || n.nama || '').trim();
              const barcode = String(n.barcode_induk || n.barcode || '').trim();
              const sku = String(n.sku_induk || n.sku || '').trim();
              const id = String(n.id_produk_induk_opsional || n.id_produk_induk || n.id_produk || n.id || '').trim();
              const vName = String(n.nama_varian || n.varian || n.variant || n.opsi || '').trim();
              if (!vName) return;

              const vStock = parseNumber(n.stok_varian ?? n.stok ?? n.stock ?? n.qty, 0);
              const vBuy = parseNumber(n.harga_beli_varian_opsional ?? n.harga_beli_varian ?? n.harga_beli_modal ?? n.harga_beli ?? n.modal, 0);
              const vSell = parseNumber(n.harga_jual_varian_opsional ?? n.harga_jual_varian ?? n.harga_jual_eceran ?? n.harga_jual ?? n.harga, 0);
              const vWholesale = parseNumber(n.harga_grosir_varian_opsional ?? n.harga_grosir_varian ?? n.harga_grosir_partai ?? n.harga_grosir ?? n.grosir, 0);

              let targetProd = products.find(p =>
                (id && p.id === id) ||
                (barcode && p.barcode === barcode) ||
                (sku && p.sku === sku) ||
                (prodName && p.name.toLowerCase() === prodName.toLowerCase())
              );

              if (!targetProd && prodName) {
                targetProd = {
                  name: prodName,
                  barcode: barcode || '',
                  sku: sku || '',
                  category: 'Umum',
                  unit: 'Pcs',
                  purchase_price: vBuy,
                  selling_price: vSell,
                  wholesale_price: vWholesale,
                  purchasePrice: vBuy,
                  sellingPrice: vSell,
                  wholesalePrice: vWholesale,
                  stock: 0,
                  min_stock: 0,
                  minStock: 0,
                  variants: []
                };
                products.push(targetProd);
              }

              if (targetProd) {
                if (!targetProd.variants) targetProd.variants = [];
                const existingVIdx = targetProd.variants.findIndex((v: any) => v.name.toLowerCase() === vName.toLowerCase());
                const vObj = {
                  name: vName,
                  stock: vStock,
                  purchasePrice: vBuy > 0 ? vBuy : undefined,
                  sellingPrice: vSell > 0 ? vSell : undefined,
                  wholesalePrice: vWholesale > 0 ? vWholesale : undefined
                };
                if (existingVIdx >= 0) {
                  targetProd.variants[existingVIdx] = { ...targetProd.variants[existingVIdx], ...vObj };
                } else {
                  targetProd.variants.push(vObj);
                }
                targetProd.stock = targetProd.variants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
              }
            });
          }

          // 2. Sheet Data Pelanggan
          const isCustomerSheet = (
            sName === 'data pelanggan' ||
            sName === 'pelanggan' ||
            sName === 'customers' ||
            sName === 'customer' ||
            ((sName.includes('pelanggan') || sName.includes('customer') || sName.includes('member')) &&
              !sName.includes('riwayat') &&
              !sName.includes('order') &&
              !sName.includes('transaksi') &&
              !sName.includes('laporan'))
          );

          if (isCustomerSheet) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const name = n.nama_pelanggan || n.nama || n.name || n.customer || n.namapelanggan;
              if (!name) return;

              const phone = String(n.no_telepon_wa || n.no_telepon || n.telepon || n.phone || n.no_hp || n.kontak || n.noteleponwa || '0').trim();
              const address = String(n.alamat_domisili || n.alamat || n.address || '').trim();
              const customerType = String(n.tipe_pelanggan_retail_grosir || n.tipe_pelanggan || n.tipe || n.type || '').trim();

              customers.push({
                id: String(n.id_pelanggan_opsional || n.id_pelanggan || n.id || '').trim() || undefined,
                name: String(name).trim(),
                phone: (phone === '-' || phone === '') ? '0' : phone,
                address: address === '-' ? '' : address,
                customerType: customerType || undefined
              });
            });
          }

          // 3. Sheet Data Supplier
          const isSupplierSheet = (
            sName === 'data supplier' ||
            sName === 'supplier' ||
            sName === 'suppliers' ||
            sName === 'pemasok' ||
            ((sName.includes('supplier') || sName.includes('pemasok') || sName.includes('vendor')) &&
              !sName.includes('pembelian') &&
              !sName.includes('hutang') &&
              !sName.includes('transaksi') &&
              !sName.includes('draft') &&
              !sName.includes('riwayat'))
          );

          if (isSupplierSheet) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const name = n.nama_supplier_pt_distributor || n.nama_supplier_distributor || n.nama_supplier || n.nama || n.name || n.supplier || n.namasupplierptdistributor || n.namasupplier;
              if (!name) return;

              const contact = String(n.kontak_person_pic || n.kontak_person || n.kontak || n.contact || n.pic || '').trim();
              const phone = String(n.no_telepon_wa || n.no_telepon || n.telepon || n.phone || n.no_hp || n.noteleponwa || '').trim();
              const term = parseNumber(n.termin_pembayaran_hari ?? n.termin_pembayaran ?? n.termin ?? n.payment_term ?? n.payment_term_days ?? n.terminpembayaranhari, 0);
              const payable = parseNumber(n.saldo_hutang_awal_rp ?? n.total_hutang_dagang_rp ?? n.hutang ?? n.payable ?? n.saldo_hutang ?? n.saldohutangawalrp, 0);

              suppliers.push({
                id: String(n.id_supplier_opsional || n.id_supplier || n.id || '').trim() || undefined,
                name: String(name).trim(),
                contact: contact === '-' ? '' : contact,
                phone: phone === '-' ? '' : phone,
                payment_term_days: term,
                payable: payable
              });
            });
          }

          // 4. Sheet Data Karyawan
          const isUserSheet = (
            sName === 'data karyawan' ||
            sName === 'karyawan' ||
            sName === 'users' ||
            sName === 'user' ||
            sName === 'pegawai' ||
            ((sName.includes('karyawan') || sName.includes('pegawai') || sName.includes('staf') || sName.includes('user')) &&
              !sName.includes('gaji') &&
              !sName.includes('absen') &&
              !sName.includes('transaksi') &&
              !sName.includes('laporan'))
          );

          if (isUserSheet) {
            rawRows.forEach(r => {
              const n = normalizeRow(r);
              const username = n.username_untuk_login || n.username_login || n.username || n.id_karyawan || n.user || n.usernameuntuklogin || n.usernamelogin;
              if (!username) return;

              const name = String(n.nama_lengkap || n.nama || username).trim();
              const role = String(n.role_jabatan_admin_supervisor_cashier || n.role_jabatan || n.role || n.jabatan || 'Cashier').trim();
              const pin = String(n.pin_kasir_6_digit || n.pin_kasir || n.pin || '123456').trim();
              const password = String(n.password_login || n.password || n.pass || 'admin123').trim();
              const shiftRaw = String(n.shift_kerja_a_pagi_b_siang_c_malam_auto || n.shift_kerja || n.shift || 'A').toUpperCase().trim();
              const shift = ['A', 'B', 'C', 'AUTO'].includes(shiftRaw) ? shiftRaw : (shiftRaw.includes('PAGI') ? 'A' : shiftRaw.includes('SIANG') ? 'B' : shiftRaw.includes('MALAM') ? 'C' : 'A');
              const statusRaw = String(n.status_aktif_non_aktif || n.status || n.aktif || 'Aktif').toLowerCase();
              const isActive = !(statusRaw.includes('non') || statusRaw.includes('tidak') || statusRaw === 'false' || statusRaw === '0');

              users.push({
                id: String(n.id_karyawan_opsional || n.id_karyawan || n.id || '').trim() || undefined,
                username: String(username).trim().toLowerCase(),
                name: name,
                role: role,
                pin: pin,
                password: password,
                shift: shift,
                is_active: isActive
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
            if (n.nama_produk || n.harga_jual || n.harga_jual_eceran || n.harga_beli || n.stok || n.barcode || n.namaproduk) {
              const name = n.nama_produk || n.nama || n.name || n.namaproduk;
              if (name) {
                const buyPrice = parseNumber(
                  n.harga_beli_modal ?? n.harga_beli ?? n.modal ?? n.harga_modal ?? n.purchase_price ?? n.hargabelimodal ?? n.hargabeli,
                  0
                );
                const sellPrice = parseNumber(
                  n.harga_jual_eceran ?? n.harga_jual ?? n.selling_price ?? n.harga ?? n.hargajualeceran ?? n.hargajual ?? n.jual,
                  0
                );
                const wholesalePrice = parseNumber(
                  n.harga_grosir_partai ?? n.harga_grosir ?? n.wholesale_price ?? n.grosir ?? n.hargagrosir,
                  sellPrice
                );
                const stock = parseNumber(
                  n.stok_awal ?? n.stok_saat_ini ?? n.stok ?? n.stock ?? n.qty ?? n.stoksaatini,
                  0
                );
                const minStock = parseNumber(
                  n.min_stok_alert_tipis ?? n.min_stok ?? n.minimum_stok ?? n.min_stock ?? n.stok_minimum ?? n.minstok,
                  0
                );

                const barcodeRaw = String(n.barcode_scan_angka || n.barcode || n.barcode_sku || n.kode_barang || n.kode || '').trim();
                const barcode = barcodeRaw === '-' ? '' : barcodeRaw;
                const skuRaw = String(n.sku_kode_unik_rak || n.sku || '').trim();
                const sku = skuRaw === '-' ? '' : skuRaw;
                const idRaw = String(n.id_produk_opsional || n.id_produk || n.id || '').trim();
                const id = idRaw === '-' ? '' : idRaw;

                products.push({
                  id: id || undefined,
                  name: String(name).trim(),
                  barcode: barcode,
                  sku: sku,
                  category: String(n.kategori || n.category || 'Umum').trim(),
                  unit: String(n.satuan || n.unit || 'Pcs').trim(),
                  purchase_price: buyPrice,
                  selling_price: sellPrice,
                  wholesale_price: wholesalePrice,
                  purchasePrice: buyPrice,
                  sellingPrice: sellPrice,
                  wholesalePrice: wholesalePrice,
                  stock: stock,
                  min_stock: minStock,
                  minStock: minStock
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

        const totalVariants = products.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
        const totalRows = products.length + customers.length + suppliers.length + users.length;

        resolve({
          fileName: file.name,
          isMasterWorkbook,
          sheetsFound,
          products,
          customers,
          suppliers,
          users,
          totalRows,
          totalVariants
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
 * Menghasilkan file Excel contoh / template standar super lengkap dengan petunjuk pengisian
 */
export const downloadExcelTemplate = (type: 'MASTER' | 'PRODUCT' | 'CUSTOMER' | 'SUPPLIER' | 'USER') => {
  const wb = XLSX.utils.book_new();

  // 1. SHEET PETUNJUK & PANDUAN PENGISIAN
  const guideRows = [
    {
      'BAGIAN / MODUL': '📌 PETUNJUK UMUM',
      'PANDUAN & ATURAN PENGISIAN': 'Template Excel ini disiapkan secara presisi untuk sistem POS Mart. Anda dapat mengisi data baru atau mengupdate data yang sudah ada secara massal.'
    },
    {
      'BAGIAN / MODUL': '1. FORMAT ANGKA & HARGA',
      'PANDUAN & ATURAN PENGISIAN': 'Ketik harga dan stok HANYA dengan angka murni tanpa simbol Rp, tanpa titik, dan tanpa koma (Contoh yang benar: 25000. JANGAN ketik Rp 25.000 atau 25,000).'
    },
    {
      'BAGIAN / MODUL': '2. KOLOM ID (BARU vs UPDATE)',
      'PANDUAN & ATURAN PENGISIAN': 'KOSONGKAN kolom ID jika Anda ingin menambahkan data baru. Isi kolom ID HANYA jika Anda ingin memperbarui (update) produk/pelanggan/supplier yang sudah ada di database.'
    },
    {
      'BAGIAN / MODUL': '3. BARCODE & SKU',
      'PANDUAN & ATURAN PENGISIAN': 'Barcode dapat diisi dari hasil tembak barcode scanner fisik atau diketik manual (Code128 / EAN13). Kolom SKU adalah kode penataan rak toko (opsional).'
    },
    {
      'BAGIAN / MODUL': '4. PRODUK BERVARIAN',
      'PANDUAN & ATURAN PENGISIAN': 'Ada 2 cara: (A) Tulis ringkas di kolom "Daftar Varian Ringkas" (contoh: Kemasan 5Kg: 20, Kemasan 10Kg: 15), ATAU (B) Isi sheet "Varian Produk" untuk mengatur harga & stok per varian secara terpisah.'
    },
    {
      'BAGIAN / MODUL': '5. DATA PELANGGAN',
      'PANDUAN & ATURAN PENGISIAN': 'Nama pelanggan wajib diisi. Tipe pelanggan didukung: "Retail (Eceran)" atau "Pelanggan Grosir". Nomor HP diawali 08xxx untuk kemudahan WhatsApp.'
    },
    {
      'BAGIAN / MODUL': '6. DATA SUPPLIER & HUTANG',
      'PANDUAN & ATURAN PENGISIAN': 'Termin Pembayaran dalam satuan Hari (contoh: 0 = Tunai/Lunas, 14 = Tempo 2 minggu, 30 = Tempo 1 bulan). Saldo Hutang Awal diisi jika ada hutang berjalan yang belum lunas.'
    },
    {
      'BAGIAN / MODUL': '7. DATA KARYAWAN & KASIR',
      'PANDUAN & ATURAN PENGISIAN': 'Role didukung: Admin, Supervisor, Cashier. PIN Kasir (6 digit) digunakan kasir untuk login instan di layar POS. Shift didukung: A (Pagi), B (Siang), C (Malam), AUTO.'
    }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  setSheetCols(wsGuide, [30, 95]);
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Pengisian');

  // 2. SHEET MANAJEMEN STOK (KATALOG PRODUK)
  if (type === 'MASTER' || type === 'PRODUCT') {
    const sampleProducts = [
      {
        'ID Produk (Opsional)': '',
        'Barcode': '8992772000155',
        'SKU': 'SKU-SM-001',
        'Nama Produk': 'Minyak Goreng Bimoli Spesial 2 Liter',
        'Kategori': 'Sembako',
        'Satuan': 'Pouch',
        'Harga Beli (Modal)': 33500,
        'Harga Jual (Eceran)': 37500,
        'Harga Grosir (Partai)': 36000,
        'Stok Awal': 48,
        'Min. Stok (Alert Tipis)': 10,
        'Status': 'Aktif',
        'Daftar Varian Ringkas': '-',
        'Lokasi Rak': 'Rak A1 - Sembako'
      },
      {
        'ID Produk (Opsional)': '',
        'Barcode': '8991002105432',
        'SKU': 'SKU-BR-001',
        'Nama Produk': 'Beras Premium Ramos Wangi',
        'Kategori': 'Beras',
        'Satuan': 'Kg',
        'Harga Beli (Modal)': 12000,
        'Harga Jual (Eceran)': 14500,
        'Harga Grosir (Partai)': 13800,
        'Stok Awal': 250,
        'Min. Stok (Alert Tipis)': 25,
        'Status': 'Aktif',
        'Daftar Varian Ringkas': '5Kg: 20, 10Kg: 15',
        'Lokasi Rak': 'Palet Sembako B'
      },
      {
        'ID Produk (Opsional)': '',
        'Barcode': '8999999001234',
        'SKU': 'SKU-MN-001',
        'Nama Produk': 'Teh Botol Sosro Kotak 250ml',
        'Kategori': 'Minuman',
        'Satuan': 'Kotak',
        'Harga Beli (Modal)': 3200,
        'Harga Jual (Eceran)': 4000,
        'Harga Grosir (Partai)': 3600,
        'Stok Awal': 120,
        'Min. Stok (Alert Tipis)': 24,
        'Status': 'Aktif',
        'Daftar Varian Ringkas': '-',
        'Lokasi Rak': 'Chiller 1'
      },
      {
        'ID Produk (Opsional)': '',
        'Barcode': '8992753112004',
        'SKU': 'SKU-SN-001',
        'Nama Produk': 'Oreo Sandwich Vanilla 119g',
        'Kategori': 'Biskuit & Snack',
        'Satuan': 'Bks',
        'Harga Beli (Modal)': 8500,
        'Harga Jual (Eceran)': 10500,
        'Harga Grosir (Partai)': 9800,
        'Stok Awal': 60,
        'Min. Stok (Alert Tipis)': 12,
        'Status': 'Aktif',
        'Daftar Varian Ringkas': '-',
        'Lokasi Rak': 'Rak C2'
      },
      {
        'ID Produk (Opsional)': '',
        'Barcode': '8999909013278',
        'SKU': 'SKU-RK-001',
        'Nama Produk': 'Sampoerna A Mild 16 Batang',
        'Kategori': 'Rokok',
        'Satuan': 'Bks',
        'Harga Beli (Modal)': 31500,
        'Harga Jual (Eceran)': 34500,
        'Harga Grosir (Partai)': 33800,
        'Stok Awal': 100,
        'Min. Stok (Alert Tipis)': 20,
        'Status': 'Aktif',
        'Daftar Varian Ringkas': '-',
        'Lokasi Rak': 'Etalase Kasir'
      },
      {
        'ID Produk (Opsional)': '',
        'Barcode': '8997001005541',
        'SKU': 'SKU-KP-001',
        'Nama Produk': 'Kaos Polos Cotton Combed 30s',
        'Kategori': 'Pakaian',
        'Satuan': 'Pcs',
        'Harga Beli (Modal)': 28000,
        'Harga Jual (Eceran)': 45000,
        'Harga Grosir (Partai)': 38000,
        'Stok Awal': 75,
        'Min. Stok (Alert Tipis)': 10,
        'Status': 'Aktif',
        'Daftar Varian Ringkas': 'Hitam M: 25, Hitam L: 30, Putih L: 20',
        'Lokasi Rak': 'Gantungan Display'
      }
    ];
    const wsProd = XLSX.utils.json_to_sheet(sampleProducts);
    setSheetCols(wsProd, [18, 18, 16, 36, 16, 10, 18, 18, 18, 14, 20, 12, 32, 22]);
    XLSX.utils.book_append_sheet(wb, wsProd, 'Manajemen Stok');

    // 2b. SHEET VARIAN PRODUK (DETAIL VARIAN)
    const sampleVariants = [
      {
        'No': 1,
        'ID Produk Induk (Opsional)': '',
        'Barcode Induk': '8991002105432',
        'SKU Induk': 'SKU-BR-001',
        'Nama Produk Induk': 'Beras Premium Ramos Wangi',
        'Nama Varian': 'Kemasan 5Kg',
        'Stok Varian': 20,
        'Harga Beli Varian (Opsional)': 60000,
        'Harga Jual Varian (Opsional)': 72500,
        'Harga Grosir Varian (Opsional)': 69000
      },
      {
        'No': 2,
        'ID Produk Induk (Opsional)': '',
        'Barcode Induk': '8991002105432',
        'SKU Induk': 'SKU-BR-001',
        'Nama Produk Induk': 'Beras Premium Ramos Wangi',
        'Nama Varian': 'Kemasan 10Kg',
        'Stok Varian': 15,
        'Harga Beli Varian (Opsional)': 118000,
        'Harga Jual Varian (Opsional)': 142000,
        'Harga Grosir Varian (Opsional)': 135000
      },
      {
        'No': 3,
        'ID Produk Induk (Opsional)': '',
        'Barcode Induk': '8997001005541',
        'SKU Induk': 'SKU-KP-001',
        'Nama Produk Induk': 'Kaos Polos Cotton Combed 30s',
        'Nama Varian': 'Hitam M',
        'Stok Varian': 25,
        'Harga Beli Varian (Opsional)': 28000,
        'Harga Jual Varian (Opsional)': 45000,
        'Harga Grosir Varian (Opsional)': 38000
      },
      {
        'No': 4,
        'ID Produk Induk (Opsional)': '',
        'Barcode Induk': '8997001005541',
        'SKU Induk': 'SKU-KP-001',
        'Nama Produk Induk': 'Kaos Polos Cotton Combed 30s',
        'Nama Varian': 'Hitam L',
        'Stok Varian': 30,
        'Harga Beli Varian (Opsional)': 28000,
        'Harga Jual Varian (Opsional)': 45000,
        'Harga Grosir Varian (Opsional)': 38000
      },
      {
        'No': 5,
        'ID Produk Induk (Opsional)': '',
        'Barcode Induk': '8997001005541',
        'SKU Induk': 'SKU-KP-001',
        'Nama Produk Induk': 'Kaos Polos Cotton Combed 30s',
        'Nama Varian': 'Putih L',
        'Stok Varian': 20,
        'Harga Beli Varian (Opsional)': 28000,
        'Harga Jual Varian (Opsional)': 45000,
        'Harga Grosir Varian (Opsional)': 38000
      }
    ];
    const wsVar = XLSX.utils.json_to_sheet(sampleVariants);
    setSheetCols(wsVar, [6, 22, 18, 18, 32, 18, 14, 24, 24, 24]);
    XLSX.utils.book_append_sheet(wb, wsVar, 'Varian Produk');
  }

  // 3. SHEET DATA PELANGGAN
  if (type === 'MASTER' || type === 'CUSTOMER') {
    const sampleCustomers = [
      {
        'No': 1,
        'ID Pelanggan (Opsional)': '',
        'Nama Pelanggan': 'Toko Berkah Mandiri (Bpk. Subagio)',
        'Tipe Pelanggan (Retail / Grosir)': 'Pelanggan Grosir',
        'No. Telepon / WA': '081234567890',
        'Alamat': 'Jl. Ahmad Yani No. 45, Surabaya',
        'Catatan / Plafon Hutang': 'Langganan grosir sembako mingguan'
      },
      {
        'No': 2,
        'ID Pelanggan (Opsional)': '',
        'Nama Pelanggan': 'Ibu Hj. Siti Aminah',
        'Tipe Pelanggan (Retail / Grosir)': 'Retail (Eceran)',
        'No. Telepon / WA': '085711223344',
        'Alamat': 'Perumahan Asri Blok B3 No. 12',
        'Catatan / Plafon Hutang': 'Pesan antar belanja via WA'
      },
      {
        'No': 3,
        'ID Pelanggan (Opsional)': '',
        'Nama Pelanggan': 'Warung Bu Sri',
        'Tipe Pelanggan (Retail / Grosir)': 'Pelanggan Grosir',
        'No. Telepon / WA': '081398765432',
        'Alamat': 'Jl. Raya Darmo Permai II No. 8',
        'Catatan / Plafon Hutang': 'Belanja partai rokok & mie instan'
      }
    ];
    const wsCust = XLSX.utils.json_to_sheet(sampleCustomers);
    setSheetCols(wsCust, [6, 22, 34, 24, 20, 36, 32]);
    XLSX.utils.book_append_sheet(wb, wsCust, 'Data Pelanggan');
  }

  // 4. SHEET DATA SUPPLIER
  if (type === 'MASTER' || type === 'SUPPLIER') {
    const sampleSuppliers = [
      {
        'No': 1,
        'ID Supplier (Opsional)': '',
        'Nama Supplier': 'PT Indomarco Adi Prima (Indofood Group)',
        'Kontak Person (PIC)': 'Bpk. Ridwan Fauzi',
        'No. Telepon / WA': '08113456789',
        'Alamat / Domisili': 'Kawasan Industri Rungkut Industri III No. 10',
        'Termin Pembayaran (Hari)': 30,
        'Saldo Hutang Awal (Rp)': 0
      },
      {
        'No': 2,
        'ID Supplier (Opsional)': '',
        'Nama Supplier': 'PT Wings Surya Distributor',
        'Kontak Person (PIC)': 'Ibu Maya',
        'No. Telepon / WA': '08129876123',
        'Alamat / Domisili': 'Jl. Kalisosok Kidul No. 2, Surabaya',
        'Termin Pembayaran (Hari)': 14,
        'Saldo Hutang Awal (Rp)': 0
      },
      {
        'No': 3,
        'ID Supplier (Opsional)': '',
        'Nama Supplier': 'CV Beras Makmur Sejahtera',
        'Kontak Person (PIC)': 'H. Mahmud',
        'No. Telepon / WA': '085233445566',
        'Alamat / Domisili': 'Kec. Krian, Kab. Sidoarjo',
        'Termin Pembayaran (Hari)': 0,
        'Saldo Hutang Awal (Rp)': 0
      }
    ];
    const wsSup = XLSX.utils.json_to_sheet(sampleSuppliers);
    setSheetCols(wsSup, [6, 22, 38, 22, 20, 36, 24, 22]);
    XLSX.utils.book_append_sheet(wb, wsSup, 'Data Supplier');
  }

  // 5. SHEET DATA KARYAWAN
  if (type === 'MASTER' || type === 'USER') {
    const sampleUsers = [
      {
        'No': 1,
        'ID Karyawan (Opsional)': '',
        'Username': 'admin',
        'Nama Lengkap': 'Administrator Toko',
        'Role / Jabatan': 'Admin',
        'PIN Kasir (6 Digit)': '123456',
        'Password Login': 'admin123',
        'Shift Kerja': 'AUTO',
        'Status': 'Aktif'
      },
      {
        'No': 2,
        'ID Karyawan (Opsional)': '',
        'Username': 'spv.budi',
        'Nama Lengkap': 'Budi Santoso (Supervisor)',
        'Role / Jabatan': 'Supervisor',
        'PIN Kasir (6 Digit)': '112233',
        'Password Login': 'budi123',
        'Shift Kerja': 'A',
        'Status': 'Aktif'
      },
      {
        'No': 3,
        'ID Karyawan (Opsional)': '',
        'Username': 'kasir.siti',
        'Nama Lengkap': 'Siti Rahmawati',
        'Role / Jabatan': 'Cashier',
        'PIN Kasir (6 Digit)': '223344',
        'Password Login': 'siti123',
        'Shift Kerja': 'A',
        'Status': 'Aktif'
      },
      {
        'No': 4,
        'ID Karyawan (Opsional)': '',
        'Username': 'kasir.doni',
        'Nama Lengkap': 'Doni Pratama',
        'Role / Jabatan': 'Cashier',
        'PIN Kasir (6 Digit)': '334455',
        'Password Login': 'doni123',
        'Shift Kerja': 'B',
        'Status': 'Aktif'
      }
    ];
    const wsUsers = XLSX.utils.json_to_sheet(sampleUsers);
    setSheetCols(wsUsers, [6, 22, 18, 28, 18, 18, 18, 14, 12]);
    XLSX.utils.book_append_sheet(wb, wsUsers, 'Data Karyawan');
  }

  const filename = type === 'MASTER' ? 'Template_Master_Lengkap_POS_Mart.xlsx' : `Template_Import_${type}.xlsx`;
  XLSX.writeFile(wb, filename);
};
