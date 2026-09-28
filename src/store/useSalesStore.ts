import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SalesTransaction } from '../types';

interface SalesState {
  sales: SalesTransaction[];
  addSale: (sale: SalesTransaction) => void;
  clearSales: () => void;
}

export const useSalesStore = create<SalesState>()(
  persist(
    (set) => ({
      sales: [],
      addSale: (sale) => set((state) => ({ sales: [...state.sales, sale] })),
      clearSales: () => set({ sales: [] }),
    }),
    {
      name: 'sales-storage',
    }
  )
);

