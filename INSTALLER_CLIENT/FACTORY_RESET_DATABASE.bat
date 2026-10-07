@echo off
setlocal enabledelayedexpansion

title VOC POS Swalayan - FACTORY RESET (KOSONGKAN DATA)
color 4F
cls

set "INSTALL_DIR=%~dp0"
cd /d "%INSTALL_DIR%"

echo.
echo  ============================================================
echo    KEMBALI KE PENGATURAN PABRIK (FACTORY RESET)
echo  ============================================================
echo  PERINGATAN SANGAT BERBAHAYA!!!
echo  Script ini akan MENGHAPUS TOTAL seluruh isi database Anda!
echo  Semua data Produk, Transaksi, Laporan, dan Akun akan 
echo  HILANG SELAMANYA dan TIDAK BISA DIKEMBALIKAN!
echo.
echo  Apakah Anda BENAR-BENAR YAKIN ingin mereset semuanya ke nol?
echo  Ketik RESET untuk lanjut, atau ketik apapun untuk batal.
echo  ============================================================
set /p CONFIRM="Ketik RESET: "
if /I not "!CONFIRM!"=="RESET" (
    echo.
    echo  Syukurlah, proses Reset Dibatalkan. Data Anda aman.
    pause
    exit /b
)

echo.
echo  [..] Menghancurkan database lama...
docker-compose down -v

echo  [..] Membangun database baru yang masih kosong...
docker-compose up -d --force-recreate

echo  [..] Menyiapkan struktur tabel database baru (Mohon tunggu)...
:: Memberi waktu beberapa detik agar database siap menerima koneksi
timeout /t 5 /nobreak >nul

:: Mencari nama container aplikasi untuk menjalankan Prisma Push
for /f "tokens=*" %%i in ('docker-compose ps -q app 2^>nul') do set APP_CONTAINER=%%i
if "!APP_CONTAINER!"=="" (
    for /f "tokens=*" %%i in ('docker-compose ps -q swalayan_srikandi 2^>nul') do set APP_CONTAINER=%%i
)

if not "!APP_CONTAINER!"=="" (
    docker exec -it !APP_CONTAINER! npx prisma db push --force-reset --accept-data-loss
) else (
    :: Fallback jika nama service tidak ditemukan, mencoba nama container langsung
    docker exec -it swalayan_srikandi npx prisma db push --force-reset --accept-data-loss
)

echo.
echo  [OK] FACTORY RESET SELESAI!
echo  Toko Anda sekarang sudah kosong melompong seperti baru.
echo  ============================================================
pause
endlocal
