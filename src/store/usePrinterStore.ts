import { create } from 'zustand';
import { buildTestReceiptBytes, buildReceiptEscPos } from '../utils/escpos';
import type { SalesTransaction } from '../types';
import type { ReceiptOptions } from '../utils/receipt';

// Layanan Bluetooth GATT standar yang digunakan printer thermal ESC/POS
const THERMAL_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Pos-58 / VSC / Panda / MPT
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Bluetooth Serial (Micro-printer)
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom vendor BLE
  '0000fee7-0000-1000-8000-00805f9b34fb', // Jerry / Bluetooth POS
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 Serial
];

interface PrinterState {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string | null;
  deviceId: string | null;
  paperWidth: '58mm' | '80mm';
  autoCut: boolean;
  autoPrintOnCheckout: boolean;
  lastPrintedAt: string | null;
  error: string | null;

  connect: () => Promise<boolean>;
  disconnect: () => void;
  sendBytes: (data: Uint8Array) => Promise<boolean>;
  testPrint: (storeName?: string) => Promise<boolean>;
  printReceiptBluetooth: (sale: SalesTransaction, options: ReceiptOptions) => Promise<boolean>;
  setPaperWidth: (width: '58mm' | '80mm') => void;
  setAutoCut: (val: boolean) => void;
  setAutoPrintOnCheckout: (val: boolean) => void;
  clearError: () => void;
}

// Global reference untuk Web Bluetooth handle (karena objek BluetoothDevice bukan serializable)
let activeDevice: any = null;
let activeCharacteristic: any = null;

export const usePrinterStore = create<PrinterState>((set, get) => {
  // Load saved preferences from localStorage
  const savedWidth = (localStorage.getItem('pos_printer_width') as '58mm' | '80mm') || '58mm';
  const savedAutoCut = localStorage.getItem('pos_printer_autocut') === 'true';
  const savedAutoPrint = localStorage.getItem('pos_printer_autoprint') !== 'false'; // default true
  const savedDeviceName = localStorage.getItem('pos_printer_device_name') || null;

  const isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  return {
    isSupported,
    isConnected: false,
    isConnecting: false,
    deviceName: savedDeviceName,
    deviceId: localStorage.getItem('pos_printer_device_id') || null,
    paperWidth: savedWidth,
    autoCut: savedAutoCut,
    autoPrintOnCheckout: savedAutoPrint,
    lastPrintedAt: null,
    error: null,

    clearError: () => set({ error: null }),

    setPaperWidth: (width) => {
      localStorage.setItem('pos_printer_width', width);
      set({ paperWidth: width });
    },

    setAutoCut: (val) => {
      localStorage.setItem('pos_printer_autocut', String(val));
      set({ autoCut: val });
    },

    setAutoPrintOnCheckout: (val) => {
      localStorage.setItem('pos_printer_autoprint', String(val));
      set({ autoPrintOnCheckout: val });
    },

    connect: async () => {
      const nav = navigator as any;
      if (!nav?.bluetooth) {
        set({ error: 'Browser Anda tidak mendukung Web Bluetooth. Gunakan Google Chrome atau Edge.' });
        return false;
      }

      set({ isConnecting: true, error: null });

      try {
        // 1. Buka dialog pencarian perangkat Bluetooth
        const device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: THERMAL_PRINTER_SERVICES
        });

        if (!device) {
          throw new Error('Tidak ada perangkat printer yang dipilih.');
        }

        // Listener saat printer terputus (dimatikan / keluar jangkauan)
        device.addEventListener('gattserverdisconnected', () => {
          activeDevice = null;
          activeCharacteristic = null;
          set({ isConnected: false });
        });

        // 2. Hubungkan ke GATT Server
        const server = await device.gatt.connect();

        // 3. Cari karakteristik writable (untuk mengirim perintah cetak ESC/POS)
        let writeChar: any = null;

        // Coba cari di semua primary services yang tersedia
        try {
          const services = await server.getPrimaryServices();
          for (const service of services) {
            try {
              const characteristics = await service.getCharacteristics();
              for (const c of characteristics) {
                if (c.properties.write || c.properties.writeWithoutResponse) {
                  writeChar = c;
                  break;
                }
              }
            } catch (e) {}
            if (writeChar) break;
          }
        } catch (e) {
          // Fallback coba satu per satu service UUID yang umum
          for (const uuid of THERMAL_PRINTER_SERVICES) {
            try {
              const service = await server.getPrimaryService(uuid);
              const chars = await service.getCharacteristics();
              for (const c of chars) {
                if (c.properties.write || c.properties.writeWithoutResponse) {
                  writeChar = c;
                  break;
                }
              }
            } catch (err) {}
            if (writeChar) break;
          }
        }

        if (!writeChar) {
          throw new Error('Karakteristik kirim data printer tidak ditemukan. Pastikan printer dalam mode ESC/POS.');
        }

        activeDevice = device;
        activeCharacteristic = writeChar;

        localStorage.setItem('pos_printer_device_name', device.name || 'Printer Bluetooth');
        localStorage.setItem('pos_printer_device_id', device.id);

        set({
          isConnected: true,
          isConnecting: false,
          deviceName: device.name || 'Printer Bluetooth',
          deviceId: device.id,
          error: null
        });

        return true;
      } catch (err: any) {
        console.error('Bluetooth connection failed:', err);
        const errMsg = err.name === 'NotFoundError' 
          ? 'Pencarian dibatalkan atau printer tidak dipilih.' 
          : (err.message || 'Gagal menyambungkan ke printer Bluetooth.');
        set({
          isConnected: false,
          isConnecting: false,
          error: errMsg
        });
        return false;
      }
    },

    disconnect: () => {
      try {
        if (activeDevice && activeDevice.gatt?.connected) {
          activeDevice.gatt.disconnect();
        }
      } catch (e) {
        console.error(e);
      }
      activeDevice = null;
      activeCharacteristic = null;
      set({ isConnected: false });
    },

    sendBytes: async (data: Uint8Array) => {
      if (!activeCharacteristic) {
        set({ error: 'Printer Bluetooth belum terhubung.' });
        return false;
      }

      try {
        // Kirim dalam chunk ukuran 100 byte agar buffer BLE tidak overflow
        const CHUNK_SIZE = 100;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          const chunk = data.slice(i, i + CHUNK_SIZE);
          if (activeCharacteristic.writeValueWithoutResponse) {
            await activeCharacteristic.writeValueWithoutResponse(chunk);
          } else {
            await activeCharacteristic.writeValue(chunk);
          }
          await new Promise(r => setTimeout(r, 25));
        }

        set({ lastPrintedAt: new Date().toISOString() });
        return true;
      } catch (err: any) {
        console.error('Print sending failed:', err);
        set({ error: `Gagal mengirim data cetak: ${err.message || err}` });
        return false;
      }
    },

    testPrint: async (storeName = 'HERO PRO SHOP') => {
      const state = get();
      if (!activeCharacteristic) {
        // Coba koneksi ulang jika belum terhubung
        const ok = await state.connect();
        if (!ok) return false;
      }

      const bytes = buildTestReceiptBytes(storeName, {
        paperWidth: state.paperWidth,
        autoCut: state.autoCut
      });

      return await state.sendBytes(bytes);
    },

    printReceiptBluetooth: async (sale: SalesTransaction, options: ReceiptOptions) => {
      const state = get();
      if (!activeCharacteristic) {
        const ok = await state.connect();
        if (!ok) return false;
      }

      const bytes = buildReceiptEscPos(sale, options, {
        paperWidth: state.paperWidth,
        autoCut: state.autoCut
      });

      return await state.sendBytes(bytes);
    }
  };
});
