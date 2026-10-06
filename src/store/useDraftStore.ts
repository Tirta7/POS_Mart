import { create } from 'zustand';

interface DraftState {
  drafts: any[];
  isLoading: boolean;
  fetchDrafts: () => Promise<void>;
  saveDrafts: (drafts: any[]) => Promise<void>;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: [],
  isLoading: false,
  fetchDrafts: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/saas/drafts/grDrafts', {
        headers: { 'x-tenant-id': 'TID-DEMO-123' }
      });
      if (res.ok) {
        const data = await res.json();
        set({ drafts: Array.isArray(data) ? data : [], isLoading: false });
      } else {
        set({ drafts: [], isLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ isLoading: false });
    }
  },
  saveDrafts: async (draftsArray) => {
    try {
      // Optimistic update
      set({ drafts: draftsArray });
      const res = await fetch('/api/saas/drafts/grDrafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'TID-DEMO-123'
        },
        body: JSON.stringify(draftsArray)
      });
      if (!res.ok) {
        console.error("Failed to save drafts to DB");
      }
    } catch (err) {
      console.error(err);
    }
  }
}));
