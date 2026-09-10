@echo off
rem Taffy desk pet launcher (ASCII-safe, no chcp, direct electron.exe)
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo [Taffy] First run: installing dependencies, please wait...
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo [Taffy] npm install failed. Check Node.js and network, then run again.
    pause
    exit /b 1
  )
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [Taffy] Electron is still missing. Please run "npm install" manually.
  pause
  exit /b 1
)

start "" "node_modules\electron\dist\electron.exe" "." "--reload-source"
exit /b 0