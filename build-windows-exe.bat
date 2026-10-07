@echo off
title SoundControl Windows Installer Builder
echo ========================================================
echo       Building SoundControl Windows Executable (.exe)
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please download and install Node.js (LTS version) from: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/2] Checking dependencies...
call npm install

echo.
echo [2/2] Building the app and packaging the Windows NSIS installer...
call npm run build:win

echo.
echo ========================================================
echo  Build finished successfully!
echo  Check the "release" directory for your Windows installer.
echo ========================================================
pause
