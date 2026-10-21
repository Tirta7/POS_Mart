#!/usr/bin/env bash

# Pindah ke folder project POS_Mart
cd "$(dirname "$0")"

# Pastikan tool node, npm, dan PostgreSQL terbaca di macOS
export PATH="/Users/tirtaaditya/.local/node/bin:/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

clear
echo "=========================================================="
echo "         ⚠️  PERINGATAN FACTORY RESET DATABASE  ⚠️         "
echo "                 APLIKASI POS MART SWALAYAN               "
echo "=========================================================="
echo ""
echo "Tindakan ini akan mengembalikan database ke kondisi awal"
echo "pabrik (SEPERTI BARU). Seluruh data berikut akan DIHAPUS:"
echo ""
echo "  [x] Semua Data Produk, Barcode, Varian & Stok Fisik"
echo "  [x] Semua Riwayat Transaksi Kasir, Nota & Pembayaran"
echo "  [x] Semua Riwayat Mutasi Stok Masuk & Keluar"
echo "  [x] Semua Data Pelanggan, Supplier & Saldo Hutang"
echo "  [x] Semua Retur Penjualan & Draft Penerimaan"
echo ""
echo "Data yang akan dibuatkan otomatis (Standar Baru):"
echo "  [✓] Toko Baru: POS MART (ID: TID-DEMO-123)"
echo "  [✓] Akun Admin  -> User: admin | Sandi: admin | PIN: 123456"
echo "  [✓] Akun Kasir  -> User: kasir | Sandi: kasir | PIN: 111111"
echo "  [✓] Kategori    -> Umum"
echo "  [✓] Pelanggan   -> Umum (Retail)"
echo ""
echo "=========================================================="
echo ""
printf "Ketik \033[1;31mYA\033[0m untuk konfirmasi Factory Reset (atau tekan Enter untuk BATAL): "
read -r CONFIRM

# Normalisasi jawaban ke huruf kecil
CONFIRM_LOWER=$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]' | xargs)

if [ "$CONFIRM_LOWER" != "ya" ] && [ "$CONFIRM_LOWER" != "y" ]; then
    echo ""
    echo "[i] FACTORY RESET DIBATALKAN. Tidak ada data yang diubah atau dihapus."
    echo ""
    echo "Tekan Enter untuk keluar..."
    read -r
    exit 0
fi

echo ""
echo "=========================================================="
echo "[1/4] Memeriksa status PostgreSQL Database..."
if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "[!] PostgreSQL belum aktif. Sedang membuka Postgres.app..."
    open -a Postgres 2>/dev/null || true
    sleep 3
fi

if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "[X] Gagal terhubung ke PostgreSQL. Pastikan Postgres.app berjalan."
    echo "Tekan Enter untuk keluar..."
    read -r
    exit 1
fi
echo "[✓] PostgreSQL aktif dan siap."

echo ""
echo "[2/4] Membuat Backup Otomatis untuk Keamanan Data Anda..."
mkdir -p backups
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backups/backup_sebelum_factory_reset_${TIMESTAMP}.sql"

if command -v pg_dump >/dev/null 2>&1; then
    pg_dump -h localhost -p 5432 -U tirtaaditya posmart > "$BACKUP_FILE" 2>/dev/null || true
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        echo "[✓] Backup pengaman tersimpan di: $BACKUP_FILE"
    else
        echo "[i] Melanjutkan tanpa backup dump fisik..."
    fi
fi

echo ""
echo "[3/4] Menghentikan server POS Mart yang sedang berjalan..."
PIDS=$(lsof -ti :5173 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
    echo "[✓] Port 5173 telah dibebaskan."
else
    echo "[✓] Server sedang tidak aktif."
fi

echo ""
echo "[4/4] Menjalankan Factory Reset Database..."
node scripts/factory-reset.mjs

if [ $? -ne 0 ]; then
    echo ""
    echo "[X] Terjadi kendala saat reset database."
    echo "Tekan Enter untuk keluar..."
    read -r
    exit 1
fi

echo "=========================================================="
echo "    DATABASE SUDAH 100% BERSIH & KOSONG SEPERTI BARU!    "
echo "=========================================================="
echo ""
echo "Langkah Login Pertama Kali:"
echo "  1. Buka aplikasi POS Mart"
echo "  2. Login dengan Akun Administrator:"
echo "     - Username : admin"
echo "     - Password : admin"
echo "     - Atau PIN : 123456"
echo ""
echo "  3. Atau gunakan Akun Kasir:"
echo "     - Username : kasir"
echo "     - Password : kasir"
echo "     - Atau PIN : 111111"
echo ""
echo "Tips: Jika di browser masih muncul sisa tampilan lama,"
echo "silakan tekan Cmd + Shift + R (Hard Refresh) di browser Anda."
echo "=========================================================="
echo ""
printf "Apakah Anda ingin menyalakan Server POS Mart sekarang? (Y/T): "
read -r START_NOW

START_LOWER=$(echo "$START_NOW" | tr '[:upper:]' '[:lower:]' | xargs)

if [ "$START_LOWER" = "y" ] || [ "$START_LOWER" = "ya" ]; then
    echo ""
    echo "Menyalakan Server POS MART..."
    (sleep 3 && open http://localhost:5173) &
    npm run dev
else
    echo ""
    echo "Anda dapat menyalakan server kapan saja dengan membuka:"
    echo "👉 JALANKAN_SERVER.command"
    echo ""
    echo "Selesai. Anda dapat menutup jendela ini."
    exit 0
fi
