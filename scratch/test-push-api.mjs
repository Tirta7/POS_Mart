// Endpoint test suite untuk Web Push API.
// Jalankan: node scratch/test-push-api.mjs   (Vite dev server harus berjalan di https://localhost:5173)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // sertifikat self-signed (dev only)

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.env.LIVE_URL || 'https://localhost:5173';
const SUBS_FILE = path.join(ROOT, 'server', 'data', 'subscriptions.json');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};
const b64u = (buf) => Buffer.from(buf).toString('base64url');

async function req(base, method, p, body, raw) {
  const res = await fetch(base + p, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, type: res.headers.get('content-type') || '' };
}

// ---------------------------------------------------------------------------
// Bagian A — kontrak HTTP pada dev server yang sedang berjalan
// ---------------------------------------------------------------------------
async function partA(base, label) {
  console.log(`\n[A] Kontrak endpoint — ${label} (${base})`);
  const fakeEp = 'https://127.0.0.1:9/contract-test-' + Date.now();

  let r = await req(base, 'GET', '/api/push/public-key');
  check('GET public-key → 200', r.status === 200, r.status);
  const pk = r.json?.publicKey;
  check('public-key = P-256 uncompressed (65 byte)', pk && Buffer.from(pk, 'base64url').length === 65 && Buffer.from(pk, 'base64url')[0] === 4);

  r = await req(base, 'POST', '/api/push/subscribe', { endpoint: fakeEp });
  check('subscribe tanpa keys → 400', r.status === 400, r.status);
  r = await req(base, 'POST', '/api/push/subscribe', { endpoint: 'http://insecure/x', keys: { p256dh: 'a', auth: 'b' } });
  check('subscribe endpoint non-HTTPS → 400', r.status === 400, r.status);
  r = await req(base, 'POST', '/api/push/subscribe', undefined, '{bad json');
  check('subscribe JSON rusak → 400', r.status === 400, r.status);
  r = await req(base, 'POST', '/api/push/subscribe', undefined, '[1,2]');
  check('subscribe body array → 400', r.status === 400, r.status);
  r = await req(base, 'POST', '/api/push/subscribe', undefined, JSON.stringify({ x: 'a'.repeat(200_000) }));
  check('subscribe body > 100KB → 400', r.status === 400, r.status);

  const sub = { endpoint: fakeEp, keys: { p256dh: 'test', auth: 'test' } };
  r = await req(base, 'POST', '/api/push/subscribe', sub);
  check('subscribe valid → 200', r.status === 200 && r.json?.ok, r.status);
  const t1 = r.json?.total;
  r = await req(base, 'POST', '/api/push/subscribe', sub);
  check('subscribe duplikat tidak menambah device', r.json?.total === t1, `${t1} → ${r.json?.total}`);

  r = await req(base, 'POST', '/api/push/unsubscribe', {});
  check('unsubscribe tanpa endpoint → 400', r.status === 400, r.status);
  r = await req(base, 'POST', '/api/push/unsubscribe', { endpoint: fakeEp });
  check('unsubscribe → 200 & total berkurang', r.status === 200 && r.json?.total === t1 - 1, JSON.stringify(r.json));

  r = await req(base, 'POST', '/api/push/notify', { body: 'tanpa judul' });
  check('notify tanpa title → 400', r.status === 400, r.status);
  r = await req(base, 'POST', '/api/push/notify', { title: '   ' });
  check('notify title kosong → 400', r.status === 400, r.status);
  r = await req(base, 'POST', '/api/push/notify', { title: 'Uang Masuk', body: 'CASH Rp180.000\nCustomer: Andi\nKasir: Bagas' });
  check('notify valid → 200 {ok,sent,total}', r.status === 200 && r.json?.ok && typeof r.json.sent === 'number' && typeof r.json.total === 'number', JSON.stringify(r.json));

  r = await req(base, 'GET', '/api/push/notify');
  check('GET pada endpoint POST → 404', r.status === 404, r.status);
  r = await req(base, 'GET', '/api/push/tidak-ada');
  check('endpoint tidak dikenal → 404 JSON', r.status === 404 && r.type.includes('json'), r.status);

  r = await req(base, 'GET', '/');
  check('halaman aplikasi tetap tersaji (GET /)', r.status === 200 && r.type.includes('html'), r.status);
  r = await req(base, 'GET', '/sw.js');
  check('service worker tersaji (GET /sw.js)', r.status === 200 && r.type.includes('javascript') && r.text.includes("addEventListener('push'"), r.type);
  r = await req(base, 'GET', '/manifest.webmanifest');
  check('manifest tersaji', r.status === 200 && r.text.includes('standalone'), r.status);
  return pk;
}

// ---------------------------------------------------------------------------
// Bagian B — pengiriman push end-to-end + dekripsi payload (RFC 8291 aes128gcm)
// ---------------------------------------------------------------------------
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }

function decryptAes128gcm(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const uaPublic = uaEcdh.getPublicKey();
  const ecdhSecret = uaEcdh.computeSecret(asPublic);

  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  let plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('padding delimiter salah');
  return plain.subarray(0, end).toString('utf8');
}

async function partB() {
  console.log('\n[B] Pengiriman push end-to-end (fake push service + dekripsi)');
  const backup = fs.existsSync(SUBS_FILE) ? fs.readFileSync(SUBS_FILE) : null;

  // Fake push service (HTTPS) memakai sertifikat dev dari plugin basic-ssl
  const pem = fs.readFileSync(path.join(ROOT, 'node_modules', '.vite', 'basic-ssl', '_cert.pem'));
  const received = [];
  const pushSvc = https.createServer({ key: pem, cert: pem }, (rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      if (rq.url.startsWith('/gone')) { rs.statusCode = 410; return rs.end(); }
      received.push({ url: rq.url, headers: rq.headers, body: Buffer.concat(chunks) });
      rs.statusCode = 201; rs.end();
    });
  });
  await new Promise((r) => pushSvc.listen(0, '127.0.0.1', r));
  const svc = `https://127.0.0.1:${pushSvc.address().port}`;

  // Instance middleware in-process
  const { pushApiMiddleware } = await import('../server/pushApi.mjs');
  const mw = pushApiMiddleware();
  const api = http.createServer((q, s) => mw(q, s, () => { s.statusCode = 418; s.end('passthrough'); }));
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${api.address().port}`;

  try {
    fs.writeFileSync(SUBS_FILE, '[]');
    const { json: { publicKey } } = await req(base, 'GET', '/api/push/public-key');

    const mkDevice = (p) => {
      const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
      const auth = crypto.randomBytes(16);
      return { ecdh, auth, sub: { endpoint: svc + p, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } };
    };
    const devA = mkDevice('/ok/device-A');
    const devB = mkDevice('/ok/device-B');
    const gone = mkDevice('/gone/device-expired');
    for (const d of [devA, devB, gone]) await req(base, 'POST', '/api/push/subscribe', d.sub);

    let r = await req(base, 'GET', '/lainnya');
    check('request non-API diteruskan (next())', r.status === 418);

    const body = 'CASH Rp180.000\nCustomer: Andi\nKasir: Bagas';
    r = await req(base, 'POST', '/api/push/notify', { title: 'Uang Masuk', body, tag: 'INV-1', url: '/backoffice/reports' });
    check('notify → sent 2 dari 3', r.json?.sent === 2 && r.json?.total === 3, JSON.stringify(r.json));
    check('fake push service menerima 2 push', received.length === 2, received.length);

    const msg = received.find((m) => m.url === '/ok/device-A');
    check('header Content-Encoding: aes128gcm', msg?.headers['content-encoding'] === 'aes128gcm');
    check('header TTL & Urgency', msg?.headers.ttl === '3600' && msg?.headers.urgency === 'high', `${msg?.headers.ttl}/${msg?.headers.urgency}`);
    const auth = msg?.headers.authorization || '';
    const k = /k=([\w-]+)/.exec(auth)?.[1];
    const jwt = /vapid t=([\w-]+\.[\w-]+\.[\w-]+)/.exec(auth)?.[1];
    check('Authorization VAPID memakai public key server', k === publicKey);
    const claims = jwt ? JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')) : {};
    check('JWT aud = origin push service', claims.aud === svc, claims.aud);

    const payload = JSON.parse(decryptAes128gcm(msg.body, devA.ecdh, devA.auth));
    check('payload terdekripsi: title "Uang Masuk"', payload.title === 'Uang Masuk');
    check('payload body sesuai format', payload.body === body, JSON.stringify(payload.body));
    check('payload tag & url', payload.tag === 'INV-1' && payload.url === '/backoffice/reports');
    const msgB = received.find((m) => m.url === '/ok/device-B');
    check('device B juga bisa dekripsi', JSON.parse(decryptAes128gcm(msgB.body, devB.ecdh, devB.auth)).title === 'Uang Masuk');

    const saved = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    check('subscription kadaluarsa (410) otomatis dihapus', saved.length === 2 && !saved.some((s) => s.endpoint.includes('/gone')), saved.length);

    r = await req(base, 'POST', '/api/push/notify', { title: 'X', url: 'https://evil.example' });
    const last = JSON.parse(decryptAes128gcm(received.at(-1).body, devB.ecdh, devB.auth));
    check('url eksternal ditolak (fallback "/")', last.url === '/' || JSON.parse(decryptAes128gcm(received.at(-2).body, devA.ecdh, devA.auth)).url === '/');
  } finally {
    if (backup) fs.writeFileSync(SUBS_FILE, backup); else fs.rmSync(SUBS_FILE, { force: true });
    api.close(); pushSvc.close();
  }
}

// ---------------------------------------------------------------------------
const mode = process.argv[2] || 'all';
try {
  if (mode === 'all' || mode === 'live') await partA(LIVE, 'Vite dev server');
  if (mode === 'prod') await partA(process.env.PROD_URL || 'http://localhost:4199', 'server produksi (npm run serve)');
  if (mode === 'all' || mode === 'delivery') await partB();
} catch (err) {
  fail++; console.error('\n💥 ERROR:', err);
}
console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
