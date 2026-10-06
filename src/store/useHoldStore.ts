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
  holdOrder: (order: HeldOrder) => void;
  removeHeldOrder: (holdId: string) => void;
  clearAllHeld: () => void;
}

export const useHoldStore = create<HoldState>()(
  (set) => ({
      heldOrders: [],
      holdOrder: (order) =>
        set((state) => ({
          heldOrders: [...state.heldOrders, order],
        })),
      removeHeldOrder: (holdId) =>
        set((state) => ({
          heldOrders: state.heldOrders.filter((o) => o.holdId !== holdId),
        })),
      clearAllHeld: () => set({ heldOrders: [] }),
    }),
    {
      name: 'hold-orders-storage',
    }
  )
);
