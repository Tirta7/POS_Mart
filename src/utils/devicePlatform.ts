/**
 * Device & Platform Utility — Swalayan APPS POS Mart
 * ---------------------------------------------------------------------------
 * Mendeteksi perangkat Mobile iOS vs Android untuk menerapkan styling spesifik:
 * - 'platform-ios'     : Mengaktifkan desain Cupertino iOS (Human Interface Guidelines)
 * - 'platform-android' : Mengaktifkan desain Material 3 Android
 * - 'is-mobile'        : Aktif saat layar HP (<= 768px atau touch device)
 * - 'is-standalone'    : Aktif saat dibuka via PWA Add to Home Screen
 *
 * Mendukung simulasi/preview di desktop browser dengan parameter URL:
 * ?platform=ios atau ?platform=android
 */

export type PlatformType = 'ios' | 'android' | 'desktop';

const STORAGE_KEY = 'pos_platform_override';

export function getDevicePlatform(): PlatformType {
  if (typeof window === 'undefined') return 'desktop';

  // 1. Cek parameter URL (?platform=ios atau ?platform=android)
  const urlParams = new URLSearchParams(window.location.search);
  const param = urlParams.get('platform')?.toLowerCase();
  if (param === 'ios' || param === 'android') {
    try {
      sessionStorage.setItem(STORAGE_KEY, param);
    } catch {
      // ignore
    }
    return param;
  }

  // 2. Cek override di sessionStorage
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'ios' || stored === 'android') {
      return stored;
    }
  } catch {
    // ignore
  }

  // 3. Deteksi User Agent
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';

  // Deteksi iOS (iPhone, iPod, atau iPad dengan touch screen <= 1024px)
  const isIOS =
    /iPhone|iPod/.test(ua) ||
    (/iPad/.test(ua) && window.innerWidth <= 1024) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && window.innerWidth <= 1024);

  if (isIOS) return 'ios';

  // Deteksi Android mobile (bukan tablet desktop)
  const isAndroid = /Android/i.test(ua) && window.innerWidth <= 768;
  if (isAndroid) return 'android';

  // 4. Jika resolusi layar HP (<= 768px) pada browser desktop/pengujian:
  if (window.innerWidth <= 768) {
    return 'ios';
  }

  return 'desktop';
}

export function setDevicePlatform(platform: 'ios' | 'android' | 'auto') {
  if (typeof window === 'undefined') return;
  try {
    if (platform === 'auto') {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, platform);
    }
  } catch {
    // ignore
  }
  applyDevicePlatform();
}

export function applyDevicePlatform() {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const platform = getDevicePlatform();
  const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024);

  // Bersihkan kelas lama
  root.classList.remove('platform-ios', 'platform-android', 'platform-desktop', 'is-mobile');

  if (platform === 'ios') {
    root.classList.add('platform-ios');
    root.classList.add('is-mobile');
  } else if (platform === 'android') {
    root.classList.add('platform-android');
    root.classList.add('is-mobile');
  } else {
    // Desktop mode
    root.classList.add('platform-desktop');
    if (isMobile) {
      root.classList.add('platform-ios');
      root.classList.add('is-mobile');
    }
  }

  if (isMobile) {
    root.classList.add('is-mobile');
  } else {
    root.classList.remove('is-mobile');
  }

  // PWA standalone detection
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;

  if (isStandalone) {
    root.classList.add('is-standalone');
  } else {
    root.classList.remove('is-standalone');
  }
}

export function initDevicePlatform() {
  if (typeof window === 'undefined') return;

  applyDevicePlatform();

  // Pasang listener saat orientasi / ukuran layar berubah
  window.addEventListener('resize', applyDevicePlatform, { passive: true });
  window.addEventListener('orientationchange', applyDevicePlatform, { passive: true });

  // Expose ke window untuk debugging cepat di console browser
  (window as any).__setPlatform = setDevicePlatform;
  (window as any).__getPlatform = getDevicePlatform;
}
