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
}

export interface StockTransactionItem {
  productId: string;
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
    name: string;
    qty: number;
    price: number;
    subtotal: number;
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
  items: {
    productId: string;
    name: string;
    qty: number;
    price: number;
    subtotal: number;
  }[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  orders: CustomerOrder[];
}
