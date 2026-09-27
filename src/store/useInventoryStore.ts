import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, StockTransaction } from '../types';

interface InventoryState {
  products: Product[];
  transactions: StockTransaction[];
  addProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  updateProduct: (product: Product) => void;
  updateProductStock: (productId: string, qty: number) => void;
  addTransaction: (transaction: StockTransaction) => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => ({
      products: [
        {
          id: 'p1',
          sku: 'SKU-PTY-100G',
          barcode: '899277531002',
          name: 'Patty Daging Sapi Premium 100gr',
          category: 'Frozen Meat',
          location: 'Chiller #2',
          unit: 'Dus',
          stock: 50,
          baseUnitMultiplier: 40,
          purchasePrice: 350000,
          sellingPrice: 12152,
          image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=300&q=80',
        },
        {
          id: 'p2',
          sku: 'SKU-CHX-MRN',
          barcode: '899452109823',
          name: 'Ayam Potong Marinasi Crispy',
          category: 'Poultry',
          location: 'Chiller Utama',
          unit: 'Pack',
          stock: 120,
          baseUnitMultiplier: 10,
          purchasePrice: 125000,
          sellingPrice: 15000,
          image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=300&q=80',
        }
      ],
      transactions: [],
      addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
      deleteProduct: (id) => set((state) => ({ products: state.products.filter(p => p.id !== id) })),
      updateProduct: (product) => set((state) => ({ products: state.products.map(p => p.id === product.id ? product : p) })),
      updateProductStock: (productId, qty) => set((state) => ({
        products: state.products.map(p => p.id === productId ? { ...p, stock: p.stock + qty } : p)
      })),
      addTransaction: (transaction) => set((state) => ({
        transactions: [...state.transactions, transaction]
      })),
    }),
    {
      name: 'inventory-storage',
    }
  )
);
