import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, StockTransaction } from '../types';

interface InventoryState {
  products: Product[];
  transactions: StockTransaction[];
  categories: string[];
  addProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  updateProduct: (oldId: string, product: Product) => void;
  updateProductStock: (productId: string, qty: number) => void;
  reserveStock: (productId: string, qty: number) => void;
  releaseReservedStock: (productId: string, qty: number) => void;
  addTransaction: (transaction: StockTransaction) => void;
  addCategory: (category: string) => void;
  deleteCategory: (category: string) => void;
  editCategory: (oldCategory: string, newCategory: string) => void;
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
          minStock: 10,
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
          minStock: 20,
          baseUnitMultiplier: 10,
          purchasePrice: 125000,
          sellingPrice: 15000,
          image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=300&q=80',
        }
      ],
      transactions: [],
      categories: ['Sembako', 'Combo', 'Rokok', 'Minuman'],
      addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
      deleteProduct: (id) => set((state) => ({ products: state.products.filter(p => p.id !== id) })),
      updateProduct: (oldId, product) => set((state) => ({ products: state.products.map(p => p.id === oldId ? product : p) })),
      updateProductStock: (productId, qty) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          stock: p.stock + qty,
          // When deducting stock (final payment), also release the same amount from reserved
          reserved: qty < 0 ? Math.max(0, (p.reserved || 0) + qty) : (p.reserved || 0)
        } : p)
      })),
      // Reserve stock when HOLD is pressed (deducts from available, not from actual stock)
      reserveStock: (productId, qty) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          reserved: (p.reserved || 0) + qty
        } : p)
      })),
      // Release reservation when HOLD is cancelled
      releaseReservedStock: (productId, qty) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          reserved: Math.max(0, (p.reserved || 0) - qty)
        } : p)
      })),
      addTransaction: (transaction) => set((state) => ({
        transactions: [...state.transactions, transaction]
      })),
      addCategory: (category) => set((state) => ({
        categories: state.categories.includes(category) ? state.categories : [...state.categories, category]
      })),
      deleteCategory: (category) => set((state) => ({
        categories: state.categories.filter(c => c !== category)
      })),
      editCategory: (oldCategory, newCategory) => set((state) => ({
        categories: state.categories.map(c => c === oldCategory ? newCategory : c),
        products: state.products.map(p => p.category === oldCategory ? { ...p, category: newCategory } : p)
      })),
    }),
    {
      name: 'inventory-storage',
    }
  )
);

