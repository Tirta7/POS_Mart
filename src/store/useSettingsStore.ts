import { create } from 'zustand';

export const DEFAULT_INVOICE_FOOTER = 'Terima kasih atas kunjungan Anda\nBarang yang sudah dibeli tidak dapat\nditukar / dikembalikan';
export const defaultInvoiceHeader = (appName: string) => `${appName}\nSTRUK PENJUALAN`;

export const DEFAULT_DIST_TERMS = '1. Barang yang sudah diterima dalam kondisi baik tidak dapat dikembalikan tanpa persetujuan tertulis.\n2. Pembayaran bilyet giro/transfer dianggap sah setelah dana efektif masuk ke rekening.\n3. Komplain barang kurang/cacat maksimal 2x24 jam sejak barang diterima bersama faktur asli.';

interface SettingsState {
  appName: string;
  taxEnabled: boolean;
  taxRate: number;       // percentage, e.g. 11 = 11%
  roundingUnit: number;  // 0 = no rounding, 100 | 500 | 1000
  invoiceHeader: string;
  invoiceFooter: string;
  appLogo: string | null;

  // Pengaturan Faktur Distributor & Rekening Bank
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyNpwp: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  distributorTerms: string;

  fetchSettings: () => Promise<void>;
  saveSettings: (settings: Partial<SettingsState>) => Promise<void>;
  setAppName: (name: string) => void;
  setAppLogo: (logo: string | null) => void;
  setTaxEnabled: (v: boolean) => void;
  setTaxRate: (rate: number) => void;
  setRoundingUnit: (unit: number) => void;
  setInvoiceHeader: (text: string) => void;
  setInvoiceFooter: (text: string) => void;

  setCompanyAddress: (address: string) => void;
  setCompanyPhone: (phone: string) => void;
  setCompanyEmail: (email: string) => void;
  setCompanyNpwp: (npwp: string) => void;
  setBankName: (name: string) => void;
  setBankAccount: (acc: string) => void;
  setBankHolder: (holder: string) => void;
  setDistributorTerms: (terms: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  (set) => ({
      appName: 'VOC POS',
      appLogo: null,
      taxEnabled: true,
      taxRate: 11,
      roundingUnit: 0,
      invoiceHeader: '',
      invoiceFooter: '',

      companyAddress: localStorage.getItem('pos_dist_comp_address') || 'Jl. Raya Industri Pergudangan No. 88, Blok B3-B5, Jakarta',
      companyPhone: localStorage.getItem('pos_dist_comp_phone') || '0812-3456-7890 / 021-5551234',
      companyEmail: localStorage.getItem('pos_dist_comp_email') || 'distribusi@posmart.co.id',
      companyNpwp: localStorage.getItem('pos_dist_comp_npwp') || '01.234.567.8-901.000',
      bankName: localStorage.getItem('pos_dist_bank_name') || 'BCA (Bank Central Asia)',
      bankAccount: localStorage.getItem('pos_dist_bank_acc') || '8830-192-888',
      bankHolder: localStorage.getItem('pos_dist_bank_holder') || 'PT SWALAYAN RETAIL INDONESIA',
      distributorTerms: localStorage.getItem('pos_dist_terms') || DEFAULT_DIST_TERMS,

      fetchSettings: async () => {
        try {
          const res = await fetch('/api/saas/settings', { headers: { 'x-tenant-id': 'TID-DEMO-123' } });
          if (res.ok) {
            const data = await res.json();
            set({
              appName: data.appName || 'VOC POS',
              taxEnabled: data.taxEnabled ?? true,
              taxRate: data.taxRate ?? 11,
              roundingUnit: data.roundingUnit ?? 0,
              invoiceHeader: data.invoiceHeader || '',
              invoiceFooter: data.invoiceFooter || '',
              appLogo: data.appLogo || null,
              companyAddress: data.companyAddress || localStorage.getItem('pos_dist_comp_address') || 'Jl. Raya Industri Pergudangan No. 88, Blok B3-B5, Jakarta',
              companyPhone: data.companyPhone || localStorage.getItem('pos_dist_comp_phone') || '0812-3456-7890 / 021-5551234',
              companyEmail: data.companyEmail || localStorage.getItem('pos_dist_comp_email') || 'distribusi@posmart.co.id',
              companyNpwp: data.companyNpwp || localStorage.getItem('pos_dist_comp_npwp') || '01.234.567.8-901.000',
              bankName: data.bankName || localStorage.getItem('pos_dist_bank_name') || 'BCA (Bank Central Asia)',
              bankAccount: data.bankAccount || localStorage.getItem('pos_dist_bank_acc') || '8830-192-888',
              bankHolder: data.bankHolder || localStorage.getItem('pos_dist_bank_holder') || 'PT SWALAYAN RETAIL INDONESIA',
              distributorTerms: data.distributorTerms || localStorage.getItem('pos_dist_terms') || DEFAULT_DIST_TERMS,
            });
          }
        } catch (err) {
          console.error("Gagal load settings:", err);
        }
      },
      saveSettings: async (settings) => {
        set(settings);

        // Sync ke localStorage untuk akses instan offline / komponen cetak
        if (settings.companyAddress !== undefined) localStorage.setItem('pos_dist_comp_address', settings.companyAddress);
        if (settings.companyPhone !== undefined) localStorage.setItem('pos_dist_comp_phone', settings.companyPhone);
        if (settings.companyEmail !== undefined) localStorage.setItem('pos_dist_comp_email', settings.companyEmail);
        if (settings.companyNpwp !== undefined) localStorage.setItem('pos_dist_comp_npwp', settings.companyNpwp);
        if (settings.bankName !== undefined) localStorage.setItem('pos_dist_bank_name', settings.bankName);
        if (settings.bankAccount !== undefined) localStorage.setItem('pos_dist_bank_acc', settings.bankAccount);
        if (settings.bankHolder !== undefined) localStorage.setItem('pos_dist_bank_holder', settings.bankHolder);
        if (settings.distributorTerms !== undefined) localStorage.setItem('pos_dist_terms', settings.distributorTerms);

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

      setCompanyAddress: (address) => {
        localStorage.setItem('pos_dist_comp_address', address);
        set({ companyAddress: address });
      },
      setCompanyPhone: (phone) => {
        localStorage.setItem('pos_dist_comp_phone', phone);
        set({ companyPhone: phone });
      },
      setCompanyEmail: (email) => {
        localStorage.setItem('pos_dist_comp_email', email);
        set({ companyEmail: email });
      },
      setCompanyNpwp: (npwp) => {
        localStorage.setItem('pos_dist_comp_npwp', npwp);
        set({ companyNpwp: npwp });
      },
      setBankName: (name) => {
        localStorage.setItem('pos_dist_bank_name', name);
        set({ bankName: name });
      },
      setBankAccount: (acc) => {
        localStorage.setItem('pos_dist_bank_acc', acc);
        set({ bankAccount: acc });
      },
      setBankHolder: (holder) => {
        localStorage.setItem('pos_dist_bank_holder', holder);
        set({ bankHolder: holder });
      },
      setDistributorTerms: (terms) => {
        localStorage.setItem('pos_dist_terms', terms);
        set({ distributorTerms: terms });
      },
    })
);
