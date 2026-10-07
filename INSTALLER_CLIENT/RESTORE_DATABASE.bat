@echo off
setlocal enabledelayedexpansion

title VOC POS Swalayan - Restore Database
color 0C
cls

set "INSTALL_DIR=%~dp0"
cd /d "%INSTALL_DIR%"

echo.
echo  ============================================================
echo    RESTORE DATABASE LOKAL - VOC POS SWALAYAN
echo  ============================================================
echo  PERINGATAN BAHAYA: 
echo  Melakukan restore akan ME-RESET / MENGGANTI 
echo  seluruh data POS Anda saat ini dengan data dari file backup!
echo.
echo  Apakah Anda benar-benar yakin ingin me-restore database?
echo  Ketik Y untuk lanjut, ketik N untuk batal.
echo  ============================================================
set /p CONFIRM="Pilihan Anda (Y/N): "
if /I not "!CONFIRM!"=="Y" (
    echo Dibatalkan.
    pause
    exit /b
)

echo.
echo  Mencari file backup (.sql)...
set "COUNT=0"
for %%F in (*.sql) do (
    set /a COUNT+=1
    set "FILE_!COUNT!=%%F"
    echo  [!COUNT!] %%F
)

if !COUNT!==0 (
    echo  [ERROR] Tidak ada file .sql yang ditemukan di folder ini!
    echo  Pindahkan file backup Anda ke folder ini terlebih dahulu.
    pause
    exit /b 1
)

echo.
set /p SEL="Pilih nomor file yang ingin di-restore (1-!COUNT!): "
if "!FILE_%SEL%!"=="" (
    echo  [ERROR] Pilihan tidak valid!
    pause
    exit /b 1
)

set "RESTORE_FILE=!FILE_%SEL%!"
echo  File terpilih: !RESTORE_FILE!
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
set "DB_URL=%DB_URL: =%"

if "!DB_URL!"=="" (
    echo  [ERROR] DATABASE_URL tidak ditemukan di docker-compose.yml!
    pause
    exit /b 1
)

echo  [..] Memulai proses RESTORE ke Database Lokal...
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

:: Menjalankan psql menggunakan image postgres sementara di Docker
docker run --rm --network "!NET_NAME!" -v "%INSTALL_DIR%:/backup" postgres:16-alpine psql "!DB_URL!" -f "/backup/!RESTORE_FILE!"

if errorlevel 1 (
    echo.
    echo  [ERROR] Restore gagal! Pastikan database berjalan normal.
    pause
    exit /b 1
)

echo.
echo  [OK] RESTORE SELESAI!
echo  Data lokal telah kembali seperti pada saat backup dilakukan.
echo  ============================================================
pause
endlocal
