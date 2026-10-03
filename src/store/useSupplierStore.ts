import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Supplier } from '../types';

interface SupplierState {
  suppliers: Supplier[];
  addSupplier: (supplier: Supplier) => void;
  updateSupplierPayable: (supplierId: string, amount: number) => void;
}

export const useSupplierStore = create<SupplierState>()(
  persist(
    (set) => ({
      suppliers: [
        {
          id: 's1',
          name: 'PT Berkah Kuliner Prima',
          contact: 'Pak Ridwan',
          phone: '0812-3456-7890',
          paymentTermDays: 14,
          totalPayable: 0,
        }
      ],
      addSupplier: (supplier) => set((state) => ({ suppliers: [...state.suppliers, supplier] })),
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
