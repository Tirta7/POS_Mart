#!/usr/bin/env bash

cd "$(dirname "$0")"

clear
echo "=========================================================="
echo "               POS MART - Stop Server                     "
echo "=========================================================="
echo ""
echo "Sedang mematikan server POS MART (Port 5173)..."

PIDS=$(lsof -ti :5173 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    echo ""
    echo "[✓] Server POS MART berhasil dimatikan!"
else
    echo ""
    echo "[i] Server POS MART memang sedang tidak berjalan."
fi

echo ""
echo "Port 5173 sudah bersih dan bebas."
echo "Anda bisa langsung menutup jendela ini (tekan Cmd + W atau klik tombol merah X)."
echo "=========================================================="
echo ""
exit 0
