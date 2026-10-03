import { useInventoryStore } from '../store/useInventoryStore';
import { useAuthStore } from '../store/useAuthStore';

export interface MutationLine {
  productId: string;
  /** IN/OUT: jumlah positif. ADJUSTMENT: selisih bertanda (+/-). */
  qty: number;
  purchasePrice?: number;
  name?: string;
  unit?: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Nomor dokumen otomatis, mis. RST-20261003-482 */
export const makeDocNo = (prefix: string) => {
  const d = new Date();
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(Math.floor(Math.random() * 900) + 100, 3)}`;
};

/**
 * Catat mutasi stok ke riwayat (halaman Mutasi Stok).
 * Dipanggil SETELAH/SAAT stok berubah. Hanya mencatat; tidak mengubah stok.
 */
export const recordStockMutation = (
  type: 'IN' | 'OUT' | 'ADJUSTMENT',
  documentNo: string,
  lines: MutationLine[],
  note?: string,
  meta?: { customerId?: string; customerName?: string }
) => {
  const valid = lines.filter(l => l.qty !== 0);
  if (valid.length === 0) return;

  const inv = useInventoryStore.getState();
  const user = useAuthStore.getState().currentUser;

  const items = valid.map(l => {
    const product = inv.products.find(p => p.id === l.productId);
    const price = l.purchasePrice ?? product?.purchasePrice ?? 0;
    return {
      productId: l.productId,
      productName: l.name ?? product?.name,
      unit: l.unit ?? product?.unit,
      qty: l.qty,
      batchNo: '',
      expiryDate: '',
      purchasePrice: price,
      subtotal: Math.abs(l.qty) * price,
    };
  });

  inv.addTransaction({
    id: `MUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type,
    date: new Date().toISOString(),
    documentNo,
    employeeId: user?.id || 'SYSTEM',
    items,
    totalValue: items.reduce((s, i) => s + i.subtotal, 0),
    note,
    customerId: meta?.customerId,
    customerName: meta?.customerName,
  });
};
