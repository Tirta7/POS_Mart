import { create } from 'zustand';
import type { SalesTransaction } from '../types';

import { useAuthStore } from './useAuthStore';
import { useInventoryStore } from './useInventoryStore';

import { useCustomerStore } from './useCustomerStore';

interface SalesState {
  sales: SalesTransaction[];
  fetchSales: () => Promise<void>;
  addSale: (sale: SalesTransaction) => Promise<void>;
  clearSales: () => void;
}

export const useSalesStore = create<SalesState>()(
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
            if (Array.isArray(data)) {
              const employees = useAuthStore.getState().employees;
              const mapped = data.map((t: any) => {
                const localEmp = employees.find((e: any) => e.id === t.cashier_id);
                return {
                  id: t.receipt_number,
                  date: t.created_at,
                  total: t.total_amount,
                  subtotal: (t.items || []).reduce((acc: number, item: any) => acc + (item.subtotal || 0), 0),
                  tax: 0, 
                  rounding: 0,
                  paymentMethod: t.payment_method,
                  tendered: t.total_amount, 
                  change: 0,
                  customerId: t.customer_id,
                  customerName: t.customer_name || 'Umum (Guest)',
                  employeeId: t.cashier_id,
                  employeeName: localEmp?.name || t.cashier_name || t.cashier_id,
                  items: (t.items || []).map((i: any) => ({
                    productId: i.product_id,
                    name: i.product?.name || 'Unknown',
                    qty: i.quantity,
                    price: i.price_at_time,
                    subtotal: i.subtotal
                  }))
                };
              });
              set({ sales: mapped });
            }
          }
        } catch (error) {
          console.error("Gagal mengambil data transaksi:", error);
        }
      },
      addSale: async (sale) => {
        // 1. Simpan di local storage (untuk offline / UI cepat)
        set((state) => ({ sales: [...state.sales, sale] }));

        // 2. Hubungkan langsung ke store pelanggan agar rekap langsung bertambah instan
        try {
          const custStore = useCustomerStore.getState();
          const retailCust = custStore.customers.find(c => (c.name || '').trim().toLowerCase() === 'retail');
          const targetCustId = sale.customerId || (sale.customerName?.toLowerCase() === 'retail' || sale.customerName === 'Umum (Guest)' || !sale.customerName ? retailCust?.id : null);
          if (targetCustId) {
            custStore.addOrderToCustomer(targetCustId, {
              orderId: sale.id,
              date: sale.date,
              total: sale.total,
              items: sale.items.map(item => ({
                productId: item.productId,
                name: item.name,
                qty: item.qty,
                price: item.price,
                subtotal: item.subtotal
              }))
            });
          }
        } catch (e) {
          console.error("Gagal link order ke customer lokal:", e);
        }

        // 3. Kirim ke Backend API (SaaS)
        try {
          const apiPayload = {
            receipt_number: sale.id,
            total_amount: sale.total,
            payment_method: sale.paymentMethod,
            cashier_id: sale.employeeId || 'cashier-1',
            cashier_name: sale.employeeName || 'Unknown',
            customer_id: sale.customerId || null,
            customer_name: sale.customerName || null,
            items: sale.items.map(item => ({
              product_id: item.productId,
              quantity: item.qty,
              price: item.price,
              subtotal: item.subtotal
            }))
          };

          const res = await fetch('/api/saas/transactions', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-tenant-id': 'TID-DEMO-123'
            },
            body: JSON.stringify(apiPayload)
          });
          if (res.ok) {
            useInventoryStore.getState().fetchTransactions();
            useInventoryStore.getState().fetchProducts();
            useCustomerStore.getState().fetchCustomers();
          }
        } catch (error) {
          console.error("Gagal sinkronisasi transaksi ke server:", error);
          // TODO: Simpan di queue offline untuk dikirim ulang nanti
        }
      },
      clearSales: () => set({ sales: [] }),
    })
);

