import { create } from 'zustand';
import type { SalesTransaction } from '../types';

import { useAuthStore } from './useAuthStore';
import { useInventoryStore } from './useInventoryStore';

import { useCustomerStore } from './useCustomerStore';

interface SalesState {
  sales: SalesTransaction[];
  fetchSales: () => Promise<void>;
  addSale: (sale: SalesTransaction) => Promise<void>;
  updateSale: (id: string, payload: any) => Promise<boolean>;
  recordPayment: (id: string, payload: { amount: number; payment_method: string; cashier_id?: string; cashier_name?: string; note?: string }) => Promise<boolean>;
  recordReturn: (id: string, payload: { items: any[]; refund_method: string; reason?: string; employee_id?: string; employee_name?: string }) => Promise<boolean>;
  voidSale: (id: string, payload: { reason?: string; employee_id?: string; employee_name?: string }) => Promise<boolean>;
  clearSales: () => void;
}

export const useSalesStore = create<SalesState>()(
  (set, get) => ({
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
                  status: t.status || 'COMPLETED',
                  paymentStatus: t.payment_status || 'PAID',
                  paidAmount: t.paid_amount != null ? Number(t.paid_amount) : Number(t.total_amount),
                  remainingAmount: t.remaining_amount != null ? Number(t.remaining_amount) : Math.max(0, Number(t.total_amount) - (t.paid_amount || 0)),
                  dueDate: t.due_date || undefined,
                  notes: t.notes || undefined,
                  payments: t.payments || [],
                  returns: t.returns || [],
                  items: (t.items || []).map((i: any) => ({
                    productId: i.product_id,
                    variantId: i.variant_id || undefined,
                    variantName: i.variant_name || undefined,
                    name: i.product?.name || 'Unknown',
                    qty: i.quantity,
                    price: i.price_at_time,
                    subtotal: i.subtotal,
                    originalPrice: i.original_price != null ? Number(i.original_price) : undefined,
                    isCustomPrice: Boolean(i.is_custom_price),
                    customPriceNote: i.custom_price_note || undefined
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
                variantId: item.variantId,
                variantName: item.variantName,
                name: item.name,
                qty: item.qty,
                price: item.price,
                subtotal: item.subtotal,
                originalPrice: item.originalPrice,
                isCustomPrice: item.isCustomPrice,
                customPriceNote: item.customPriceNote
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
            payment_status: sale.paymentStatus || (sale.paymentMethod === 'TEMPO' ? 'UNPAID' : 'PAID'),
            paid_amount: sale.paidAmount != null ? sale.paidAmount : (sale.paymentMethod === 'TEMPO' ? 0 : sale.total),
            due_date: sale.dueDate || null,
            notes: sale.notes || null,
            cashier_id: sale.employeeId || 'cashier-1',
            cashier_name: sale.employeeName || 'Unknown',
            customer_id: sale.customerId || null,
            customer_name: sale.customerName || null,
            items: sale.items.map(item => ({
              product_id: item.productId,
              variant_id: item.variantId || null,
              variant_name: item.variantName || null,
              quantity: item.qty,
              price: item.price,
              subtotal: item.subtotal,
              original_price: item.originalPrice != null ? item.originalPrice : item.price,
              is_custom_price: Boolean(item.isCustomPrice),
              custom_price_note: item.customPriceNote || (item.isCustomPrice ? 'Harga Khusus' : null)
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
            get().fetchSales();
          } else {
            const errData = await res.json().catch(() => ({}));
            console.error("Gagal sinkronisasi transaksi ke server:", errData);
            alert(`Peringatan Transaksi: ${errData.error || 'Server gagal menyimpan transaksi'}`);
          }
        } catch (error) {
          console.error("Gagal sinkronisasi transaksi ke server:", error);
          alert("Koneksi ke server gagal. Pastikan server online.");
        }
      },
      updateSale: async (id, payload) => {
        try {
          const res = await fetch(`/api/saas/transactions/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': 'TID-DEMO-123'
            },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            await get().fetchSales();
            useInventoryStore.getState().fetchTransactions();
            useInventoryStore.getState().fetchProducts();
            useCustomerStore.getState().fetchCustomers();
            return true;
          } else {
            const errData = await res.json().catch(() => ({}));
            alert(`Gagal memperbarui transaksi: ${errData.error || 'Terjadi kesalahan'}`);
            return false;
          }
        } catch (err: any) {
          console.error("Gagal update invoice:", err);
          alert(`Koneksi server gagal: ${err.message}`);
          return false;
        }
      },
      recordPayment: async (id, payload) => {
        try {
          const res = await fetch(`/api/saas/transactions/${id}/payments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': 'TID-DEMO-123'
            },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            await get().fetchSales();
            useCustomerStore.getState().fetchCustomers();
            return true;
          } else {
            const errData = await res.json().catch(() => ({}));
            alert(`Gagal mencatat pembayaran: ${errData.error || 'Terjadi kesalahan'}`);
            return false;
          }
        } catch (err: any) {
          console.error("Gagal catat pembayaran:", err);
          alert(`Koneksi server gagal: ${err.message}`);
          return false;
        }
      },
      recordReturn: async (id, payload) => {
        try {
          const res = await fetch(`/api/saas/transactions/${id}/returns`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': 'TID-DEMO-123'
            },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            await get().fetchSales();
            useInventoryStore.getState().fetchTransactions();
            useInventoryStore.getState().fetchProducts();
            useCustomerStore.getState().fetchCustomers();
            return true;
          } else {
            const errData = await res.json().catch(() => ({}));
            alert(`Gagal memproses retur: ${errData.error || 'Terjadi kesalahan'}`);
            return false;
          }
        } catch (err: any) {
          console.error("Gagal catat retur:", err);
          alert(`Koneksi server gagal: ${err.message}`);
          return false;
        }
      },
      voidSale: async (id, payload) => {
        try {
          const res = await fetch(`/api/saas/transactions/${id}/void`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': 'TID-DEMO-123'
            },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            await get().fetchSales();
            useInventoryStore.getState().fetchTransactions();
            useInventoryStore.getState().fetchProducts();
            useCustomerStore.getState().fetchCustomers();
            return true;
          } else {
            const errData = await res.json().catch(() => ({}));
            alert(`Gagal membatalkan transaksi: ${errData.error || 'Terjadi kesalahan'}`);
            return false;
          }
        } catch (err: any) {
          console.error("Gagal void transaksi:", err);
          alert(`Koneksi server gagal: ${err.message}`);
          return false;
        }
      },
      clearSales: () => set({ sales: [] }),
    })
);

