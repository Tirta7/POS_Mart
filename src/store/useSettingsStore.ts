import { create } from 'zustand';

export const DEFAULT_INVOICE_FOOTER = 'Terima kasih atas kunjungan Anda\nBarang yang sudah dibeli tidak dapat\nditukar / dikembalikan';
export const defaultInvoiceHeader = (appName: string) => `${appName}\nSTRUK PENJUALAN`;

interface SettingsState {
  appName: string;
  taxEnabled: boolean;
  taxRate: number;       // percentage, e.g. 11 = 11%
  roundingUnit: number;  // 0 = no rounding, 100 | 500 | 1000
  invoiceHeader: string;
  invoiceFooter: string;
  appLogo: string | null;
  fetchSettings: () => Promise<void>;
  saveSettings: (settings: Partial<SettingsState>) => Promise<void>;
  setAppName: (name: string) => void;
  setAppLogo: (logo: string | null) => void;
  setTaxEnabled: (v: boolean) => void;
  setTaxRate: (rate: number) => void;
  setRoundingUnit: (unit: number) => void;
  setInvoiceHeader: (text: string) => void;
  setInvoiceFooter: (text: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  (set) => ({
      appName: 'SRIKANDI MART',
      appLogo: null,
      taxEnabled: true,
      taxRate: 11,
      roundingUnit: 0,
      invoiceHeader: '',
      invoiceFooter: '',
      fetchSettings: async () => {
        try {
          const res = await fetch('/api/saas/settings', { headers: { 'x-tenant-id': 'TID-DEMO-123' } });
          if (res.ok) {
            const data = await res.json();
            set({
              appName: data.appName || 'SRIKANDI MART',
              taxEnabled: data.taxEnabled ?? true,
              taxRate: data.taxRate ?? 11,
              roundingUnit: data.roundingUnit ?? 0,
              invoiceHeader: data.invoiceHeader || '',
              invoiceFooter: data.invoiceFooter || '',
              appLogo: data.appLogo || null
            });
          }
        } catch (err) {
          console.error("Gagal load settings:", err);
        }
      },
      saveSettings: async (settings) => {
        set(settings);
        try {
          await fetch('/api/saas/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'TID-DEMO-123' },
            body: JSON.stringify(settings)
          });
        } catch (err) {
          console.error("Gagal save settings:", err);
        }
      },
      setAppName: (name) => set({ appName: name }),
      setAppLogo: (logo) => set({ appLogo: logo }),
      setTaxEnabled: (v) => set({ taxEnabled: v }),
      setTaxRate: (rate) => set({ taxRate: rate }),
      setRoundingUnit: (unit) => set({ roundingUnit: unit }),
      setInvoiceHeader: (text) => set({ invoiceHeader: text }),
      setInvoiceFooter: (text) => set({ invoiceFooter: text }),
    })
);
