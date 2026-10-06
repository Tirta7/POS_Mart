import { create } from 'zustand';

export interface HeldOrder {
  holdId: string;
  orderNumber: string;
  savedAt: string;
  cart: any[];
  orderType: string;
  selectedCustomer: any | null;
  note?: string;
}

interface HoldState {
  heldOrders: HeldOrder[];
  isLoading: boolean;
  fetchHeldOrders: () => Promise<void>;
  saveHeldOrders: (orders: HeldOrder[]) => Promise<void>;
  holdOrder: (order: HeldOrder) => void;
  removeHeldOrder: (holdId: string) => void;
  clearAllHeld: () => void;
}

export const useHoldStore = create<HoldState>((set, get) => ({
  heldOrders: [],
  isLoading: false,
  fetchHeldOrders: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/saas/drafts/posHold', {
        headers: { 'x-tenant-id': 'TID-DEMO-123' }
      });
      if (res.ok) {
        const data = await res.json();
        set({ heldOrders: Array.isArray(data) ? data : [], isLoading: false });
      } else {
        set({ heldOrders: [], isLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ isLoading: false });
    }
  },
  saveHeldOrders: async (orders) => {
    try {
      // Optimistic update
      set({ heldOrders: orders });
      const res = await fetch('/api/saas/drafts/posHold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'TID-DEMO-123'
        },
        body: JSON.stringify(orders)
      });
      if (!res.ok) {
        console.error("Failed to save held orders to DB");
      }
    } catch (err) {
      console.error(err);
    }
  },
  holdOrder: (order) => {
    const next = [...get().heldOrders, order];
    get().saveHeldOrders(next);
  },
  removeHeldOrder: (holdId) => {
    const next = get().heldOrders.filter((o) => o.holdId !== holdId);
    get().saveHeldOrders(next);
  },
  clearAllHeld: () => {
    get().saveHeldOrders([]);
  }
}));
