import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { checkLicense, activateLicense } from './vocml-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Konfigurasi VOCML
const VOCML_SERVER_URL = process.env.VOCML_SERVER_URL || 'https://vocml.vocpos.id';
const VOCML_PRODUCT = process.env.VOCML_PRODUCT || 'pos';
const VOCML_API_KEY = process.env.VOCML_API_KEY || '';
const CACHE_FILE = path.join(__dirname, 'data', 'license-cache.json');

// 2. Kunci Publik VOC ML (Ed25519)
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEADenKScMcRxd/GFPnwHLg026Y3mKWNmtyUR1KPQgLTFI=
-----END PUBLIC KEY-----`;

export let licenseState = {
  allowed: true,
  status: 'pending',
  reason: 'Menunggu pengecekan awal',
  machineId: '',
  expiresAt: null,
  daysLeft: null,
  licenseKey: null,
  lockReason: '',
  billing: null,
  offline: false,
};

export let messagesState = [];

export function getMachineId() {
  if (process.env.MACHINE_ID) {
    return process.env.MACHINE_ID.trim().toUpperCase();
  }

  try {
    if (process.platform === 'darwin') {
      const result = execSync('ioreg -rd1 -c IOPlatformExpertDevice | awk \'/IOPlatformUUID/ { split($0, line, "\\\""); printf("%s\\n", line[4]); }\'');
      const id = result.toString().trim().toUpperCase();
      if (id) return id;
    }
    const scriptPath = path.resolve(__dirname, 'get-machine-id.ps1');
    const result = execSync(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}"`);
    return result.toString().trim().toUpperCase();
  } catch (err) {
    console.error('Gagal mendapatkan Machine ID:', err);
    return 'UNKNOWN-MACHINE';
  }
}

// Client SSE yang sedang terhubung
const sseClients = new Set();

function broadcastLicense(state) {
  const payload = `event: license\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function broadcastMessages(msgs) {
  const namedPayload = `event: messages\ndata: ${JSON.stringify(msgs)}\n\n`;
  const defaultPayload = `data: ${JSON.stringify(msgs)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(namedPayload);
      client.write(defaultPayload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Heartbeat ping untuk SSE setiap 20 detik agar koneksi tetap stabil
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 20000).unref();

let checkTimer = null;
let messagesTimer = null;

/** Verifikasi lisensi ke VOCML atau offline cache */
export async function verifikasiAplikasi() {
  const machineId = getMachineId();

  if (process.env.SKIP_LICENSE === 'true') {
    licenseState = {
      allowed: true,
      status: 'active',
      reason: 'Lisensi lokal diaktifkan (SKIP_LICENSE=true)',
      machineId,
      expiresAt: '2099-12-31',
      daysLeft: 9999,
      licenseKey: 'SKIP_LICENSE',
      lockReason: '',
      billing: null,
      offline: false,
    };
    broadcastLicense(licenseState);
    return licenseState;
  }

  try {
    const lisensi = await checkLicense({
      serverUrl: VOCML_SERVER_URL,
      product: VOCML_PRODUCT,
      machineId: machineId,
      publicKeyPem: PUBLIC_KEY,
      cacheFile: CACHE_FILE,
      apiKey: VOCML_API_KEY,
      storeName: 'POS Mart Swalayan',
      appVersion: '1.0.0',
    });

    licenseState = {
      ...lisensi,
      lockReason: lisensi.lockReason || (lisensi.status === 'locked' ? (lisensi.reason || 'Aplikasi dikunci') : ''),
    };

    if (!lisensi.allowed) {
      console.log(`[License] AKSES DITOLAK: ${lisensi.status} - ${lisensi.reason}`);
      if (lisensi.billing) {
        console.log(`[License] Tagihan QRIS aktif: ${lisensi.billing.amount_text} (${lisensi.billing.merchant_name})`);
      }
    } else {
      console.log(`[License] AKSES DIIZINKAN. Status: ${lisensi.status} (Berlaku s/d: ${lisensi.expiresAt})`);
    }

    broadcastLicense(licenseState);
  } catch (err) {
    console.error('[License] Error saat verifikasi lisensi:', err?.message || err);
  }

  // Jadwalkan pengecekan berikutnya
  if (checkTimer) clearTimeout(checkTimer);

  if (process.argv.some(arg => arg.includes('vite') && arg.includes('build'))) {
    return licenseState;
  }

  // Cek setiap 5 detik agar pembaruan admin VOCML (termasuk lock/unlock) langsung berlaku cepat
  const nextInterval = 5000;
  checkTimer = setTimeout(verifikasiAplikasi, nextInterval);
  if (checkTimer?.unref) checkTimer.unref();

  return licenseState;
}

/** Ambil pesan siaran dinamis (Dynamic Island) dari VOCML */
export async function fetchMessagesFromVocml() {
  const machineId = getMachineId();
  try {
    const qs = new URLSearchParams({ machine_id: machineId, product: VOCML_PRODUCT });
    const headers = { ...(VOCML_API_KEY ? { 'X-VOCML-Key': VOCML_API_KEY } : {}) };
    const res = await fetch(`${VOCML_SERVER_URL}/api/v1/messages?${qs}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data.messages) ? data.messages : (Array.isArray(data) ? data : []);
      messagesState = rawList.map(m => ({
        id: m.id,
        judul: m.title || m.judul || '',
        pesan: m.message || m.pesan || '',
        tipe: String(m.type || m.tipe || 'INFO').toUpperCase(),
        intervalMenit: Number(m.interval_minutes ?? m.intervalMenit ?? 0),
        durasiDetik: Number(m.display_seconds ?? m.durasiDetik ?? 15),
        versi: m.updated_at || m.versi || '',
      }));
      broadcastMessages(messagesState);
    }
  } catch (err) {
    // Abaikan jika offline / gagal terhubung
  }

  if (messagesTimer) clearTimeout(messagesTimer);
  if (!process.argv.some(arg => arg.includes('vite') && arg.includes('build'))) {
    messagesTimer = setTimeout(fetchMessagesFromVocml, 5000);
    if (messagesTimer?.unref) messagesTimer.unref();
  }
}

// Mulai verifikasi dan fetching pesan saat server start (kecuali saat vite build)
if (!process.argv.some(arg => arg.includes('vite') && arg.includes('build'))) {
  verifikasiAplikasi();
  fetchMessagesFromVocml();
}

/**
 * Proxy gambar PNG QRIS:
 * 1) Ambil billing.qris_image_url dari VOCML (dengan X-VOCML-Key bila ada)
 * 2) Fallback: render sendiri dari billing.qris menggunakan qrcode
 */
export async function getBillingQrisPng(size = 512) {
  const billing = licenseState.billing;
  if (!billing) return null;

  const px = Math.min(1024, Math.max(240, Math.round(size) || 512));

  // Opsi 1: Tarik dari server VOCML
  if (billing.qris_image_url) {
    try {
      const url = new URL(billing.qris_image_url);
      if (!url.searchParams.has('size')) url.searchParams.set('size', String(px));
      const res = await fetch(url.toString(), {
        headers: VOCML_API_KEY ? { 'X-VOCML-Key': VOCML_API_KEY } : {},
        signal: AbortSignal.timeout(7000),
      });
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.includes('image/png')) {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch (err) {
      console.warn('[License] Gagal mengambil QRIS dari VOCML server:', err?.message || err);
    }
  }

  // Opsi 2: Fallback render lokal via modul `qrcode`
  if (billing.qris) {
    try {
      return await QRCode.toBuffer(billing.qris, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 2,
        width: px,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (err) {
      console.error('[License] Gagal render QRIS offline:', err?.message || err);
    }
  }

  return null;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

/** Middleware lisensi untuk Vite Dev Server dan Production Server */
export function licenseMiddleware() {
  return async (req, res, next) => {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;

    // 1. Endpoint snapshot status lisensi (kompatibilitas POS_Mart & BilliardVOC)
    if (pathname === '/api/license-status' || pathname === '/api/license/status') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(licenseState));
      return;
    }

    // 2. Endpoint info tagihan QRIS
    if (pathname === '/api/license/billing') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        status: licenseState.status,
        billing: licenseState.billing || null,
      }));
      return;
    }

    // 3. Endpoint proxy gambar QRIS PNG (Cache-Control: no-store)
    if (pathname === '/api/license/billing/qris.png') {
      const size = parseInt(parsedUrl.searchParams.get('size') || '512', 10);
      const pngBuffer = await getBillingQrisPng(size);
      if (pngBuffer) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(pngBuffer);
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'no_billing' }));
      return;
    }

    // 4. Endpoint daftar pesan siaran broadcast (/api/license/messages)
    if (pathname === '/api/license/messages') {
      if (parsedUrl.searchParams.get('refresh') === 'true') {
        await fetchMessagesFromVocml();
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(messagesState));
      return;
    }

    // 5. Endpoint SSE Real-time stream (/api/license/stream)
    if (pathname === '/api/license/stream') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Kirim initial state ke client yang baru terhubung
      res.write(`event: license\ndata: ${JSON.stringify(licenseState)}\n\n`);
      res.write(`event: messages\ndata: ${JSON.stringify(messagesState)}\n\n`);
      res.write(`data: ${JSON.stringify(messagesState)}\n\n`);

      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // 6. Endpoint aktivasi manual via POST /api/license/activate
    if (pathname === '/api/license/activate' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const key = body.licenseKey || body.key || '';
      try {
        const result = await activateLicense({
          serverUrl: VOCML_SERVER_URL,
          product: VOCML_PRODUCT,
          machineId: getMachineId(),
          licenseKey: key,
          publicKeyPem: PUBLIC_KEY,
          cacheFile: CACHE_FILE,
          apiKey: VOCML_API_KEY,
        });
        licenseState = {
          ...result,
          lockReason: result.lockReason || '',
        };
        broadcastLicense(licenseState);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, ...licenseState }));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err?.message || 'Aktivasi gagal' }));
      }
      return;
    }

    // 7. Endpoint cek ulang lisensi manual via POST /api/license/check
    if (pathname === '/api/license/check' && req.method === 'POST') {
      const updated = await verifikasiAplikasi();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(updated));
      return;
    }

    // 8. Proteksi akses: jika lisensi diizinkan, teruskan ke middleware berikutnya
    if (licenseState.allowed) {
      return next();
    }

    // 9. Jika lisensi TIDAK diizinkan:
    // Jika request ke data API (/api/saas/*, /api/push/*), blokir dengan HTTP 403
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/license')) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'license_locked',
        status: licenseState.status,
        reason: licenseState.reason,
        billing: licenseState.billing || null,
      }));
      return;
    }

    // Untuk request halaman atau aset frontend, izinkan React SPA dimuat
    // sehingga komponen <LicenseLockScreen /> dapat menampilkan UI modern dengan SSE & QRIS
    return next();
  };
}
