import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Supplier } from '../types';

interface SupplierState {
  suppliers: Supplier[];
  fetchSuppliers: () => Promise<void>;
  addSupplier: (supplier: Supplier) => Promise<void>;
  updateSupplierPayable: (supplierId: string, amount: number) => void;
}

export const useSupplierStore = create<SupplierState>()(
  persist(
    (set) => ({
      suppliers: [],
      fetchSuppliers: async () => {
        try {
          const res = await fetch('/api/saas/suppliers', { headers: { 'x-tenant-id': 'TID-DEMO-123' } });
          if (res.ok) {
            const data = await res.json();
            set({ suppliers: data });
          }
        } catch (err) {
          console.error('Failed to fetch suppliers:', err);
        }
      },
      addSupplier: async (supplier) => {
        try {
          const res = await fetch('/api/saas/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
            body: JSON.stringify(supplier)
          });
          if (res.ok) {
            const newSup = await res.json();
            set((state) => ({ suppliers: [...state.suppliers, newSup] }));
          }
        } catch (err) {
          console.error(err);
        }
      },
      updateSupplierPayable: (supplierId, amount) => set((state) => ({
        suppliers: state.suppliers.map(s => 
          s.id === supplierId 
            ? { ...s, totalPayable: (s.totalPayable || 0) + amount }
            : s
        )
      })),
    }),
    {
      name: 'supplier-storage',
    }
  )
);
