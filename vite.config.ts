import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { pushApiMiddleware } from './server/pushApi.mjs'
import { licenseMiddleware } from './server/license.mjs'
import { saasApiMiddleware } from './server/api.mjs'

/** Menyediakan endpoint /api/push/* (Web Push "Uang Masuk") langsung di dev & preview server. */
const pushApiPlugin = (): Plugin => ({
  name: 'pos-push-api',
  configureServer(server) {
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
  plugins: [react(), tailwindcss(), basicSsl(), pushApiPlugin()],
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
