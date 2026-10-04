import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, StockTransaction } from '../types';

interface InventoryState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
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
      products: [],
      isLoading: false,
      error: null,
      fetchProducts: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/saas/products', {
            headers: { 'x-tenant-id': 'TID-DEMO-123' } // Hardcode for now, later get from auth store
          });
          if (!res.ok) throw new Error('Gagal mengambil data produk dari server');
          const data = await res.json();
          // Map schema from Prisma to Frontend types
          const mapped = data.map((p: any) => ({
            id: p.id,
            sku: p.sku || '',
            barcode: p.barcode || '',
            name: p.name,
            category: p.category?.name || 'Uncategorized',
            location: '',
            unit: 'Pcs',
            stock: p.stock,
            minStock: p.min_stock,
            purchasePrice: p.purchase_price,
            sellingPrice: p.selling_price,
            image: p.image_url || 'https://via.placeholder.com/150',
          }));
          set({ products: mapped, isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },
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

