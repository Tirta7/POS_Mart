// =============================================================================
// Web Push Notification — klien.
// - Mendaftarkan service worker (/sw.js)
// - Subscribe / unsubscribe device ke server push (/api/push/*)
// - Mengirim event "Uang Masuk" setelah transaksi kasir berhasil
// =============================================================================
import type { SalesTransaction } from '../types';

const API = '/api/push';

export type PushUnsupportedReason = 'insecure' | 'unsupported' | 'ios-not-installed';

export interface PushSupport {
  ok: boolean;
  /** null jika didukung */
  reason: PushUnsupportedReason | null;
}

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Cek apakah device ini bisa menerima Web Push. */
export function getPushSupport(): PushSupport {
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' };
  // iOS hanya mengekspos PushManager jika aplikasi dibuka dari Home Screen (iOS 16.4+).
  if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-not-installed' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  return { ok: true, reason: null };
}

export const permissionState = (): NotificationPermission | 'unsupported' =>
  'Notification' in window ? Notification.permission : 'unsupported';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[push] gagal register service worker:', err);
    return null;
  }
}

async function getRegistration() {
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await registerServiceWorker());
  if (!reg) throw new Error('Service worker tidak tersedia');
  await navigator.serviceWorker.ready;
  return reg;
}

/** Apakah device ini sedang terdaftar menerima notifikasi. */
export async function isSubscribed() {
  if (!getPushSupport().ok) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Minta izin + subscribe device ini. Harus dipanggil dari aksi user (tap/klik). */
export async function enablePush() {
  const support = getPushSupport();
  if (!support.ok) throw new Error(support.reason ?? 'unsupported');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const reg = await getRegistration();
  const res = await fetch(`${API}/public-key`);
  if (!res.ok) throw new Error('server');
  const { publicKey } = await res.json();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const save = await fetch(`${API}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!save.ok) throw new Error('server');
}

/** Berhenti menerima notifikasi di device ini. */
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch(`${API}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

async function notify(title: string, body: string, tag?: string) {
  const res = await fetch(`${API}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, tag, url: '/backoffice/reports' }),
  });
  if (!res.ok) throw new Error('server');
  return (await res.json()) as { sent: number; total: number };
}

const METHOD_LABEL: Record<string, string> = {
  TUNAI: 'CASH',
  'KARTU DEBIT': 'DEBIT',
  'KARTU KREDIT': 'KREDIT',
};

const formatRp = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID');

/** Format isi notifikasi sesuai permintaan:
 *  Uang Masuk
 *  CASH Rp180.000
 *  Customer: Andi
 *  Kasir: Bagas
 */
export function buildSaleNotification(sale: Pick<SalesTransaction, 'paymentMethod' | 'total'>, customerName?: string, cashierName?: string) {
  const method = METHOD_LABEL[sale.paymentMethod?.toUpperCase()] || sale.paymentMethod?.toUpperCase() || 'CASH';
  return {
    title: 'Uang Masuk',
    body: [
      `${method} ${formatRp(sale.total)}`,
      `Customer: ${customerName?.trim() || 'Umum'}`,
      `Kasir: ${cashierName?.trim() || '-'}`,
    ].join('\n'),
  };
}

/** Dipanggil setelah transaksi berhasil. Fire-and-forget: tidak pernah memblokir kasir. */
export function sendSaleNotification(sale: SalesTransaction, customerName?: string, cashierName?: string) {
  const { title, body } = buildSaleNotification(sale, customerName, cashierName);
  notify(title, body, sale.id).catch((err) => console.warn('[push] notifikasi transaksi gagal:', err));
}

/** Kirim notifikasi contoh ke semua device terdaftar (tombol "Kirim Tes"). */
export function sendTestNotification(cashierName?: string) {
  const { title, body } = buildSaleNotification({ paymentMethod: 'TUNAI', total: 180000 }, 'Andi', cashierName || 'Bagas');
  return notify(title, body, 'test-' + Date.now());
}
