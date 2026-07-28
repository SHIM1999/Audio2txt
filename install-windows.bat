@echo off
setlocal

echo Installing Node dependencies...
call npm install
if errorlevel 1 exit /b 1

echo.
echo Installing Python dependencies...
py -3.12 -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo.
echo Done. Start the app with start-windows.bat
