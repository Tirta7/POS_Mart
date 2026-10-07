@echo off
setlocal enabledelayedexpansion

title VOC POS Swalayan - Hard Restart Database
color 0E
cls

set "INSTALL_DIR=%~dp0"
cd /d "%INSTALL_DIR%"

echo.
echo  ============================================================
echo    HARD RESTART DATABASE - VOC POS SWALAYAN
echo  ============================================================
echo  Script ini akan mematikan paksa mesin database dan 
echo  menyalakannya kembali. 
echo  (Data Anda AMAN, ini hanya me-restart mesin layaknya mencabut
echo   dan memasang kembali kabel power server)
echo.
echo  Apakah Anda ingin melanjutkan?
echo  Ketik Y untuk lanjut, ketik N untuk batal.
echo  ============================================================
set /p CONFIRM="Pilihan Anda (Y/N): "
if /I not "!CONFIRM!"=="Y" (
    echo Dibatalkan.
    pause
    exit /b
)

echo.
echo  [..] Mematikan mesin database...
docker-compose stop db

echo  [..] Membangun ulang dan menyalakan kembali mesin database...
docker-compose up -d --force-recreate db

echo.
echo  [OK] Mesin database telah berhasil di-restart keras (Hard Restart)!
echo  ============================================================
pause
endlocal
