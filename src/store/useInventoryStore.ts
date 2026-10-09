import { create } from 'zustand';
import type { Product, StockTransaction } from '../types';

interface InventoryState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  transactions: StockTransaction[];
  categories: string[];
  addProduct: (product: Product) => Promise<Product>;
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
  wholesalePrice: p.wholesale_price || 0,
  image: p.image_url || 'https://via.placeholder.com/150',
});

const mapTransaction = (t: any): StockTransaction => ({
  id: t.id,
  type: t.type as any,
  date: t.date,
  documentNo: t.document_no,
  supplierId: t.supplier_id,
  employeeId: t.employee_id,
  totalValue: t.total_value,
  note: t.note,
  customerId: t.customer_id,
  customerName: t.customer_name,
  items: (t.items || []).map((i: any) => ({
    productId: i.product_id,
    qty: i.qty,
    batchNo: i.batch_no || '',
    expiryDate: i.expiry_date || '',
    purchasePrice: i.purchase_price,
    subtotal: i.subtotal
  }))
});

const getHeaders = () => {
  // Hardcoded for now. In a real app, get from auth store.
  return { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' };
};

export const useInventoryStore = create<InventoryState>()(
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
          if (Array.isArray(data)) {
            set({ products: data.map(mapProduct), isLoading: false });
          } else {
            set({ isLoading: false });
          }
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },
      fetchTransactions: async () => {
        try {
          const res = await fetch('/api/saas/stock-transactions', { headers: getHeaders() });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              set({ transactions: data.map(mapTransaction) });
            }
          }
        } catch (err: any) {
          console.error('Failed to fetch transactions:', err);
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
            const newProd = mapProduct(data);
            set((state) => ({ products: [...state.products, newProd] }));
            return newProd;
          }
        } catch(err) {
          console.error(err);
        }
        return product; // fallback
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
            await res.json();
            // Optional: you can add it to local state if needed
            set((state) => ({ transactions: [...state.transactions, transaction] }));
            // IMPORTANT: Refetch products & transactions so the new stock shows up everywhere!
            get().fetchProducts(); 
            get().fetchTransactions(); 
          }
        } catch(err) {
          console.error(err);
        }
      },
      fetchCategories: async () => {
        try {
          const res = await fetch('/api/saas/categories', { headers: getHeaders() });
          if (res.ok) {
            const data = await res.json();
            set({ categories: data.map((c: any) => c.name) });
          }
        } catch (err: any) {
          console.error('Failed to fetch categories:', err);
        }
      },
      addCategory: async (category) => {
        try {
          await fetch('/api/saas/categories', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ name: category })
          });
          set((state) => ({
            categories: state.categories.includes(category) ? state.categories : [...state.categories, category]
          }));
        } catch (err) {
          console.error(err);
        }
      },
      deleteCategory: async (category) => {
        try {
          await fetch(`/api/saas/categories/by-name/${encodeURIComponent(category)}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          set((state) => ({
            categories: state.categories.filter(c => c !== category)
          }));
        } catch (err) {
          console.error(err);
        }
      },
      editCategory: async (oldCategory, newCategory) => {
        try {
          await fetch(`/api/saas/categories/by-name/${encodeURIComponent(oldCategory)}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ newName: newCategory })
          });
          set((state) => ({
            categories: state.categories.map(c => c === oldCategory ? newCategory : c),
            products: state.products.map(p => p.category === oldCategory ? { ...p, category: newCategory } : p)
          }));
        } catch (err) {
          console.error(err);
        }
      },
    })
);
