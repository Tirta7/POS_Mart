@echo off
setlocal enabledelayedexpansion

title FRANCHISE GENERATOR - VOC POS SWALAYAN
color 0B

echo ============================================================
echo   SISTEM PEMBUAT CABANG OTOMATIS (FRANCHISE GENERATOR)
echo ============================================================
echo.
echo Alat ini akan menggandakan folder installer, mendaftarkan
echo domain baru (vocpos.id), dan mengatur Cloudflare Tunnel
echo secara otomatis!
echo.

set /p BRANCH="Masukkan nama cabang baru (huruf kecil semua tanpa spasi, contoh: srikandi): "
if "!BRANCH!"=="" (
    echo Nama cabang tidak boleh kosong!
    pause
    exit /b
)

echo.
echo [1/4] Membuat Cloudflare Tunnel baru bernama "pos-!BRANCH!"...
cloudflared tunnel create pos-!BRANCH! > temp_tunnel_output.txt 2>&1

set "TUNNEL_UUID="
for /f "tokens=6" %%a in ('findstr /c:"Created tunnel" temp_tunnel_output.txt') do set "TUNNEL_UUID=%%a"

if "!TUNNEL_UUID!"=="" (
    echo.
    echo [ERROR] Gagal membuat tunnel. Kemungkinan besar nama "pos-!BRANCH!" sudah pernah dibuat sebelumnya!
    echo Silakan gunakan nama lain atau hapus tunnel lama.
    pause
    exit /b
)

echo [OK] Tunnel berhasil diciptakan! ID: !TUNNEL_UUID!
echo.

echo [2/4] Mendaftarkan Domain DNS ke satelit Cloudflare (vocpos.id)...
cloudflared tunnel route dns pos-!BRANCH! !BRANCH!.vocpos.id
echo [OK] Domain !BRANCH!.vocpos.id berhasil didaftarkan!
echo.

echo [3/4] Menggandakan folder "INSTALLER_CLIENT" menjadi "INSTALLER_!BRANCH!"...
set "TARGET_DIR=INSTALLER_!BRANCH!"
if not exist "INSTALLER_CLIENT" (
    echo [ERROR] Folder INSTALLER_CLIENT tidak ditemukan! Pastikan Anda sudah membuat folder template-nya.
    pause
    exit /b
)
xcopy "INSTALLER_CLIENT" "!TARGET_DIR!\" /E /I /H /Y /Q >nul
echo [OK] Folder berhasil digandakan!
echo.

echo [4/4] Memasukkan konfigurasi rahasia khusus cabang !BRANCH!...
:: Membuat folder cloudflare jika belum ada
if not exist "!TARGET_DIR!\cloudflare" mkdir "!TARGET_DIR!\cloudflare"

:: Menyuntikkan credential rahasia
copy "C:\Users\tirta\.cloudflared\!TUNNEL_UUID!.json" "!TARGET_DIR!\cloudflare\credentials.json" >nul

:: Membuat config.yml khusus Docker cabang
(
  echo tunnel: !TUNNEL_UUID!
  echo credentials-file: /etc/cloudflared/credentials.json
  echo.
  echo ingress:
  echo   - hostname: !BRANCH!.vocpos.id
  echo     service: http://swalayan_app:4173
  echo   - service: http_status:404
) > "!TARGET_DIR!\cloudflare\config.yml"

:: Menyulap file konfigurasi (jika Anda pakai docker-compose.yml di dalamnya)
if exist "!TARGET_DIR!\docker-compose.yml" (
    powershell -NoProfile -Command "(Get-Content '!TARGET_DIR!\docker-compose.yml') -replace 'NAMACABANG', '!BRANCH!' | Set-Content '!TARGET_DIR!\docker-compose.yml'"
)
if exist "!TARGET_DIR!\backup_db.bat" (
    powershell -NoProfile -Command "(Get-Content '!TARGET_DIR!\backup_db.bat') -replace 'NAMACABANG', '!BRANCH!' | Set-Content '!TARGET_DIR!\backup_db.bat'"
)
if exist "!TARGET_DIR!\restore_db.bat" (
    powershell -NoProfile -Command "(Get-Content '!TARGET_DIR!\restore_db.bat') -replace 'NAMACABANG', '!BRANCH!' | Set-Content '!TARGET_DIR!\restore_db.bat'"
)

del temp_tunnel_output.txt >nul 2>&1

echo [OK] Konfigurasi berhasil disuntikkan!
echo.

echo [5/5] Membuat File Konfigurasi Token...
(
    echo GITHUB_TOKEN=
    echo GITHUB_USERNAME=tirta7
) > "!TARGET_DIR!\.token"
echo [OK] File .token disiapkan! Silakan isi token GitHub Anda sebelum dikirim ke klien.
echo.

echo ============================================================
echo   SELESAI! CABANG BARU BERHASIL DIBUAT!
echo ============================================================
echo Folder instalasi khusus untuk !BRANCH! sudah siap di:
echo %CD%\!TARGET_DIR!
echo.
echo Domain Aplikasi: https://!BRANCH!.vocpos.id
echo ============================================================
pause
