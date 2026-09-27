import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  appName: string;
  setAppName: (name: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appName: 'SRIKANDI MART',
      setAppName: (name) => set({ appName: name }),
    }),
    {
      name: 'settings-storage',
    }
  )
);
