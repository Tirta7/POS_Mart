import { create } from 'zustand';
import type { Supplier } from '../types';

interface SupplierState {
  suppliers: Supplier[];
  addSupplier: (supplier: Supplier) => void;
}

export const useSupplierStore = create<SupplierState>((set) => ({
  suppliers: [
    {
      id: 's1',
      name: 'PT Berkah Kuliner Prima',
      contact: 'Pak Ridwan',
      phone: '0812-3456-7890',
      paymentTermDays: 14,
    }
  ],
  addSupplier: (supplier) => set((state) => ({ suppliers: [...state.suppliers, supplier] })),
}));
