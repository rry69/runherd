@echo off
rem Reset sesi Hermes: backup otomatis + archive sesi selesai (sesi terbuka aman).
rem Pemakaian: klik 2x = archive yang selesai saja | reset-hermes-sessions.bat all = archive SEMUA
setlocal
cd /d "%~dp0"
node scripts\reset-hermes.cjs %*
pause
