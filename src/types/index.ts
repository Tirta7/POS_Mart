export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  stock: number;
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

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  orders: CustomerOrder[];
}
