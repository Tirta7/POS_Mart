// VOC ML client SDK untuk aplikasi Billiard / Kasir POS (Node.js >= 18, tanpa dependency).
//
// Aturan Lisensi (Koreksi Masa Aktif & Tagihan QRIS):
// 1. Setiap respons sukses dari server menjadi sumber kebenaran tunggal:
//    selalu timpa data lisensi lokal (license_key, expires_at, status, locked, lock_reason, days_left, billing).
// 2. Status locked / expired dari server langsung memblokir aplikasi.
// 3. Field billing dibawa saat locked / expired dan dibersihkan saat lisensi aktif kembali.

import crypto from 'node:crypto';
import fs from 'node:fs';

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRODUCT_CODES = { billiard: 1, pos: 2 };

function b32decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('bad char');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const dayToDate = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Verifikasi License Key secara offline. */
export function verifyLicenseKey(key, machineId, product, publicKeyPem) {
  try {
    const raw = String(key || '').toUpperCase().replace(/^VOCML-/, '').replace(/[^A-Z0-9]/g, '');
    const buf = b32decode(raw);
    if (buf.length < 78) return { valid: false, reason: 'Format key tidak valid' };
    const payload = buf.subarray(0, 14);
    const sig = buf.subarray(14, 78);
    if (!crypto.verify(null, payload, crypto.createPublicKey(publicKeyPem), sig)) {
      return { valid: false, reason: 'Tanda tangan key tidak valid' };
    }
    const midHash = crypto.createHash('sha256').update(String(machineId).trim().toUpperCase()).digest().subarray(0, 8);
    if (!midHash.equals(payload.subarray(6, 14))) return { valid: false, reason: 'Key bukan untuk komputer ini' };
    if (payload[1] !== PRODUCT_CODES[product]) return { valid: false, reason: 'Key bukan untuk aplikasi ini' };
    const expiresAt = dayToDate(payload.readUInt16BE(2));
    return { valid: true, expiresAt, expired: expiresAt < todayStr() };
  } catch {
    return { valid: false, reason: 'Format key tidak valid' };
  }
}

/** Verifikasi token status dari server. Mengembalikan payload atau null. */
export function verifyToken(token, publicKeyPem) {
  try {
    const [data, sig] = String(token).split('.');
    const ok = crypto.verify(null, Buffer.from(data), crypto.createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url'));
    return ok ? JSON.parse(Buffer.from(data, 'base64url').toString()) : null;
  } catch {
    return null;
  }
}

function readCache(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeCache(file, data) {
  try {
    const dir = fs.existsSync(file) ? null : fs.mkdirSync(file.substring(0, file.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch { /* abaikan */ }
}

const ALLOWED = new Set(['active', 'expiring']);

/** Pengecekan lisensi utama (checkLicense). */
export async function checkLicense({
  serverUrl,
  product,
  machineId,
  publicKeyPem,
  cacheFile,
  apiKey = '',
  storeName = '',
  appVersion = '',
  timeoutMs = 8000
}) {
  const base = serverUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...(apiKey ? { 'X-VOCML-Key': apiKey } : {}) };
  const normalizedMid = String(machineId).trim().toUpperCase();
  const result = (allowed, status, extra = {}) => ({ allowed, status, machineId: normalizedMid, ...extra });

  try {
    const qs = new URLSearchParams({ machine_id: normalizedMid, product, app_version: appVersion });
    let res = await fetch(`${base}/api/v1/check?${qs}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) {
      // Belum terdaftar -> daftarkan, akan muncul di "Machine ID Masuk"
      res = await fetch(`${base}/api/v1/register`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ machine_id: normalizedMid, product, store_name: storeName, app_version: appVersion }),
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const payload = verifyToken(body.token, publicKeyPem);
    if (!payload || payload.machine_id !== normalizedMid) throw new Error('Token server tidak valid');

    // BAGIAN A & B: Key dari server SELALU menimpa key lokal (koreksi masa aktif)
    // Simpan billing terakhir bersama snapshot status lisensi. Jika /check sukses dan billing = null, hapus tagihan lokal.
    const billing = body.billing || null;
    writeCache(cacheFile, {
      token: body.token,
      checkedAt: Date.now(),
      billing: billing,
      license_key: payload.license_key || body.license_key || null,
      status: payload.status,
      expires_at: payload.expires_at,
      locked: payload.locked ?? (payload.status === 'locked'),
      lock_reason: payload.lock_reason || '',
      days_left: payload.days_left ?? null,
      grace_days: payload.grace_days ?? body.grace_days ?? 5,
    });

    const isLocked = payload.status === 'locked' || payload.locked === true;
    const isExpired = payload.status === 'expired';

    if (isLocked) {
      return result(false, 'locked', {
        reason: payload.lock_reason || 'Aplikasi dikunci',
        lockReason: payload.lock_reason || '',
        expiresAt: payload.expires_at,
        daysLeft: payload.days_left ?? 0,
        billing: billing,
        licenseKey: payload.license_key,
      });
    }

    if (payload.status === 'pending') {
      return result(false, 'pending', {
        reason: 'Menunggu aktivasi lisensi',
        billing: billing,
      });
    }

    if (isExpired) {
      return result(false, 'expired', {
        reason: 'Masa lisensi telah berakhir',
        expiresAt: payload.expires_at,
        daysLeft: payload.days_left ?? 0,
        billing: billing,
        licenseKey: payload.license_key,
      });
    }

    const isAllowed = ALLOWED.has(payload.status);
    return result(isAllowed, payload.status, {
      expiresAt: payload.expires_at,
      daysLeft: payload.days_left ?? null,
      licenseKey: payload.license_key,
      lockReason: '',
      // Jangan tampilkan QRIS saat status aktif / segera berakhir
      billing: null,
    });
  } catch (err) {
    // Offline: pakai snapshot terakhir + grace_days
    const cache = readCache(cacheFile);
    const payload = cache && verifyToken(cache.token, publicKeyPem);
    if (!payload || payload.machine_id !== normalizedMid) {
      return result(false, 'offline', {
        reason: 'Tidak dapat terhubung ke server lisensi',
        offline: true,
        billing: null,
      });
    }

    // Aturan 3: Jika status dari server "expired" atau "locked", langsung tampilkan layar terkunci walaupun key lama masih ada
    if (payload.status === 'locked') {
      return result(false, 'locked', {
        reason: payload.lock_reason || 'Aplikasi dikunci',
        lockReason: payload.lock_reason || '',
        expiresAt: payload.expires_at,
        daysLeft: payload.days_left ?? 0,
        billing: cache.billing || null,
        offline: true,
      });
    }

    if (payload.status === 'expired') {
      return result(false, 'expired', {
        reason: 'Masa lisensi telah berakhir',
        expiresAt: payload.expires_at,
        daysLeft: payload.days_left ?? 0,
        billing: cache.billing || null,
        offline: true,
      });
    }

    const graceDays = payload.grace_days ?? cache.grace_days ?? 5;
    const graceMs = graceDays * 86400000;
    const withinGrace = Date.now() - (cache.checkedAt || 0) <= graceMs && (cache.checkedAt || 0) <= Date.now();
    const key = payload.license_key ? verifyLicenseKey(payload.license_key, normalizedMid, product, publicKeyPem) : { valid: false };

    if (ALLOWED.has(payload.status) && withinGrace && key.valid && !key.expired) {
      return result(true, payload.status, {
        expiresAt: payload.expires_at || key.expiresAt,
        daysLeft: payload.days_left,
        licenseKey: payload.license_key,
        offline: true,
        billing: null,
      });
    }

    return result(false, 'offline', {
      reason: 'Tidak terhubung ke server lisensi dan masa toleransi offline habis',
      offline: true,
      expiresAt: payload.expires_at,
      billing: cache.billing || null,
    });
  }
}

/** Aktivasi License Key secara online (POST /api/v1/activate). */
export async function activateLicense({
  serverUrl,
  product,
  machineId,
  licenseKey,
  publicKeyPem,
  cacheFile,
  apiKey = '',
  timeoutMs = 8000
}) {
  const base = serverUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...(apiKey ? { 'X-VOCML-Key': apiKey } : {}) };
  const normalizedMid = String(machineId).trim().toUpperCase();

  const res = await fetch(`${base}/api/v1/activate`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      machine_id: normalizedMid,
      product,
      license_key: String(licenseKey).trim(),
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || body.message || `Aktivasi gagal (HTTP ${res.status})`);
  }

  const payload = verifyToken(body.token, publicKeyPem);
  if (!payload || payload.machine_id !== normalizedMid) {
    throw new Error('Token respons aktivasi tidak valid');
  }

  const billing = body.billing || null;
  writeCache(cacheFile, {
    token: body.token,
    checkedAt: Date.now(),
    billing: billing,
    license_key: payload.license_key || body.license_key || null,
    status: payload.status,
    expires_at: payload.expires_at,
    locked: payload.locked ?? (payload.status === 'locked'),
    lock_reason: payload.lock_reason || '',
    days_left: payload.days_left ?? null,
    grace_days: payload.grace_days ?? body.grace_days ?? 5,
  });

  const isAllowed = ALLOWED.has(payload.status);
  return {
    allowed: isAllowed,
    status: payload.status,
    machineId: normalizedMid,
    expiresAt: payload.expires_at,
    daysLeft: payload.days_left ?? null,
    licenseKey: payload.license_key,
    lockReason: payload.lock_reason || '',
    billing: isAllowed ? null : billing,
  };
}
