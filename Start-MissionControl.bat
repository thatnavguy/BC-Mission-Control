@echo off
setlocal
title BC Mission Control
cd /d "%~dp0"

echo ==========================================
echo   BC Mission Control
echo ==========================================
echo.

REM First-time setup: install dependencies if missing
if not exist "server\node_modules" (
  echo Installing server dependencies...
  call npm --prefix server install --no-audit --no-fund || goto :error
)
if not exist "web\node_modules" (
  echo Installing web dependencies...
  call npm --prefix web install --no-audit --no-fund || goto :error
)

REM Build if output is missing
if not exist "web\dist\index.html" (
  echo Building web UI...
  call npm --prefix web run build || goto :error
)
if not exist "server\dist\index.js" (
  echo Building server...
  call npm --prefix server run build || goto :error
)

echo.
echo Starting at http://127.0.0.1:4321
echo (Keep this window open while using the app. Close it to stop.)
echo.
start "" "http://127.0.0.1:4321"
node server\dist\index.js
goto :eof

:error
echo.
echo Something failed. See the messages above.
pause
