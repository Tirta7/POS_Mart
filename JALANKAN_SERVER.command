#!/usr/bin/env bash

# Pindah ke folder project POS_Mart
cd "$(dirname "$0")"

# Pastikan tool node dan npm terbaca
export PATH="/Users/tirtaaditya/.local/node/bin:/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

clear
echo "=========================================================="
echo "               POS MART - Server Startup                  "
echo "=========================================================="
echo ""

# Periksa apakah PostgreSQL aktif
if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "[!] PostgreSQL belum aktif. Sedang membuka Postgres.app..."
    open -a Postgres 2>/dev/null || true
    sleep 3
fi

echo "[✓] PostgreSQL siap."
echo "[✓] Menyalakan Server POS MART (Port 5173)..."
echo ""
echo "----------------------------------------------------------"
echo "  URL Web   : http://localhost:5173"
echo "----------------------------------------------------------"
echo ""
echo "Browser akan terbuka otomatis dalam beberapa detik..."
echo "Jangan tutup jendela ini selama Anda menggunakan aplikasi."
echo "Untuk mematikan server: tekan Ctrl + C"
echo "=========================================================="
echo ""

# Buka browser otomatis ke http://localhost:5173 setelah delay 3 detik
(sleep 3 && open http://localhost:5173) &

# Jalankan server POS MART
npm run dev
