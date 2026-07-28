@echo off
setlocal

if not exist node_modules (
  echo Missing node_modules. Running install first...
  call install-windows.bat
  if errorlevel 1 exit /b 1
)

if not exist dist (
  echo Building frontend...
  call npm run build
  if errorlevel 1 exit /b 1
)

echo Starting ToText at http://localhost:3001
call npm run server
