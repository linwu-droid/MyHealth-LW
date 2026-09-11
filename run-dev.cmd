@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: node not found on PATH. Install Node.js or reopen the terminal.
  pause
  exit /b 1
)
call npm run dev
if errorlevel 1 (
  echo.
  echo MyHealth failed to start. See errors above.
  echo If Access is denied on GPUCache, close all MyHealth/Electron windows and retry.
  pause
  exit /b 1
)
