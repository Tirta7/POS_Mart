@echo off
setlocal enabledelayedexpansion

title VOC POS Swalayan - Backup Database
color 0B
cls

set "INSTALL_DIR=%~dp0"
cd /d "%INSTALL_DIR%"

echo.
echo  ============================================================
echo    BACKUP DATABASE CLOUD - VOC POS SWALAYAN
echo  ============================================================
echo.
echo  Mengekstrak URL Database dari docker-compose.yml...

set "DB_URL="
for /f "tokens=2,* delims==" %%a in ('findstr /c:"DATABASE_URL=" docker-compose.yml') do (
    if "%%b"=="" (
        set "DB_URL=%%a"
    ) else (
        set "DB_URL=%%a=%%b"
    )
)
:: Menghapus spasi awal jika ada
set "DB_URL=%DB_URL: =%"

if "!DB_URL!"=="" (
    echo  [ERROR] DATABASE_URL tidak ditemukan di docker-compose.yml!
    pause
    exit /b 1
)

:: Membuat nama file berdasarkan tanggal tanpa menggunakan wmic
for /f "delims=" %%I in ('powershell -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set DATETIME_STR=%%I
set "BACKUP_FILE=backup_pos_!DATETIME_STR!.sql"

echo  [..] Memulai proses backup dari Database Lokal...
echo       Harap tunggu...
echo.

:: Mengambil ID Container dari layanan 'db'
for /f "tokens=*" %%i in ('docker-compose ps -q db') do set DB_CONTAINER=%%i
if "!DB_CONTAINER!"=="" (
    echo  [ERROR] Layanan 'db' belum berjalan. Harap nyalakan aplikasi terlebih dahulu.
    pause
    exit /b 1
)

:: Mencari nama jaringan (network) yang digunakan oleh container 'db'
for /f "tokens=*" %%i in ('docker inspect -f "{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}" !DB_CONTAINER!') do set NET_NAME=%%i

:: Menjalankan pg_dump menggunakan image postgres sementara di Docker dengan format SQL murni
docker run --rm --network "!NET_NAME!" -v "%INSTALL_DIR%:/backup" postgres:16-alpine pg_dump "!DB_URL!" -f "/backup/!BACKUP_FILE!"

if errorlevel 1 (
    echo.
    echo  [ERROR] Backup gagal! Pastikan database berjalan normal.
    pause
    exit /b 1
)

echo.
echo  [OK] Backup Selesai!
echo       File tersimpan sebagai: !BACKUP_FILE!
echo  ============================================================
pause
endlocal
