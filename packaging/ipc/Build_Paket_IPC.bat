@echo off
rem Build satu paket siap-copy untuk IPC (Windows):
rem   1. build frontend  2. build ValveDatabase.exe (Wails)  3. rakit folder + zip
rem Hasil: OUTPUTS\Test-Bench-Report-Generator\YYMMDD_Paket_IPC_ValveDatabase_ID.zip
rem Jalankan dengan klik dua kali, atau dari terminal: packaging\ipc\Build_Paket_IPC.bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build_Paket_IPC.ps1"
if errorlevel 1 (
  echo.
  echo BUILD GAGAL. Baca pesan error di atas.
  pause
  exit /b 1
)
echo.
pause
