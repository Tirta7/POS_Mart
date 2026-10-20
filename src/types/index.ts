export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  stock: number;
  minStock?: number; // Minimum stock level for low stock alerts
  reserved?: number; // stok yang sedang dikunci oleh HOLD
  baseUnitMultiplier: number;
  purchasePrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  image?: string;
  isPending?: boolean; // Flag to indicate if the product is a draft in Goods Receipt
  variants?: ProductVariant[]; // Varian (mis. warna). Jika ada, stok produk = total stok varian
  isActive?: boolean; // false = disembunyikan dari Kasir POS
}

/** Varian produk. Harga kosong/0 = ikut harga produk induk. */
export interface ProductVariant {
  id: string;
  name: string;
  barcode?: string; // Barcode individual unik untuk varian ini
  sku?: string;     // SKU individual unik untuk varian ini
  stock: number;
  reserved?: number; // stok varian yang dikunci oleh HOLD
  purchasePrice?: number;
  sellingPrice?: number;
  wholesalePrice?: number;
}

/** Varian untuk input form (qty/harga berupa string agar bisa dikosongkan saat mengetik) */
export interface VariantDraft {
  id: string;
  name: string;
  barcode?: string;
  sku?: string;
  qty: number | string;
  sellingPrice?: number | string;
  wholesalePrice?: number | string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  paymentTermDays: number;
  totalPayable?: number;
}

export interface Employee {
  id: string;
  name: string;
  role: 'Cashier' | 'Supervisor' | 'Admin';
  pin: string;
  username: string;
  password: string;
  isActive: boolean;
  shift?: "A" | "B" | "C" | "AUTO"; // Shift kerja karyawan
}

export interface StockTransaction {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  date: string;
  documentNo: string;
  supplierId?: string;
  employeeId: string;
  items: StockTransactionItem[];
  totalValue: number;
  note?: string; // keterangan / sumber mutasi (mis. 'Penjualan Kasir', 'Koreksi stok')
  customerId?: string; // pelanggan pada mutasi OUT hasil penjualan kasir
  customerName?: string; // snapshot nama pelanggan (tetap tampil walau data pelanggan dihapus)
  onCredit?: boolean; // IN dari supplier: true = menambah hutang, false = tunai/lunas
}

export interface StockTransactionItem {
  productId: string;
  variantId?: string;
  variantName?: string;
  /** Varian BARU yang belum terdaftar (dibuat otomatis oleh server saat barang diterima) */
  newVariantName?: string;
  productName?: string;
  unit?: string;
  qty: number; // ADJUSTMENT: bernilai selisih (+/-)
  batchNo: string;
  expiryDate: string;
  purchasePrice: number;
  subtotal: number;
}

export interface CustomerOrder {
  orderId: string;
  date: string;
  total: number;
  paymentMethod?: string;
  cashier?: string;
  items: {
    productId: string;
    variantId?: string;
    variantName?: string;
    name: string;
    qty: number;
    price: number;
    subtotal: number;
    originalPrice?: number;
    isCustomPrice?: boolean;
    customPriceNote?: string;
  }[];
}

export interface SalesTransaction {
  id: string;
  date: string;
  total: number;
  subtotal: number;
  tax: number;
  rounding: number;
  paymentMethod: string;
  tendered: number;
  change: number;
  customerId?: string;
  customerName?: string;
  employeeId?: string;
  employeeName?: string;
  status?: string;
  paymentStatus?: string;
  paidAmount?: number;
  remainingAmount?: number;
  dueDate?: string;
  notes?: string;
  payments?: {
    id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    cashier_name?: string;
    note?: string;
  }[];
  returns?: {
    id: string;
    return_number: string;
    total_refund: number;
    refund_method: string;
    reason?: string;
    created_at: string;
    employee_name?: string;
    items?: {
      id: string;
      product_id: string;
      variant_name?: string;
      quantity: number;
      refund_price: number;
      subtotal: number;
      return_to_stock: boolean;
      product?: { name: string };
    }[];
  }[];
  items: {
    productId: string;
    variantId?: string;
    variantName?: string;
    name: string;
    qty: number;
    price: number;
    subtotal: number;
    originalPrice?: number;
    isCustomPrice?: boolean;
    customPriceNote?: string;
  }[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  orders: CustomerOrder[];
}
