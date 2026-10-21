import { create } from 'zustand';
import { buildTestReceiptBytes, buildReceiptEscPos } from '../utils/escpos';
import type { SalesTransaction } from '../types';
import type { ReceiptOptions } from '../utils/receipt';

// Layanan Bluetooth GATT standar yang digunakan printer thermal ESC/POS (termasuk RPP02N, PT-210, MPT-II, POS-58, dll)
const THERMAL_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Pos-58 / VSC / Panda / MPT
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Bluetooth Serial (Micro-printer)
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom vendor BLE / RPP02N / Xprinter
  '0000fee7-0000-1000-8000-00805f9b34fb', // Jerry / Bluetooth POS
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 Serial
  '0000fff0-0000-1000-8000-00805f9b34fb', // Generic Thermal POS BLE
  '0000ae00-0000-1000-8000-00805f9b34fb', // Common 58mm Mobile POS
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
  printDoubleCopies: boolean;
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
  setPrintDoubleCopies: (val: boolean) => void;
  clearError: () => void;
  clearDisconnectAlert: () => void;
}

// Global reference untuk Web Bluetooth handle
let activeDevice: any = null;
let activeCharacteristic: any = null;
let isReconnectingGatt = false;

/**
 * Helper untuk menyambungkan GATT server dan mencari karakteristik tulis ESC/POS
 */
async function connectDeviceGatt(device: any, onDisconnect: () => void): Promise<{ device: any; characteristic: any }> {
  let server = device.gatt;
  if (!server) {
    throw new Error('GATT server tidak tersedia pada perangkat Bluetooth ini.');
  }

  // Jika koneksi sebelumnya masih menggantung (stale dari sebelum refresh), putuskan dulu
  if (server.connected) {
    try {
      server.disconnect();
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {}
  }

  // Sambungkan GATT server dengan toleransi retry saat peripheral masih mereset sesi
  let connectAttempts = 0;
  while (!server.connected && connectAttempts < 3) {
    try {
      connectAttempts++;
      server = await device.gatt.connect();
      break;
    } catch (err) {
      if (connectAttempts >= 3) throw err;
      await new Promise(r => setTimeout(r, 350));
    }
  }

  // Pasang listener saat koneksi terputus
  try {
    device.removeEventListener('gattserverdisconnected', onDisconnect);
  } catch (e) {}
  device.addEventListener('gattserverdisconnected', onDisconnect);

  let writeChar: any = null;

  // 1. Coba getPrimaryServices umum (jika diizinkan oleh browser)
  try {
    const services = await server.getPrimaryServices();
    if (services && services.length > 0) {
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
    }
  } catch (e) {
    // getPrimaryServices tanpa filter UUID bisa memicu exception di Chrome, lanjut ke fallback per UUID
  }

  // 2. Fallback: periksa setiap UUID layanan thermal printer standar secara spesifik
  if (!writeChar) {
    for (const uuid of THERMAL_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(uuid);
        if (service) {
          const characteristics = await service.getCharacteristics();
          for (const c of characteristics) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              writeChar = c;
              break;
            }
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
  const savedDoubleCopies = localStorage.getItem('pos_printer_double_copies') === 'true';
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
    printDoubleCopies: savedDoubleCopies,
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

    setPrintDoubleCopies: (val) => {
      localStorage.setItem('pos_printer_double_copies', String(val));
      set({ printDoubleCopies: val });
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

      // Jika printer sudah terhubung aktif, jangan sambung ulang
      if (activeDevice?.gatt?.connected && activeCharacteristic) {
        set({ isConnected: true, isConnecting: false });
        return true;
      }

      // Hindari proses reconnect bersamaan
      if (isReconnectingGatt) {
        return false;
      }

      isReconnectingGatt = true;
      set({ isConnecting: true, error: null });

      try {
        let targetDevice: any = null;

        // 1. Ambil daftar perangkat yang telah diizinkan oleh pengguna sebelumnya
        if (nav.bluetooth.getDevices) {
          try {
            const devices = await nav.bluetooth.getDevices();
            if (devices && devices.length > 0) {
              targetDevice = devices.find((d: any) => 
                (savedId && d.id === savedId) ||
                (savedName && d.name && d.name.trim().toLowerCase() === savedName.trim().toLowerCase()) ||
                (savedName && d.name && d.name.toLowerCase().includes(savedName.toLowerCase()))
              ) || devices[0];
            }
          } catch (e) {
            console.warn('getDevices failed or restricted:', e);
          }
        }

        // 2. Jika tidak ditemukan lewat getDevices()
        if (!targetDevice) {
          isReconnectingGatt = false;
          if (silent) {
            set({ isConnecting: false });
            return false;
          }
          return await get().connect();
        }

        // Aktifkan watchAdvertisements jika browser mendukung, agar bila printer baru dinyalakan otomatis terdeteksi
        if (targetDevice.watchAdvertisements && !targetDevice._hasAdvListener) {
          try {
            targetDevice._hasAdvListener = true;
            targetDevice.addEventListener('advertisementreceived', async () => {
              const state = get();
              if (!state.isConnected && !state.isConnecting) {
                state.reconnectSavedDevice(true);
              }
            });
            await targetDevice.watchAdvertisements();
          } catch (e) {}
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

        const effectiveName = device.name || savedName || 'RPP02N';
        localStorage.setItem('pos_printer_device_name', effectiveName);
        localStorage.setItem('pos_printer_device_id', device.id);

        isReconnectingGatt = false;
        set({
          isConnected: true,
          isConnecting: false,
          deviceName: effectiveName,
          deviceId: device.id,
          error: null,
          disconnectAlert: null
        });

        return true;
      } catch (err: any) {
        console.warn('Auto-reconnect attempt failed:', err);
        isReconnectingGatt = false;
        set({ isConnecting: false });
        if (!silent) {
          set({
            isConnected: false,
            error: `Gagal menyambungkan ke ${savedName || 'printer'}. Pastikan printer menyala dan berada dalam jangkauan.`
          });
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

      const isDouble = state.printDoubleCopies;
      const copies = isDouble ? 2 : 1;
      let success = true;

      for (let c = 0; c < copies; c++) {
        const copyLabel = isDouble ? (c === 0 ? 'LEMBAR PELANGGAN' : 'LEMBAR TOKO / ARSIP') : undefined;
        const bytes = await buildReceiptEscPos(sale, options, {
          paperWidth: state.paperWidth,
          autoCut: state.autoCut,
          copyLabel
        });

        const ok = await state.sendBytes(bytes);
        if (!ok) {
          success = false;
          break;
        }

        if (c < copies - 1) {
          // Jeda agar buffer printer selesai mencetak dan memotong lembar pertama
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }

      return success;
    }
  };
});

// Auto Reconnect saat halaman pertama kali dibuka / direfresh
if (typeof window !== 'undefined') {
  const triggerAutoReconnect = async () => {
    const savedId = localStorage.getItem('pos_printer_device_id');
    const savedName = localStorage.getItem('pos_printer_device_name');
    const autoRec = localStorage.getItem('pos_printer_autoreconnect') !== 'false';
    if ((savedId || savedName) && autoRec) {
      const state = usePrinterStore.getState();
      if (!state.isConnected && !state.isConnecting) {
        await state.reconnectSavedDevice(true);
      }
    }
  };

  // 1. Percobaan awal setelah render (500ms)
  setTimeout(triggerAutoReconnect, 500);

  // 2. Percobaan kedua (1800ms) — saat printer BLE telah selesai mereset sesi lama dari sebelum refresh
  setTimeout(triggerAutoReconnect, 1800);

  // 3. Percobaan ketiga (3500ms) — memastikan koneksi terhubung jika inisialisasi Bluetooth OS sedikit lambat
  setTimeout(triggerAutoReconnect, 3500);

  // 4. Auto Reconnect saat jendela browser difokuskan kembali (tab aktif lagi)
  window.addEventListener('focus', () => {
    setTimeout(triggerAutoReconnect, 300);
  });

  // 5. User Gesture fallback: Jika kebijakan browser Chrome membatasi koneksi GATT di latar belakang
  // sebelum adanya interaksi pertama pengguna, klik/sentuh/tombol PERTAMA kasir di layar akan langsung
  // menyambungkan ke printer secara instan tanpa dialog scan ulang!
  const onFirstUserGesture = () => {
    triggerAutoReconnect();
  };
  window.addEventListener('pointerdown', onFirstUserGesture, { once: true, passive: true });
  window.addEventListener('keydown', onFirstUserGesture, { once: true, passive: true });
  window.addEventListener('touchstart', onFirstUserGesture, { once: true, passive: true });
}
