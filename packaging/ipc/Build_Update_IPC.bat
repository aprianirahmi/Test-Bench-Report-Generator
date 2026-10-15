@echo off
rem Mode UPDATE: build ulang lalu hasilkan ValveDatabase.exe saja (tanpa zip, tanpa .env).
rem Hasil: OUTPUTS\Test-Bench-Report-Generator\Update_IPC_YYMMDD_HHmm\ValveDatabase.exe
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build_Paket_IPC.ps1" -HanyaExe
if errorlevel 1 (
  echo.
  echo BUILD GAGAL. Baca pesan error di atas.
  pause
  exit /b 1
)
echo.
pause
