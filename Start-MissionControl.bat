@echo off
setlocal EnableDelayedExpansion
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

REM Rebuild when outputs are missing or the checked-out Git commit has changed
set "BUILD_REQUIRED=0"
if not exist "web\dist\index.html" set "BUILD_REQUIRED=1"
if not exist "server\dist\index.js" set "BUILD_REQUIRED=1"
set "CURRENT_COMMIT="
set "CURRENT_VERSION="
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set "CURRENT_COMMIT=%%i"
for /f "delims=" %%i in ('node -p "require('./package.json').version" 2^>nul') do set "CURRENT_VERSION=%%i"
if not exist "server\dist\.build-info" set "BUILD_REQUIRED=1"
if exist "server\dist\.build-info" (
  set /p BUILT_COMMIT=<"server\dist\.build-info"
  for /f "usebackq skip=1 delims=" %%i in ("server\dist\.build-info") do set "BUILT_VERSION=%%i"
  if defined CURRENT_COMMIT (
    if not "!CURRENT_COMMIT!"=="!BUILT_COMMIT!" set "BUILD_REQUIRED=1"
  ) else (
    if not "!CURRENT_VERSION!"=="!BUILT_VERSION!" set "BUILD_REQUIRED=1"
  )
)

if "!BUILD_REQUIRED!"=="1" (
  echo Building Mission Control...
  call npm run build || goto :error
  if defined CURRENT_COMMIT (
    >"server\dist\.build-info" (
      echo !CURRENT_COMMIT!
      echo !CURRENT_VERSION!
    )
  ) else (
    >"server\dist\.build-info" (
      echo no-git
      echo !CURRENT_VERSION!
    )
  )
)

echo.
echo Starting at http://127.0.0.1:7654
echo (Keep this window open while using the app. Close it to stop.)
echo.
start "" "http://127.0.0.1:7654"
node server\dist\index.js
goto :eof

:error
echo.
echo Something failed. See the messages above.
pause
