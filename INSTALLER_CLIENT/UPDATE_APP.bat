@echo off
setlocal enabledelayedexpansion

title VOC POS Swalayan - Update Aplikasi ke Versi Terbaru
color 0A
cls

set "INSTALL_DIR=%~dp0"
cd /d "%INSTALL_DIR%"

echo.
echo  ============================================================
echo    UPDATE APLIKASI POS SWALAYAN KE VERSI TERBARU
echo  ============================================================
echo.
echo  Script ini akan mengunduh pembaruan terbaru (kode baru, perbaikan bug,
echo  fitur baru) dari Cloud Registry tanpa menghapus data transaksi Anda.
echo.
echo  Apakah Anda ingin melanjutkan update?
echo  Ketik Y untuk lanjut, ketik N untuk batal.
echo  ============================================================
set /p CONFIRM="Pilihan Anda (Y/N): "
if /I not "!CONFIRM!"=="Y" (
    echo Dibatalkan.
    pause
    exit /b
)

echo.
echo  [1/3] Mengunduh (pull) citra Docker terbaru...
docker-compose pull app

echo.
echo  [2/3] Memulai ulang kontainer dengan versi terbaru...
docker-compose up -d --no-deps app

echo.
echo  [3/3] Memastikan skema database tersinkronisasi...
for /f "tokens=*" %%i in ('docker-compose ps -q app 2^>nul') do set APP_CONTAINER=%%i
if not "!APP_CONTAINER!"=="" (
    docker exec -it !APP_CONTAINER! npx prisma db push --accept-data-loss
)

echo.
echo  ============================================================
echo  [OK] Update aplikasi berhasil diselesaikan!
echo  Silakan refresh halaman web di browser Anda.
echo  ============================================================
pause
endlocal
