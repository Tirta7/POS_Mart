import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { pushApiMiddleware } from './server/pushApi.mjs'
// @ts-ignore
import { licenseMiddleware } from './server/license.mjs'
// @ts-ignore
import { saasApiMiddleware } from './server/api.mjs'
// @ts-ignore
import { initSocket } from './server/socket.mjs'

/** Menyediakan endpoint /api/push/* (Web Push "Uang Masuk") langsung di dev & preview server. */
const pushApiPlugin = (): Plugin => ({
  name: 'pos-push-api',
  configureServer(server) {
    if (server.httpServer) {
      initSocket(server.httpServer);
    }
    server.middlewares.use((req, res, next) => {
      // Polyfill HTTP/2 socket & prevent res.end crash in Node 22
      if (!req.socket && (req as any).stream) {
        (req as any).socket = { destroy: () => (req as any).stream.destroy() } as any;
      }
      const origEnd = res.end;
      (res as any).end = function(...args: any[]) {
        if ((res as any).destroyed) return this;
        try { return origEnd.apply(this, args as any); } catch(e) { return this; }
      };
      next();
    });
    server.middlewares.use(licenseMiddleware())
    server.middlewares.use(pushApiMiddleware())
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/saas')) {
        saasApiMiddleware(req, res, next)
      } else {
        next()
      }
    })
  },
  configurePreviewServer(server) {
    if (server.httpServer) {
      initSocket(server.httpServer);
    }
    server.middlewares.use((req, res, next) => {
      if (!req.socket && (req as any).stream) {
        (req as any).socket = { destroy: () => (req as any).stream.destroy() } as any;
      }
      const origEnd = res.end;
      (res as any).end = function(...args: any[]) {
        if ((res as any).destroyed) return this;
        try { return origEnd.apply(this, args as any); } catch(e) { return this; }
      };
      next();
    });
    server.middlewares.use(licenseMiddleware())
    server.middlewares.use(pushApiMiddleware())
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/saas')) {
        saasApiMiddleware(req, res, next)
      } else {
        next()
      }
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pushApiPlugin()],
  server: {
    host: true,
    // Izinkan akses lewat tunnel (ngrok / Cloudflare Tunnel) agar iOS mendapat HTTPS valid.
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
})
