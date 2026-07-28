@echo off
setlocal

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo This folder is not a git checkout yet.
  echo Download the newest release ZIP or clone the repo when it is published.
  exit /b 1
)

echo Pulling latest changes...
git pull --ff-only
if errorlevel 1 exit /b 1

echo Updating dependencies...
call npm install
if errorlevel 1 exit /b 1

echo Rebuilding frontend...
call npm run build
if errorlevel 1 exit /b 1

echo Done. Start the app with start-windows.bat
