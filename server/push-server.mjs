// =============================================================================
// Server produksi sederhana: menyajikan hasil build (dist/) + Push API.
// Jalankan:  npm run build  lalu  npm run serve   (default port 4173)
// Saat development cukup `npm run dev` — Push API sudah ikut lewat plugin Vite.
// =============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushApiMiddleware } from './pushApi.mjs';
import { licenseMiddleware } from './license.mjs';
import { saasApiMiddleware } from './api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const api = pushApiMiddleware();
const license = licenseMiddleware();
const saasApi = saasApiMiddleware;

http.createServer((req, res) => {
  const runNext = () => {
    license(req, res, () => {
      api(req, res, () => {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let file = path.join(DIST, urlPath);
        if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          file = path.join(DIST, 'index.html'); // SPA fallback
        }
        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
        if (path.basename(file) === 'sw.js') res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    });
  };

  if (req.url?.startsWith('/api/saas')) {
    saasApi(req, res, runNext);
  } else {
    runNext();
  }
}).listen(PORT, () => console.log(`[push-server] http://localhost:${PORT}`));
