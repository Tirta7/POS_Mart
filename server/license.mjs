import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { checkLicense, activateLicense, verifyLicenseKey, saveOfflineKey, isNetworkError } from './vocml-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_VITE_BUILD = process.argv.some(arg => arg.includes('vite')) && process.argv.includes('build');

// 1. Konfigurasi VOCML
const VOCML_SERVER_URL = process.env.VOCML_SERVER_URL || 'https://vocml.vocpos.id';
const VOCML_PRODUCT = process.env.VOCML_PRODUCT || 'pos';
const VOCML_API_KEY = process.env.VOCML_API_KEY || '';
const CACHE_FILE = path.join(__dirname, 'data', 'license-cache.json');
const OFFLINE_FILE = path.join(__dirname, 'data', 'license-offline.json');

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
let lastLoggedStatus = null;
let verifyInFlight = null;
let lastLockedSnapshot = null;

function toWibDayIndex(isoOrYmd) {
  if (!isoOrYmd) return null;
  const raw = String(isoOrYmd).trim();
  let ymd = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    ymd = raw;
  } else {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  }
  const ms = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}

function buildCanonicalUnlockReceipt(nextLicense, { manualActivation = false } = {}) {
  const prevSnap = lastLockedSnapshot;
  const prevBilling = prevSnap?.billing || null;
  const packages = Array.isArray(prevBilling?.packages) ? prevBilling.packages : [];

  const now = new Date();
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).replace(/-/g, '');
  const hm = now.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/\D/g, '');
  const mid = String(nextLicense.machineId || 'POS').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || '0001';
  const paidAtText = now.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/\./g, ':');

  // 1. Jika server VOCML langsung mengirimkan metadata pembayaran terakhir
  const serverPayment = nextLicense.lastPayment && typeof nextLicense.lastPayment === 'object'
    ? nextLicense.lastPayment
    : null;

  const todayDay = toWibDayIndex(now.toISOString());
  const prevExpDay = toWibDayIndex(prevSnap?.expiresAt);
  const newExpDay = toWibDayIndex(nextLicense.expiresAt);
  const baseDay = (prevExpDay !== null && todayDay !== null && prevExpDay > todayDay) ? prevExpDay : todayDay;
  const addedDays = (newExpDay !== null && baseDay !== null)
    ? Math.max(0, newExpDay - baseDay)
    : Math.max(0, Number(nextLicense.daysLeft) || 0);

  let matchedPkg = null;
  if (!manualActivation && packages.length > 0) {
    if (serverPayment?.package_id) {
      matchedPkg = packages.find(p => p.id === serverPayment.package_id) || null;
    } else if (serverPayment?.amount && Number(serverPayment.amount) > 0) {
      matchedPkg = packages.find(p => Number(p.final_amount ?? p.amount) === Number(serverPayment.amount)) || null;
    } else if (serverPayment?.days && Number(serverPayment.days) > 0) {
      matchedPkg = packages.find(p => Number(p.days) === Number(serverPayment.days)) || null;
    } else if (addedDays > 0) {
      let bestDiff = Infinity;
      for (const p of packages) {
        const diff = Math.abs(Number(p.days) - addedDays);
        if (diff <= 1 && diff < bestDiff) {
          bestDiff = diff;
          matchedPkg = p;
        }
      }
    }
  }

  const amountNumber = manualActivation
    ? 0
    : matchedPkg
    ? Number(matchedPkg.final_amount ?? matchedPkg.amount)
    : Number(serverPayment?.final_amount ?? serverPayment?.amount ?? 0);

  const amountText = manualActivation
    ? ''
    : matchedPkg?.amount_text ||
      serverPayment?.amount_text ||
      (amountNumber > 0 ? `Rp${Math.round(amountNumber).toLocaleString('id-ID')}` : '');

  const uniqueCode = manualActivation
    ? 0
    : Number(matchedPkg?.unique_code ?? serverPayment?.unique_code ?? (amountNumber > 0 ? prevBilling?.unique_code : 0) ?? 0);

  const packageLabel =
    matchedPkg?.label ||
    serverPayment?.label ||
    (addedDays > 0
      ? `${addedDays} Hari`
      : nextLicense.daysLeft != null
      ? `${nextLicense.daysLeft} Hari`
      : 'Aktivasi Lisensi');

  return {
    invoiceNumber: serverPayment?.invoice_number || `INV/VOCML/${ymd}/${mid}-${hm}`,
    method: manualActivation ? 'manual' : (amountNumber > 0 ? 'qris' : 'admin'),
    paidAt: paidAtText,
    addedDays,
    packageId: matchedPkg?.id || serverPayment?.package_id || null,
    packageLabel,
    amountNumber,
    amountText,
    uniqueCode,
    merchantName: prevBilling?.merchant_name || 'VIRTUAL OPERATION CONTROL',
    adminContact: prevBilling?.contact || '',
  };
}

function applyServerLicenseState(nextLisensi, { manualActivation = false } = {}) {
  const prevWasLocked = licenseState.allowed === false;
  let unlockReceipt = licenseState.unlockReceipt || null;

  if (!nextLisensi.allowed) {
    unlockReceipt = null;
    lastLockedSnapshot = {
      expiresAt: nextLisensi.expiresAt || null,
      daysLeft: nextLisensi.daysLeft ?? null,
      billing: nextLisensi.billing || lastLockedSnapshot?.billing || null,
    };
  } else if (prevWasLocked) {
    unlockReceipt = buildCanonicalUnlockReceipt(nextLisensi, { manualActivation });
    lastLockedSnapshot = null;
  }

  licenseState = {
    ...nextLisensi,
    lockReason: nextLisensi.lockReason || (nextLisensi.status === 'locked' ? (nextLisensi.reason || 'Aplikasi dikunci') : ''),
    unlockReceipt: nextLisensi.allowed ? unlockReceipt : null,
  };
  return licenseState;
}

/** Verifikasi lisensi ke VOCML atau offline cache */
export async function verifikasiAplikasi() {
  if (verifyInFlight) return verifyInFlight;

  verifyInFlight = (async () => {
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
        offlineFile: OFFLINE_FILE,
        apiKey: VOCML_API_KEY,
        storeName: 'POS Mart Swalayan',
        appVersion: '1.0.0',
      });

      applyServerLicenseState(lisensi);

      if (!lisensi.allowed) {
        if (lastLoggedStatus !== 'denied_' + lisensi.status) {
          lastLoggedStatus = 'denied_' + lisensi.status;
          console.log(`[License] AKSES DITOLAK: ${lisensi.status} - ${lisensi.reason}`);
          if (lisensi.billing) {
            console.log(`[License] Tagihan QRIS aktif: ${lisensi.billing.amount_text} (${lisensi.billing.merchant_name})`);
          }
        }
      } else {
        if (lastLoggedStatus !== 'allowed_' + lisensi.status) {
          lastLoggedStatus = 'allowed_' + lisensi.status;
          console.log(`[License] AKSES DIIZINKAN. Status: ${lisensi.status} (Berlaku s/d: ${lisensi.expiresAt})`);
        }
      }

      broadcastLicense(licenseState);
    } catch (err) {
      console.error('[License] Error saat verifikasi lisensi:', err?.message || err);
    }

    // Jadwalkan pengecekan berikutnya
    if (checkTimer) clearTimeout(checkTimer);

    if (IS_VITE_BUILD) {
      return licenseState;
    }

    // Cek setiap 5 detik (aktif) atau 4 detik (terkunci) agar perubahan dari VOCML maupun QRIS langsung real-time
    const nextInterval = licenseState?.allowed ? 5000 : 4000;
    checkTimer = setTimeout(() => { verifikasiAplikasi(); }, nextInterval);
    if (checkTimer?.unref) checkTimer.unref();

    return licenseState;
  })();

  try {
    return await verifyInFlight;
  } finally {
    verifyInFlight = null;
  }
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
  if (!IS_VITE_BUILD) {
    messagesTimer = setTimeout(fetchMessagesFromVocml, 5000);
    if (messagesTimer?.unref) messagesTimer.unref();
  }
}

// Mulai verifikasi dan fetching pesan saat server start (kecuali saat vite build)
if (!IS_VITE_BUILD) {
  verifikasiAplikasi();
  fetchMessagesFromVocml();
}

function crc16Ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function patchQrisAmount(qrisString, amount) {
  if (!qrisString || !Number.isFinite(amount) || amount <= 0) return qrisString;
  const amtStr = String(Math.round(amount));
  const amtTag = `54${String(amtStr.length).padStart(2, '0')}${amtStr}`;
  const tags = [];
  let pos = 0;
  while (pos + 4 <= qrisString.length) {
    const id = qrisString.slice(pos, pos + 2);
    const len = parseInt(qrisString.slice(pos + 2, pos + 4), 10);
    if (!Number.isFinite(len) || pos + 4 + len > qrisString.length) return qrisString;
    if (id !== '63') tags.push({ id, raw: qrisString.slice(pos, pos + 4 + len) });
    pos += 4 + len;
  }
  if (pos !== qrisString.length) return qrisString;

  let replaced = false;
  const rebuilt = [];
  for (const t of tags) {
    if (t.id === '54') {
      rebuilt.push(amtTag);
      replaced = true;
    } else {
      if (!replaced && Number(t.id) > 54) {
        rebuilt.push(amtTag);
        replaced = true;
      }
      rebuilt.push(t.raw);
    }
  }
  if (!replaced) rebuilt.push(amtTag);
  const body = `${rebuilt.join('')}6304`;
  return `${body}${crc16Ccitt(body)}`;
}

/**
 * Proxy gambar PNG QRIS:
 * 1) Ambil qris_image_url sesuai paket/nominal terpilih dari VOCML (dengan X-VOCML-Key bila ada)
 * 2) Fallback: render sendiri dari QRIS string menggunakan qrcode (dengan nominal disesuaikan jika perlu)
 */
export async function getBillingQrisPng(size = 512, requestedAmount = null, packageId = null) {
  const billing = licenseState.billing;
  if (!billing) return null;

  const px = Math.min(1024, Math.max(240, Math.round(size) || 512));
  const packages = Array.isArray(billing.packages) ? billing.packages : [];
  const matchedPkg =
    (packageId ? packages.find(p => p.id === packageId) : null) ||
    (requestedAmount ? packages.find(p => Number(p.final_amount ?? p.amount) === Number(requestedAmount)) : null) ||
    null;

  const targetAmount = matchedPkg
    ? Number(matchedPkg.final_amount ?? matchedPkg.amount)
    : (requestedAmount && Number(requestedAmount) > 0 ? Number(requestedAmount) : Number(billing.amount));

  // Opsi 1: Tarik dari server VOCML sesuai paket/nominal
  const rawImageUrl = matchedPkg?.qris_image_url || billing.qris_image_url;
  if (rawImageUrl) {
    try {
      const url = new URL(rawImageUrl);
      if (!matchedPkg && targetAmount > 0) {
        url.searchParams.set('amount', String(Math.round(targetAmount)));
      }
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
  const qrisPayload = matchedPkg?.qris
    ? matchedPkg.qris
    : (billing.qris && targetAmount > 0 && targetAmount !== Number(billing.amount)
      ? patchQrisAmount(billing.qris, targetAmount)
      : billing.qris);

  if (qrisPayload) {
    try {
      return await QRCode.toBuffer(qrisPayload, {
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
      const amountParam = parsedUrl.searchParams.get('amount');
      const requestedAmount = amountParam ? Number(amountParam) : null;
      const packageId = parsedUrl.searchParams.get('package_id') || null;
      const pngBuffer = await getBillingQrisPng(size, requestedAmount, packageId);
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
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      // Kirim initial state ke client yang baru terhubung
      res.write(`event: license\ndata: ${JSON.stringify(licenseState)}\n\n`);
      res.write(`event: messages\ndata: ${JSON.stringify(messagesState)}\n\n`);
      res.write(`data: ${JSON.stringify(messagesState)}\n\n`);

      sseClients.add(res);
      const cleanup = () => { sseClients.delete(res); };
      req.on('close', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
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
        applyServerLicenseState(result, { manualActivation: true });
        broadcastLicense(licenseState);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, ...licenseState }));
      } catch (err) {
        // Server VOCML mati / tidak terjangkau -> verifikasi key secara offline (tanda tangan + Machine ID)
        if (isNetworkError(err)) {
          const mid = getMachineId();
          const v = verifyLicenseKey(key, mid, VOCML_PRODUCT, PUBLIC_KEY);
          if (v.valid && !v.expired) {
            saveOfflineKey(OFFLINE_FILE, key);
            applyServerLicenseState({
              allowed: true,
              status: 'active',
              reason: 'Aktivasi offline (server lisensi tidak terjangkau)',
              machineId: mid,
              expiresAt: v.expiresAt,
              daysLeft: Math.ceil((new Date(v.expiresAt).getTime() - Date.now()) / 86400000),
              licenseKey: String(key).trim(),
              lockReason: '',
              billing: null,
              offline: true,
            }, { manualActivation: true });
            broadcastLicense(licenseState);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, offlineActivation: true, ...licenseState }));
            return;
          }
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: v.valid ? 'License key sudah kedaluwarsa' : (v.reason || 'License key tidak valid') }));
          return;
        }
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
      res.setHeader('Cache-Control', 'no-store');
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
