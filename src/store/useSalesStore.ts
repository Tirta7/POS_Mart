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

const initialMockSales: SalesTransaction[] = [
  {
    id: 'INV-1791534129916',
    date: '2026-10-09T15:22:00.000Z',
    total: 45000000,
    subtotal: 45000000,
    tax: 0,
    rounding: 0,
    paymentMethod: 'TUNAI',
    tendered: 45000000,
    change: 0,
    customerId: 'CUST-BUDI-01',
    customerName: 'Budi Santoso',
    employeeId: 'dd242b65',
    employeeName: 'Administrator',
    items: [
      {
        productId: 'cd38cdd0-0151-4e2a-a3c9-7051300f717d',
        name: 'Meja Billiard 9 Feet Tournament',
        qty: 1,
        price: 45000000,
        subtotal: 45000000
      }
    ]
  },
  {
    id: 'INV-1791534129917',
    date: '2026-10-09T14:15:00.000Z',
    total: 52000000,
    subtotal: 52000000,
    tax: 0,
    rounding: 0,
    paymentMethod: 'QRIS',
    tendered: 52000000,
    change: 0,
    customerId: 'CUST-BUDI-01',
    customerName: 'Budi Santoso',
    employeeId: 'dd242b65',
    employeeName: 'Administrator',
    items: [
      {
        productId: 'PROD-BLL-02',
        name: 'Aramith Tournament TV Pro Cue Ball Set',
        qty: 4,
        price: 9000000,
        subtotal: 36000000
      },
      {
        productId: 'PROD-BLL-03',
        name: 'Predator Revo Carbon Shaft 12.4mm',
        qty: 2,
        price: 8000000,
        subtotal: 16000000
      }
    ]
  },
  {
    id: 'INV-1791534129918',
    date: '2026-10-09T12:40:00.000Z',
    total: 38000000,
    subtotal: 38000000,
    tax: 0,
    rounding: 0,
    paymentMethod: 'KARTU DEBIT',
    tendered: 38000000,
    change: 0,
    customerId: 'CUST-02',
    customerName: 'Arena Billiard Club',
    employeeId: 'dd242b65',
    employeeName: 'Administrator',
    items: [
      {
        productId: 'PROD-BLL-04',
        name: 'Simonis 860 Cloth Tournament Green',
        qty: 6,
        price: 4500000,
        subtotal: 27000000
      },
      {
        productId: 'PROD-BLL-05',
        name: 'Taom Pyro Chalk V10 Original',
        qty: 22,
        price: 500000,
        subtotal: 11000000
      }
    ]
  },
  {
    id: 'INV-1791534129919',
    date: '2026-10-09T10:10:00.000Z',
    total: 41000000,
    subtotal: 41000000,
    tax: 0,
    rounding: 0,
    paymentMethod: 'TUNAI',
    tendered: 41000000,
    change: 0,
    customerId: 'CUST-03',
    customerName: 'Master Pool Hall',
    employeeId: 'dd242b65',
    employeeName: 'Administrator',
    items: [
      {
        productId: 'PROD-BLL-06',
        name: 'Meja Billiard Minirack 7 Feet Club',
        qty: 1,
        price: 32000000,
        subtotal: 32000000
      },
      {
        productId: 'PROD-BLL-07',
        name: 'Cuetec Cynergy Break Cue',
        qty: 1,
        price: 9000000,
        subtotal: 9000000
      }
    ]
  },
  {
    id: 'INV-1791534129920',
    date: '2026-10-09T09:05:00.000Z',
    total: 40000000,
    subtotal: 40000000,
    tax: 0,
    rounding: 0,
    paymentMethod: 'KARTU KREDIT',
    tendered: 40000000,
    change: 0,
    customerId: 'CUST-04',
    customerName: 'Billiard Center Jakarta',
    employeeId: 'dd242b65',
    employeeName: 'Administrator',
    items: [
      {
        productId: 'PROD-BLL-08',
        name: 'Paket Stik Billiard Maple Wood 10 Set',
        qty: 2,
        price: 20000000,
        subtotal: 40000000
      }
    ]
  }
];

export const useSalesStore = create<SalesState>()(
  (set) => ({
      sales: initialMockSales,
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
            if (Array.isArray(data) && data.length > 0) {
            const employees = useAuthStore.getState().employees;
            const mapped = data.map((t: any) => {
              const localEmp = employees.find((e: any) => e.id === t.cashier_id);
              return {
                id: t.receipt_number,
                date: t.created_at,
                total: t.total_amount,
                subtotal: t.items.reduce((acc: number, item: any) => acc + item.subtotal, 0),
                tax: 0, 
                rounding: 0,
                paymentMethod: t.payment_method,
                tendered: t.total_amount, 
                change: 0,
                customerId: t.customer_id,
                customerName: t.customer_name || 'Umum (Guest)',
                employeeId: t.cashier_id,
                employeeName: localEmp?.name || t.cashier_name || t.cashier_id,
                items: t.items.map((i: any) => ({
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

