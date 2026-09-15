@echo off
title SoundControl Desktop Launcher
echo ========================================================
echo       SoundControl - Desktop Companion for Soundcore
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please download and install Node.js (LTS version) from: https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    set ELECTRON_SKIP_BINARY_DOWNLOAD=1
    call npm install
)

if not exist dist (
    echo Building web bundle...
    call npm run build
)

echo Launching SoundControl Windows App...
call npm run electron
