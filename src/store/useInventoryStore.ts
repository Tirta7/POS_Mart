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
  addProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateProduct: (oldId: string, product: Product) => Promise<void>;
  updateProductStock: (productId: string, qty: number) => void;
  reserveStock: (productId: string, qty: number) => void;
  releaseReservedStock: (productId: string, qty: number) => void;
  addTransaction: (transaction: StockTransaction) => void;
  addCategory: (category: string) => void;
  deleteCategory: (category: string) => void;
  editCategory: (oldCategory: string, newCategory: string) => void;
}

const mapProduct = (p: any): Product => ({
  id: p.id,
  sku: p.sku || '',
  barcode: p.barcode || '',
  name: p.name,
  category: p.category?.name || 'Uncategorized',
  location: '',
  unit: 'Pcs',
  stock: p.stock,
  minStock: p.min_stock,
  baseUnitMultiplier: 1,
  purchasePrice: p.purchase_price,
  sellingPrice: p.selling_price,
  image: p.image_url || 'https://via.placeholder.com/150',
});

const getHeaders = () => {
  // Hardcoded for now. In a real app, get from auth store.
  return { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' };
};

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      products: [],
      isLoading: false,
      error: null,
      fetchProducts: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/saas/products', { headers: getHeaders() });
          if (!res.ok) throw new Error('Gagal mengambil data produk dari server');
          const data = await res.json();
          set({ products: data.map(mapProduct), isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },
      transactions: [],
      categories: ['Sembako', 'Combo', 'Rokok', 'Minuman'],
      
      addProduct: async (product) => {
        try {
          const res = await fetch('/api/saas/products', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(product)
          });
          if (res.ok) {
            const data = await res.json();
            set((state) => ({ products: [...state.products, mapProduct(data)] }));
          }
        } catch(err) {
          console.error(err);
        }
      },
      
      deleteProduct: async (id) => {
        try {
          const res = await fetch(`/api/saas/products/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          if (res.ok) {
            set((state) => ({ products: state.products.filter(p => p.id !== id) }));
          }
        } catch(err) {
          console.error(err);
        }
      },
      
      updateProduct: async (oldId, product) => {
        try {
          const res = await fetch(`/api/saas/products/${oldId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(product)
          });
          if (res.ok) {
            const data = await res.json();
            const updated = mapProduct(data);
            set((state) => ({ products: state.products.map(p => p.id === oldId ? updated : p) }));
          }
        } catch(err) {
          console.error(err);
        }
      },
      
      updateProductStock: (productId, qty) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          stock: p.stock + qty,
          reserved: qty < 0 ? Math.max(0, (p.reserved || 0) + qty) : (p.reserved || 0)
        } : p)
      })),
      reserveStock: (productId, qty) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          reserved: (p.reserved || 0) + qty
        } : p)
      })),
      releaseReservedStock: (productId, qty) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          reserved: Math.max(0, (p.reserved || 0) - qty)
        } : p)
      })),
      addTransaction: async (transaction) => {
        try {
          const res = await fetch('/api/saas/stock-transactions', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(transaction)
          });
          if (res.ok) {
            const data = await res.json();
            // Optional: you can add it to local state if needed
            set((state) => ({ transactions: [...state.transactions, transaction] }));
            // IMPORTANT: Refetch products so the new stock shows up everywhere!
            get().fetchProducts(); 
          }
        } catch(err) {
          console.error(err);
        }
      },
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
      // We only want to persist categories for now, since products are from DB
      partialize: (state) => ({ categories: state.categories, transactions: state.transactions }),
    }
  )
);
