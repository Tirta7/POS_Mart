import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLicense } from './vocml-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export let licenseState = { allowed: true, status: 'pending', reason: 'Menunggu pengecekan awal' };

function getMachineId() {
  if (process.env.MACHINE_ID) {
    return process.env.MACHINE_ID;
  }
  
  try {
    const scriptPath = path.resolve(__dirname, 'get-machine-id.ps1'); 
    const result = execSync(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}"`);
    return result.toString().trim();
  } catch (err) {
    console.error('Gagal mendapatkan Machine ID:', err);
    return 'UNKNOWN-MACHINE';
  }
}

// 2. Kunci Publik VOC ML
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAFikG8bNm9mNGCfiWAWM3h0zPTAIwodhO71tnIp2ALqI=
-----END PUBLIC KEY-----`;

// Variabel untuk menyimpan timer
let checkTimer = null;

async function verifikasiAplikasi() {
  const machineId = getMachineId();
  console.log('[License] Mengecek lisensi untuk Machine ID:', machineId);

  const lisensi = await checkLicense({
    serverUrl: 'http://localhost:8080',
    product: 'pos',
    machineId: machineId,
    publicKeyPem: PUBLIC_KEY,
    cacheFile: path.join(__dirname, 'data', 'license-cache.json'),
    storeName: 'Toko Swalayan POS',
    appVersion: '1.0.0',
  });

  licenseState = lisensi;

  if (!lisensi.allowed) {
    console.log('[License] AKSES DITOLAK:', lisensi.status, '-', lisensi.reason);
  } else {
    console.log('[License] AKSES DIIZINKAN. Status:', lisensi.status);
    console.log('[License] Berlaku sampai:', lisensi.expiresAt);
  }
  
  // Atur jadwal pengecekan berikutnya (Smart Polling)
  if (checkTimer) clearTimeout(checkTimer);
  if (!lisensi.allowed) {
    // Jika masih dikunci/pending, cek setiap 5 detik agar bisa otomatis terbuka saat diaktivasi
    checkTimer = setTimeout(verifikasiAplikasi, 5000);
  } else {
    // Jika sudah aktif, cukup cek ulang 3 jam sekali
    checkTimer = setTimeout(verifikasiAplikasi, 3 * 60 * 60 * 1000);
  }
}

// Panggil fungsi saat aplikasi mulai
verifikasiAplikasi(); 

export function licenseMiddleware() {
  return (req, res, next) => {
    // Tambahkan API endpoint untuk frontend mengambil status lisensi
    if (req.url === '/api/license-status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(licenseState));
      return;
    }

    // Jika allowed, lanjut jalankan request
    if (licenseState.allowed) return next();
    
    // Jika ditolak, tampilkan halaman terkunci
    const lockHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Aplikasi Terkunci</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; background: #fef2f2; color: #991b1b; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
.box { background: white; padding: 2rem 3rem; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); max-width: 450px; border: 1px solid #fecaca; }
h1 { margin-top: 0; color: #b91c1c; }
p { font-size: 1.1rem; }
.mid { font-size: 0.85rem; margin-top: 2.5rem; color: #6b7280; background: #f3f4f6; padding: 0.5rem; border-radius: 0.5rem; }
</style></head>
<body><div class="box">
<h1>Aplikasi Terkunci</h1>
<p>Status: <strong>${licenseState.status.toUpperCase()}</strong></p>
<p>${licenseState.reason}</p>
<div class="mid">Machine ID:<br><strong>${licenseState.machineId || '-'}</strong></div>
</div>
<script>
  // Otomatis refresh halaman tiap 5 detik untuk mengecek apakah aplikasi sudah dibuka
  setTimeout(() => window.location.reload(), 5000);
</script>
</body></html>`;

    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(lockHtml);
  };
}
