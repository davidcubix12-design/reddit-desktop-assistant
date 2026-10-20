@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" server.mjs --open
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js 22 or newer is required. Install it from https://nodejs.org/
    pause
    exit /b 1
  )
  node server.mjs --open
)
if errorlevel 1 pause
