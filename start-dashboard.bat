@echo off
REM Dashboard Agent - production server di port 1122
cd /d "%~dp0"
echo Building dashboard...
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
echo Menjalankan dashboard di http://localhost:1122
call npm run start -- -p 1122
pause
