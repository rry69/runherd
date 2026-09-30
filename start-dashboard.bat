@echo off
REM Dashboard Agent - production server di port 1122
cd /d "%~dp0"
if not exist ".next" (
  echo Build belum ada, menjalankan npm run build...
  call npm run build
)
echo Menjalankan dashboard di http://localhost:1122
call npm run start -- -p 1122
pause
