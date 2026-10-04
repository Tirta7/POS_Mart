import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  appName: string;
  taxEnabled: boolean;
  taxRate: number;       // percentage, e.g. 11 = 11%
  roundingUnit: number;  // 0 = no rounding, 100 | 500 | 1000
  /** Header struk (multi-baris). Kosong = nama aplikasi + "STRUK PENJUALAN". */
  invoiceHeader: string;
  /** Footer struk (multi-baris). Kosong = teks default. */
  invoiceFooter: string;
  appLogo: string | null;
  setAppName: (name: string) => void;
  setAppLogo: (logo: string | null) => void;
  setTaxEnabled: (v: boolean) => void;
  setTaxRate: (rate: number) => void;
  setRoundingUnit: (unit: number) => void;
  setInvoiceHeader: (text: string) => void;
  setInvoiceFooter: (text: string) => void;
}

export const DEFAULT_INVOICE_FOOTER = 'Terima kasih atas kunjungan Anda\nBarang yang sudah dibeli tidak dapat\nditukar / dikembalikan';
export const defaultInvoiceHeader = (appName: string) => `${appName}\nSTRUK PENJUALAN`;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appName: 'SRIKANDI MART',
      appLogo: null,
      taxEnabled: true,
      taxRate: 11,
      roundingUnit: 0,
      invoiceHeader: '',
      invoiceFooter: '',
      setAppName: (name) => set({ appName: name }),
      setAppLogo: (logo) => set({ appLogo: logo }),
      setTaxEnabled: (v) => set({ taxEnabled: v }),
      setTaxRate: (rate) => set({ taxRate: rate }),
      setRoundingUnit: (unit) => set({ roundingUnit: unit }),
      setInvoiceHeader: (text) => set({ invoiceHeader: text }),
      setInvoiceFooter: (text) => set({ invoiceFooter: text }),
    }),
    {
      name: 'settings-storage',
    }
  )
);
