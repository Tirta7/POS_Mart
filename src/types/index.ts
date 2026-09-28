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
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  paymentTermDays: number;
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
}

export interface StockTransactionItem {
  productId: string;
  qty: number;
  batchNo: string;
  expiryDate: string;
  purchasePrice: number;
  subtotal: number;
}

export interface CustomerOrder {
  orderId: string;
  date: string;
  total: number;
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
