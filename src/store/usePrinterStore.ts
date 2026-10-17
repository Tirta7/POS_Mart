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
  autoReconnect: boolean;
  lastPrintedAt: string | null;
  error: string | null;
  disconnectAlert: string | null;

  connect: () => Promise<boolean>;
  reconnectSavedDevice: (silent?: boolean) => Promise<boolean>;
  disconnect: () => void;
  forgetDevice: () => void;
  sendBytes: (data: Uint8Array) => Promise<boolean>;
  testPrint: (storeName?: string) => Promise<boolean>;
  printReceiptBluetooth: (sale: SalesTransaction, options: ReceiptOptions) => Promise<boolean>;
  setPaperWidth: (width: '58mm' | '80mm') => void;
  setAutoCut: (val: boolean) => void;
  setAutoPrintOnCheckout: (val: boolean) => void;
  setAutoReconnect: (val: boolean) => void;
  clearError: () => void;
  clearDisconnectAlert: () => void;
}

// Global reference untuk Web Bluetooth handle
let activeDevice: any = null;
let activeCharacteristic: any = null;

/**
 * Helper untuk menyambungkan GATT server dan mencari karakteristik tulis ESC/POS
 */
async function connectDeviceGatt(device: any, onDisconnect: () => void): Promise<{ device: any; characteristic: any }> {
  // Listener saat koneksi putus
  device.addEventListener('gattserverdisconnected', onDisconnect);

  let server = device.gatt;
  if (!server.connected) {
    server = await device.gatt.connect();
  }

  let writeChar: any = null;

  // 1. Coba getPrimaryServices
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
    // 2. Fallback per UUID
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
    throw new Error('Karakteristik pengiriman data printer tidak ditemukan. Pastikan printer dalam mode ESC/POS.');
  }

  return { device, characteristic: writeChar };
}

export const usePrinterStore = create<PrinterState>((set, get) => {
  // Load saved preferences from localStorage
  const savedWidth = (localStorage.getItem('pos_printer_width') as '58mm' | '80mm') || '58mm';
  const savedAutoCut = localStorage.getItem('pos_printer_autocut') === 'true';
  const savedAutoPrint = localStorage.getItem('pos_printer_autoprint') !== 'false'; // default true
  const savedAutoReconnect = localStorage.getItem('pos_printer_autoreconnect') !== 'false'; // default true
  const savedDeviceName = localStorage.getItem('pos_printer_device_name') || null;
  const savedDeviceId = localStorage.getItem('pos_printer_device_id') || null;

  const isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  return {
    isSupported,
    isConnected: false,
    isConnecting: false,
    deviceName: savedDeviceName,
    deviceId: savedDeviceId,
    paperWidth: savedWidth,
    autoCut: savedAutoCut,
    autoPrintOnCheckout: savedAutoPrint,
    autoReconnect: savedAutoReconnect,
    lastPrintedAt: null,
    error: null,
    disconnectAlert: null,

    clearError: () => set({ error: null }),
    clearDisconnectAlert: () => set({ disconnectAlert: null }),

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

    setAutoReconnect: (val) => {
      localStorage.setItem('pos_printer_autoreconnect', String(val));
      set({ autoReconnect: val });
    },

    /**
     * Menyambungkan kembali ke perangkat printer yang sudah pernah terdaftar
     * Tanpa perlu memunculkan dialog pencarian perangkat baru jika sudah diizinkan oleh browser
     */
    reconnectSavedDevice: async (silent = false) => {
      const nav = navigator as any;
      if (!nav?.bluetooth) {
        if (!silent) set({ error: 'Browser Anda tidak mendukung Web Bluetooth.' });
        return false;
      }

      const savedId = localStorage.getItem('pos_printer_device_id');
      const savedName = localStorage.getItem('pos_printer_device_name');

      if (!savedId && !savedName) {
        if (!silent) set({ error: 'Belum ada printer Bluetooth yang tersimpan.' });
        return false;
      }

      set({ isConnecting: true, error: null });

      try {
        let targetDevice: any = null;

        // 1. Coba ambil dari getDevices() (API Web Bluetooth untuk perangkat yang sudah dipasangkan)
        if (nav.bluetooth.getDevices) {
          try {
            const devices = await nav.bluetooth.getDevices();
            if (devices && devices.length > 0) {
              targetDevice = devices.find((d: any) => (savedId && d.id === savedId) || (savedName && d.name === savedName)) || devices[0];
            }
          } catch (e) {
            console.warn('getDevices not supported or failed:', e);
          }
        }

        // 2. Jika tidak ditemukan lewat getDevices() dan bukan silent, fallback ke scan manual
        if (!targetDevice) {
          if (silent) {
            set({ isConnecting: false });
            return false;
          }
          return await get().connect();
        }

        const onDisconnect = () => {
          activeDevice = null;
          activeCharacteristic = null;
          const currentName = get().deviceName || 'Printer Kasir';
          set({ 
            isConnected: false,
            disconnectAlert: `Printer Kasir (${currentName}) terputus dari perangkat. Pastikan printer menyala dan dekat.`
          });
        };

        const { device, characteristic } = await connectDeviceGatt(targetDevice, onDisconnect);
        activeDevice = device;
        activeCharacteristic = characteristic;

        localStorage.setItem('pos_printer_device_name', device.name || savedName || 'Printer Bluetooth');
        localStorage.setItem('pos_printer_device_id', device.id);

        set({
          isConnected: true,
          isConnecting: false,
          deviceName: device.name || savedName || 'Printer Bluetooth',
          deviceId: device.id,
          error: null,
          disconnectAlert: null
        });

        return true;
      } catch (err: any) {
        console.warn('Reconnect error:', err);
        if (!silent) {
          set({
            isConnected: false,
            isConnecting: false,
            error: `Gagal menyambungkan ke ${savedName || 'printer'}. Pastikan printer menyala dan berada dalam jangkauan.`
          });
        } else {
          set({ isConnecting: false });
        }
        return false;
      }
    },

    /**
     * Buka dialog pencarian perangkat Bluetooth baru
     */
    connect: async () => {
      const nav = navigator as any;
      if (!nav?.bluetooth) {
        set({ error: 'Browser Anda tidak mendukung Web Bluetooth. Gunakan Google Chrome atau Microsoft Edge.' });
        return false;
      }

      set({ isConnecting: true, error: null });

      try {
        // Buka dialog pemilih perangkat Bluetooth bawaan browser
        const device = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: THERMAL_PRINTER_SERVICES
        });

        if (!device) {
          throw new Error('Tidak ada perangkat printer yang dipilih.');
        }

        const onDisconnect = () => {
          activeDevice = null;
          activeCharacteristic = null;
          const currentName = get().deviceName || 'Printer Kasir';
          set({ 
            isConnected: false,
            disconnectAlert: `Printer Kasir (${currentName}) terputus dari perangkat. Pastikan printer menyala dan dekat.`
          });
        };

        const { characteristic } = await connectDeviceGatt(device, onDisconnect);

        activeDevice = device;
        activeCharacteristic = characteristic;

        localStorage.setItem('pos_printer_device_name', device.name || 'Printer Bluetooth');
        localStorage.setItem('pos_printer_device_id', device.id);

        set({
          isConnected: true,
          isConnecting: false,
          deviceName: device.name || 'Printer Bluetooth',
          deviceId: device.id,
          error: null,
          disconnectAlert: null
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
      set({ isConnected: false, disconnectAlert: null });
    },

    forgetDevice: () => {
      get().disconnect();
      localStorage.removeItem('pos_printer_device_name');
      localStorage.removeItem('pos_printer_device_id');
      set({
        deviceName: null,
        deviceId: null,
        isConnected: false,
        disconnectAlert: null,
        error: null
      });
    },

    sendBytes: async (data: Uint8Array) => {
      if (!activeCharacteristic || !activeDevice?.gatt?.connected) {
        // Coba auto reconnect jika ada perangkat tersimpan
        const reconnected = await get().reconnectSavedDevice(true);
        if (!reconnected || !activeCharacteristic) {
          set({ error: 'Printer Bluetooth belum terhubung. Silakan sambungkan printer.' });
          return false;
        }
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

    testPrint: async (storeName = 'POS MART') => {
      const state = get();
      if (!activeCharacteristic || !activeDevice?.gatt?.connected) {
        // Coba koneksi ulang perangkat tersimpan
        const ok = await state.reconnectSavedDevice(false);
        if (!ok) return false;
      }

      const bytes = await buildTestReceiptBytes(storeName, {
        paperWidth: get().paperWidth,
        autoCut: get().autoCut
      });

      return await get().sendBytes(bytes);
    },

    printReceiptBluetooth: async (sale: SalesTransaction, options: ReceiptOptions) => {
      const state = get();
      if (!activeCharacteristic || !activeDevice?.gatt?.connected) {
        const ok = await state.reconnectSavedDevice(false);
        if (!ok) return false;
      }

      const bytes = await buildReceiptEscPos(sale, options, {
        paperWidth: get().paperWidth,
        autoCut: get().autoCut
      });

      return await get().sendBytes(bytes);
    }
  };
});

// Auto Reconnect saat halaman pertama kali dibuka / direfresh
if (typeof window !== 'undefined') {
  setTimeout(() => {
    const savedId = localStorage.getItem('pos_printer_device_id');
    const autoRec = localStorage.getItem('pos_printer_autoreconnect') !== 'false';
    if (savedId && autoRec) {
      usePrinterStore.getState().reconnectSavedDevice(true);
    }
  }, 600);

  // Auto Reconnect saat jendela browser aktif kembali
  window.addEventListener('focus', () => {
    const state = usePrinterStore.getState();
    const autoRec = localStorage.getItem('pos_printer_autoreconnect') !== 'false';
    if (!state.isConnected && state.deviceId && autoRec && !state.isConnecting) {
      state.reconnectSavedDevice(true);
    }
  });
}
