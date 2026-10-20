import { create } from 'zustand';
import type { Product, StockTransaction } from '../types';
import { getProductImage } from '../utils/defaultProductImage';

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
  deleteProduct: (id: string) => Promise<DeleteProductResult>;
  setProductActive: (id: string, active: boolean) => Promise<boolean>;
  updateProduct: (oldId: string, product: Product) => Promise<void>;
  updateProductStock: (productId: string, qty: number) => void;
  reserveStock: (productId: string, qty: number, variantId?: string) => void;
  releaseReservedStock: (productId: string, qty: number, variantId?: string) => void;
  addTransaction: (transaction: StockTransaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransactionSupplier: (ids: string[], supplierId: string | null, onCredit: boolean) => Promise<void>;
  addCategory: (category: string) => void;
  deleteCategory: (category: string) => void;
  editCategory: (oldCategory: string, newCategory: string) => void;
}

export interface DeleteProductResult {
  ok: boolean;
  archived?: boolean; // true = soft delete (punya riwayat), riwayat tetap tersimpan
  hasHistory?: boolean;
  saleCount?: number;
  mutationCount?: number;
  error?: string;
}

const round3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

const mapProduct = (p: any): Product => ({
  id: p.id,
  sku: p.sku || '',
  barcode: p.barcode || '',
  name: p.name,
  category: p.category?.name || 'Uncategorized',
  location: '',
  unit: p.unit || 'Pcs',
  isActive: p.is_active !== false,
  stock: round3(p.stock),
  minStock: p.min_stock,
  baseUnitMultiplier: 1,
  purchasePrice: p.purchase_price,
  sellingPrice: p.selling_price,
  wholesalePrice: p.wholesale_price || 0,
  image: getProductImage(p.image_url),
  variants: (p.variants || []).map((v: any) => ({
    id: v.id,
    name: v.name,
    barcode: v.barcode || '',
    sku: v.sku || '',
    stock: round3(v.stock),
    purchasePrice: v.purchase_price ?? undefined,
    sellingPrice: v.selling_price ?? undefined,
    wholesalePrice: v.wholesale_price ?? undefined,
  })),
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
  onCredit: t.on_credit !== false,
  items: (t.items || []).map((i: any) => ({
    productId: i.product_id,
    variantId: i.variant_id || undefined,
    variantName: i.variant_name || undefined,
    productName: i.product?.name,
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
            const okBody = await res.json().catch(() => ({}));
            return { ok: true, archived: !!okBody.archived, saleCount: okBody.saleCount, mutationCount: okBody.mutationCount };
          }
          const body = await res.json().catch(() => ({}));
          if (res.status === 409 && body.code === 'HAS_HISTORY') {
            return { ok: false, hasHistory: true, saleCount: body.saleCount, mutationCount: body.mutationCount, error: body.error };
          }
          return { ok: false, error: body.error || 'Gagal menghapus produk' };
        } catch(err: any) {
          console.error(err);
          return { ok: false, error: err?.message || 'Gagal menghubungi server' };
        }
      },

      setProductActive: async (id, active) => {
        try {
          const res = await fetch(`/api/saas/products/${id}/active`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ active })
          });
          if (res.ok) {
            const updated = mapProduct(await res.json());
            set((state) => ({ products: state.products.map(p => p.id === id ? { ...p, ...updated } : p) }));
            return true;
          }
        } catch(err) {
          console.error(err);
        }
        return false;
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
      reserveStock: (productId, qty, variantId) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          reserved: (p.reserved || 0) + qty,
          variants: variantId
            ? (p.variants || []).map(v => v.id === variantId ? { ...v, reserved: (v.reserved || 0) + qty } : v)
            : p.variants
        } : p)
      })),
      releaseReservedStock: (productId, qty, variantId) => set((state) => ({
        products: state.products.map(p => p.id === productId ? {
          ...p,
          reserved: Math.max(0, (p.reserved || 0) - qty),
          variants: variantId
            ? (p.variants || []).map(v => v.id === variantId ? { ...v, reserved: Math.max(0, (v.reserved || 0) - qty) } : v)
            : p.variants
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
            // IMPORTANT: Refetch products & transactions so the new stock shows up everywhere!
            await Promise.all([get().fetchProducts(), get().fetchTransactions()]);
          } else {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Gagal menyimpan transaksi stok');
          }
        } catch(err) {
          console.error(err);
          throw err;
        }
      },
      deleteTransaction: async (id: string) => {
        try {
          const res = await fetch(`/api/saas/stock-transactions/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          if (res.ok) {
            set((state) => ({ transactions: state.transactions.filter(t => t.id !== id) }));
            get().fetchProducts();
            get().fetchTransactions();
          } else {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete transaction');
          }
        } catch (err) {
          console.error("Error deleting transaction:", err);
          throw err;
        }
      },
      updateTransactionSupplier: async (ids: string[], supplierId: string | null, onCredit: boolean) => {
        const res = await fetch('/api/saas/stock-transactions/supplier', {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({ ids, supplierId, onCredit })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Gagal mengubah supplier faktur');
        }
        await get().fetchTransactions();
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
