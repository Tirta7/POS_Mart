import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/backoffice.css'
import './styles/responsive.css'
import App from './App.tsx'
import { installMobileTableLabels } from './utils/mobileTableLabels'

// Set title instantly from localStorage — tanpa jeda/ghost flash
try {
  const raw = localStorage.getItem('settings-storage');
  if (raw) {
    const parsed = JSON.parse(raw);
    const name = parsed?.state?.appName;
    if (name) document.title = name;
  }
} catch { /* ignore */ }

// Tabel back-office tampil sebagai kartu di HP — label kolom diisi otomatis
installMobileTableLabels();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
