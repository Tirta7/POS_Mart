import { create } from 'zustand';
import type { Supplier } from '../types';

interface SupplierState {
  suppliers: Supplier[];
  fetchSuppliers: () => Promise<void>;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<void>;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  updateSupplierPayable: (supplierId: string, amount: number) => Promise<void>;
  paySupplierDebt: (supplierId: string, amount: number, note: string) => Promise<void>;
}

export const useSupplierStore = create<SupplierState>()(
  (set) => ({
      suppliers: [
        {
          id: 'SUPP-BILLIARD-01',
          name: 'CV Billiard Supplies Indonesia',
          contact: 'Bpk Hendra',
          phone: '081377889900',
          paymentTermDays: 14,
          totalPayable: 5000000
        }
      ],
      fetchSuppliers: async () => {
        try {
          const res = await fetch('/api/saas/suppliers', { headers: { 'x-tenant-id': 'TID-DEMO-123' } });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              set({ suppliers: data.map((s: any) => ({ ...s, totalPayable: s.payable ?? s.totalPayable ?? 0 })) });
            }
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
            set((state) => ({ suppliers: [...state.suppliers, { ...newSup, totalPayable: newSup.payable }] }));
          }
        } catch (err) {
          console.error(err);
        }
      },
      updateSupplier: async (id, supplier) => {
        try {
          const res = await fetch(`/api/saas/suppliers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
            body: JSON.stringify(supplier)
          });
          if (res.ok) {
            const updated = await res.json();
            set((state) => ({ suppliers: state.suppliers.map(s => s.id === id ? { ...updated, totalPayable: updated.payable } : s) }));
          }
        } catch (err) {
          console.error(err);
        }
      },
      deleteSupplier: async (id) => {
        try {
          const res = await fetch(`/api/saas/suppliers/${id}`, {
            method: 'DELETE',
            headers: { 'x-tenant-id': 'TID-DEMO-123' }
          });
          if (res.ok) {
            set((state) => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
          }
        } catch (err) {
          console.error(err);
        }
      },
      updateSupplierPayable: async (supplierId, amount) => {
        try {
          // In a real app, you might want a specific endpoint to increment/decrement payable safely, 
          // but for now we'll fetch the supplier, calculate, and PUT.
          // Wait, actually we can just rely on the fact that `updateSupplier` exists.
          set((state) => {
            const supplier = state.suppliers.find(s => s.id === supplierId);
            if (!supplier) return state;
            const newPayable = (supplier.totalPayable || 0) + amount;
            
            // Fire and forget PUT
            fetch(`/api/saas/suppliers/${supplierId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
              body: JSON.stringify({ payable: newPayable })
            }).catch(console.error);

            return {
              suppliers: state.suppliers.map(s => 
                s.id === supplierId ? { ...s, totalPayable: newPayable } : s
              )
            };
          });
        } catch (err) {
          console.error(err);
        }
      },
      paySupplierDebt: async (supplierId, amount, note) => {
        try {
          const res = await fetch('/api/saas/supplier-payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
            body: JSON.stringify({ supplierId, amount, note })
          });
          if (res.ok) {
            set((state) => ({
              suppliers: state.suppliers.map(s => 
                s.id === supplierId 
                  ? { ...s, totalPayable: Math.max(0, (s.totalPayable || 0) - amount) }
                  : s
              )
            }));
          }
        } catch (err) {
          console.error(err);
        }
      },
    })
);
