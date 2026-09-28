import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  appName: string;
  taxEnabled: boolean;
  taxRate: number;       // percentage, e.g. 11 = 11%
  roundingUnit: number;  // 0 = no rounding, 100 | 500 | 1000
  setAppName: (name: string) => void;
  setTaxEnabled: (v: boolean) => void;
  setTaxRate: (rate: number) => void;
  setRoundingUnit: (unit: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appName: 'SRIKANDI MART',
      taxEnabled: true,
      taxRate: 11,
      roundingUnit: 0,
      setAppName: (name) => set({ appName: name }),
      setTaxEnabled: (v) => set({ taxEnabled: v }),
      setTaxRate: (rate) => set({ taxRate: rate }),
      setRoundingUnit: (unit) => set({ roundingUnit: unit }),
    }),
    {
      name: 'settings-storage',
    }
  )
);
