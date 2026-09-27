import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Customer, CustomerOrder } from '../types';

interface CustomerState {
  customers: Customer[];
  addCustomer: (customer: Customer) => void;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
  addOrderToCustomer: (customerId: string, order: CustomerOrder) => void;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set) => ({
      customers: [
        {
          id: 'c1',
          name: 'Budi Santoso',
          phone: '081234567890',
          address: 'Jl. Merdeka No. 10',
          orders: []
        },
        {
          id: 'c2',
          name: 'Siti Aminah',
          phone: '089876543210',
          address: 'Jl. Sudirman Blok B/5',
          orders: []
        }
      ],
      addCustomer: (customer) => set((state) => ({ customers: [...state.customers, customer] })),
      updateCustomer: (customer) => set((state) => ({ 
        customers: state.customers.map(c => c.id === customer.id ? customer : c) 
      })),
      deleteCustomer: (id) => set((state) => ({ 
        customers: state.customers.filter(c => c.id !== id) 
      })),
      addOrderToCustomer: (customerId, order) => set((state) => ({
        customers: state.customers.map(c => {
          if (c.id === customerId) {
            return { ...c, orders: [order, ...c.orders] };
          }
          return c;
        })
      }))
    }),
    {
      name: 'customer-storage',
    }
  )
);
