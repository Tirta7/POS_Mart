import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/backoffice.css'
import './styles/responsive.css'
import App from './App.tsx'
import { installMobileTableLabels } from './utils/mobileTableLabels'
import { registerServiceWorker } from './utils/pushNotification'

// Render application

// Tabel back-office tampil sebagai kartu di HP — label kolom diisi otomatis
installMobileTableLabels();

// Service worker untuk Web Push Notification "Uang Masuk"
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
