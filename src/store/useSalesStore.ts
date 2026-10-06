import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SalesTransaction } from '../types';

interface SalesState {
  sales: SalesTransaction[];
  fetchSales: () => Promise<void>;
  addSale: (sale: SalesTransaction) => Promise<void>;
  clearSales: () => void;
}

export const useSalesStore = create<SalesState>()(
  persist(
    (set) => ({
      sales: [],
      fetchSales: async () => {
        try {
          const res = await fetch('/api/saas/transactions', {
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': 'TID-DEMO-123'
            }
          });
          if (res.ok) {
            const data = await res.json();
            const mapped = data.map((t: any) => ({
              id: t.receipt_number,
              date: t.created_at,
              total: t.total_amount,
              subtotal: t.items.reduce((acc: number, item: any) => acc + item.subtotal, 0),
              tax: 0, 
              rounding: 0,
              paymentMethod: t.payment_method,
              tendered: t.total_amount, 
              change: 0,
              employeeId: t.cashier_id,
              employeeName: t.cashier_name || t.cashier_id,
              items: t.items.map((i: any) => ({
                productId: i.product_id,
                name: i.product?.name || 'Unknown',
                qty: i.quantity,
                price: i.price_at_time,
                subtotal: i.subtotal
              }))
            }));
            set({ sales: mapped });
          }
        } catch (error) {
          console.error("Gagal mengambil data transaksi:", error);
        }
      },
      addSale: async (sale) => {
        // 1. Simpan di local storage (untuk offline / UI cepat)
        set((state) => ({ sales: [...state.sales, sale] }));

        // 2. Kirim ke Backend API (SaaS)
        try {
          const apiPayload = {
            receipt_number: sale.id,
            total_amount: sale.total,
            payment_method: sale.paymentMethod,
            cashier_id: sale.employeeId || 'cashier-1',
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

