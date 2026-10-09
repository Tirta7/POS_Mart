import { create } from 'zustand';
import type { Customer, CustomerOrder } from '../types';

interface CustomerState {
  customers: Customer[];
  fetchCustomers: () => Promise<void>;
  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addOrderToCustomer: (customerId: string, order: CustomerOrder) => void;
}

export const useCustomerStore = create<CustomerState>()(
  (set) => ({
      customers: [],
      fetchCustomers: async () => {
        try {
          const res = await fetch('/api/saas/customers', { headers: { 'x-tenant-id': 'TID-DEMO-123' } });
          if (res.ok) {
            const data = await res.json();
            set((state) => ({
              customers: data.map((c: any) => {
                const prev = state.customers.find(p => p.id === c.id);
                const serverOrders = c.orders || [];
                const mergedOrders = [...serverOrders];
                if (prev && prev.orders) {
                  for (const po of prev.orders) {
                    if (!mergedOrders.some(mo => mo.orderId === po.orderId)) {
                      mergedOrders.push(po);
                    }
                  }
                }
                return {
                  ...c,
                  orders: mergedOrders
                };
              })
            }));
          }
        } catch (err) {
          console.error('Failed to fetch customers:', err);
        }
      },
      addCustomer: async (customer) => {
        try {
          const res = await fetch('/api/saas/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
            body: JSON.stringify(customer)
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Gagal menyimpan pelanggan (HTTP ${res.status})`);
          }
          const newCust = await res.json();
          set((state) => {
            const exists = state.customers.some(c => c.id === newCust.id);
            if (exists) {
              return {
                customers: state.customers.map(c => c.id === newCust.id ? { ...c, ...newCust } : c)
              };
            }
            return {
              customers: [...state.customers, { ...newCust, orders: newCust.orders || [] }]
            };
          });
          return newCust;
        } catch (err) {
          console.error('Failed to add customer:', err);
          throw err;
        }
      },
      updateCustomer: async (customer) => {
        try {
          const res = await fetch(`/api/saas/customers/${customer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
            body: JSON.stringify(customer)
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Gagal update pelanggan (HTTP ${res.status})`);
          }
          const updated = await res.json();
          set((state) => ({ 
            customers: state.customers.map(c => c.id === customer.id ? { ...c, ...updated } : c) 
          }));
          return updated;
        } catch (err) {
          console.error('Failed to update customer:', err);
          throw err;
        }
      },
      deleteCustomer: async (id) => {
        try {
          const res = await fetch(`/api/saas/customers/${id}`, {
            method: 'DELETE',
            headers: { 'x-tenant-id': 'TID-DEMO-123' }
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Gagal menghapus pelanggan (HTTP ${res.status})`);
          }
          set((state) => ({ 
            customers: state.customers.filter(c => c.id !== id) 
          }));
        } catch (err) {
          console.error('Failed to delete customer:', err);
          throw err;
        }
      },
      addOrderToCustomer: (customerId, order) => set((state) => ({
        customers: state.customers.map(c => {
          const isTarget = c.id === customerId || 
            (c.name.trim().toLowerCase() === 'retail' && (customerId === 'retail' || customerId === c.id));
          if (isTarget) {
            const existingOrders = c.orders || [];
            if (existingOrders.some(o => o.orderId === order.orderId)) {
              return c;
            }
            return { ...c, orders: [order, ...existingOrders] };
          }
          return c;
        })
      }))
    })
);
