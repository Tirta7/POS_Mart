// =============================================================================
// Push API — Web Push Notification (VAPID) untuk notifikasi "Uang Masuk".
//
// Endpoint (semua di bawah /api/push):
//   GET  /api/push/public-key   → { publicKey }            (VAPID public key)
//   POST /api/push/subscribe    → body: PushSubscription   (daftarkan device)
//   POST /api/push/unsubscribe  → body: { endpoint }       (hapus device)
//   POST /api/push/notify       → body: { title, body, tag?, url? } (kirim ke semua device)
//
// Data disimpan di server/data/ (vapid.json & subscriptions.json).
// Middleware ini dipakai oleh plugin Vite (dev & preview) — lihat vite.config.ts —
// dan juga oleh server/push-server.mjs untuk mode produksi.
// =============================================================================
import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/** VAPID keys dibuat otomatis sekali, lalu dipakai terus (jangan dihapus, device harus subscribe ulang). */
function loadVapidKeys() {
  let keys = readJson(VAPID_FILE, null);
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    writeJson(VAPID_FILE, keys);
    console.log('[push] VAPID keys baru dibuat →', VAPID_FILE);
  }
  return keys;
}

const vapid = loadVapidKeys();
// PENTING: Apple (web.push.apple.com) menolak JWT dengan 403 "BadJwtToken" jika subject
// memakai domain non-publik (mis. mailto:x@domain.local / localhost). Pakai URL https
// atau email dengan domain publik. Bisa diganti via env VAPID_SUBJECT.
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'https://github.com/Tirta7/POS_Mart',
  vapid.publicKey,
  vapid.privateKey,
);

const loadSubs = () => readJson(SUBS_FILE, []);
const saveSubs = (subs) => writeJson(SUBS_FILE, subs);

class BadRequest extends Error {}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooLarge = false;
    req.on('data', (c) => {
      if (tooLarge) return;
      raw += c;
      if (raw.length > 100_000) { tooLarge = true; reject(new BadRequest('Body terlalu besar')); }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const data = raw ? JSON.parse(raw) : {};
        if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error();
        resolve(data);
      } catch {
        reject(new BadRequest('JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

const isHttpsUrl = (s) => {
  try { return new URL(s).protocol === 'https:'; } catch { return false; }
};

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function broadcast(payload) {
  const subs = loadSubs();
  const json = JSON.stringify(payload);
  const alive = [];
  let sent = 0;

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, json, { TTL: 60 * 60, urgency: 'high', timeout: 10_000 });
      alive.push(sub);
      sent++;
    } catch (err) {
      // 404/410 = subscription kadaluarsa / device sudah unsubscribe → buang.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        console.log('[push] subscription kadaluarsa dihapus');
      } else {
        console.warn('[push] gagal kirim:', err?.statusCode, err?.body || err?.message);
        alive.push(sub);
      }
    }
  }));

  if (alive.length !== subs.length) saveSubs(alive);
  return { sent, total: subs.length };
}

/** Connect-style middleware: (req, res, next) */
export function pushApiMiddleware() {
  return async (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/api/push/')) return next();

    try {
      if (req.method === 'GET' && url === '/api/push/public-key') {
        return send(res, 200, { publicKey: vapid.publicKey });
      }

      if (req.method === 'POST' && url === '/api/push/subscribe') {
        const sub = await readBody(req);
        if (typeof sub.endpoint !== 'string' || !isHttpsUrl(sub.endpoint) ||
            typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') {
          return send(res, 400, { error: 'Subscription tidak valid' });
        }
        const subs = loadSubs().filter((s) => s.endpoint !== sub.endpoint);
        subs.push({ endpoint: sub.endpoint, keys: sub.keys });
        saveSubs(subs);
        return send(res, 200, { ok: true, total: subs.length });
      }

      if (req.method === 'POST' && url === '/api/push/unsubscribe') {
        const { endpoint } = await readBody(req);
        if (typeof endpoint !== 'string' || !endpoint) return send(res, 400, { error: 'endpoint wajib diisi' });
        const subs = loadSubs().filter((s) => s.endpoint !== endpoint);
        saveSubs(subs);
        return send(res, 200, { ok: true, total: subs.length });
      }

      if (req.method === 'POST' && url === '/api/push/notify') {
        const { title, body, tag, url: openUrl } = await readBody(req);
        if (typeof title !== 'string' || !title.trim()) return send(res, 400, { error: 'title wajib diisi' });
        const result = await broadcast({
          title: title.slice(0, 120),
          body: typeof body === 'string' ? body.slice(0, 500) : '',
          tag: typeof tag === 'string' ? tag : undefined,
          url: typeof openUrl === 'string' && openUrl.startsWith('/') ? openUrl : '/',
        });
        return send(res, 200, { ok: true, ...result });
      }

      return send(res, 404, { error: 'Endpoint tidak ditemukan' });
    } catch (err) {
      if (err instanceof BadRequest) return send(res, 400, { error: err.message });
      console.error('[push] error:', err);
      return send(res, 500, { error: 'Server error' });
    }
  };
}
