import { create } from 'zustand';

interface DraftState {
  drafts: any[];
  isLoading: boolean;
  fetchDrafts: () => Promise<void>;
  saveDrafts: (drafts: any[]) => Promise<void>;
}

const getStoredDrafts = (): any[] => {
  try {
    const raw = localStorage.getItem('grDrafts');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistLocalDrafts = (drafts: any[]) => {
  try {
    localStorage.setItem('grDrafts', JSON.stringify(drafts));
  } catch (e) {
    console.error('Failed to write drafts to localStorage:', e);
  }
};

export const useDraftStore = create<DraftState>((set) => ({
  drafts: getStoredDrafts(),
  isLoading: false,
  fetchDrafts: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/saas/drafts/grDrafts', {
        headers: { 'x-tenant-id': 'TID-DEMO-123' }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          set({ drafts: data, isLoading: false });
          persistLocalDrafts(data);
          return;
        }
      }
    } catch (err) {
      console.error('Fetch drafts error:', err);
    }

    // Fallback: jika server belum ada data atau gagal, jangan hapus draf lokal pengguna!
    const local = getStoredDrafts();
    if (local.length > 0) {
      set({ drafts: local, isLoading: false });
      // Self-healing: sinkronkan kembali draf lokal ke database server
      try {
        fetch('/api/saas/drafts/grDrafts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'TID-DEMO-123'
          },
          body: JSON.stringify(local)
        }).catch(() => {});
      } catch {}
      return;
    }

    set({ drafts: [], isLoading: false });
  },
  saveDrafts: async (draftsArray) => {
    const safeArray = Array.isArray(draftsArray) ? draftsArray : [];
    // 1. Optimistic update di memory Zustand
    set({ drafts: safeArray });
    // 2. Simpan seketika di localStorage agar aman dari refresh / restart
    persistLocalDrafts(safeArray);

    // 3. Simpan di database cloud via API
    try {
      const res = await fetch('/api/saas/drafts/grDrafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'TID-DEMO-123'
        },
        body: JSON.stringify(safeArray)
      });
      if (!res.ok) {
        console.error("Failed to save drafts to DB");
      }
    } catch (err) {
      console.error('Error saving drafts to server:', err);
    }
  }
}));
