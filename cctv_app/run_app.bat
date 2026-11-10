@echo off
title EcoSort CCTV App Launcher
color 0A

echo ===================================================
echo     ECOSORT CCTV - FLUTTER SMART CAMERA APP
echo ===================================================
echo.

where flutter >nul 2>nul
if %errorlevel% neq 0 (
    echo [PERINGATAN] Flutter SDK belum terdeteksi di PATH komputer ini.
    echo.
    echo Silakan unduh dan pasang Flutter SDK dari:
    echo   https://docs.flutter.dev/get-started/install/windows
    echo.
    echo Pastikan folder bin Flutter sudah ditambahkan ke PATH Windows.
    echo.
    pause
    exit /b 1
)

echo [1/2] Mengunduh dependensi Flutter (flutter pub get)...
call flutter pub get

echo.
echo [2/2] Menjalankan aplikasi kamera CCTV EcoSort...
call flutter run

pause

