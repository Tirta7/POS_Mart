import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SalesTransaction } from '../types';

interface SalesState {
  sales: SalesTransaction[];
  addSale: (sale: SalesTransaction) => Promise<void>;
  clearSales: () => void;
}

export const useSalesStore = create<SalesState>()(
  persist(
    (set) => ({
      sales: [],
      addSale: async (sale) => {
        // 1. Simpan di local storage (untuk offline / UI cepat)
        set((state) => ({ sales: [...state.sales, sale] }));

        // 2. Kirim ke Backend API (SaaS)
        try {
          const apiPayload = {
            receipt_number: sale.id,
            total_amount: sale.total,
            payment_method: sale.paymentMethod,
            cashier_id: 'cashier-1', // Idealnya dari auth store
            items: sale.items.map(item => ({
              product_id: item.productId,
              quantity: item.qty,
              price: item.price,
              subtotal: item.subtotal
            }))
          };

          await fetch('/api/saas/transactions', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-tenant-id': 'TID-DEMO-123'
            },
            body: JSON.stringify(apiPayload)
          });
        } catch (error) {
          console.error("Gagal sinkronisasi transaksi ke server:", error);
          // TODO: Simpan di queue offline untuk dikirim ulang nanti
        }
      },
      clearSales: () => set({ sales: [] }),
    }),
    {
      name: 'sales-storage',
    }
  )
);

