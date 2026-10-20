export interface CfdItem {
  id: string;
  cartId: string;
  name: string;
  variantName?: string;
  barcode?: string;
  sku?: string;
  price: number;
  originalPrice?: number;
  qty: number;
  unit: string;
  subtotal: number;
  img?: string | null;
  isCustomPrice?: boolean;
  customPriceNote?: string;
}

export interface CfdState {
  tenantId: string;
  storeName: string;
  storeLogo?: string | null;
  cashierName: string;
  orderNumber: number | string;
  orderType: string;
  customerName?: string | null;
  items: CfdItem[];
  itemCount: number;
  totalQty: number;
  subtotal: number;
  tax: number;
  taxRate: number;
  taxEnabled: boolean;
  rounding: number;
  total: number;
  paymentState: {
    isOpen: boolean;
    method: string; // 'TUNAI' | 'QRIS' | 'EDC' | 'KUPON' | 'TEMPO'
    tendered: number;
    change: number;
    tempoType?: 'ZERO_DP' | 'DP';
    tempoDp?: number;
    tempoDueDate?: string;
    isCompleted?: boolean;
    completedAt?: string;
    receiptSaleId?: string;
  };
  lastUpdated: number;
}
