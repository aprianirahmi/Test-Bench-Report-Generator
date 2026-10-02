@echo off
rem Windows version of build-frontend.sh. Builds the Vue frontend in
rem "embedded" mode (relative /api, same origin as the page) and copies
rem it into backend\assets\frontend_dist for //go:embed.
rem Run from anywhere:  backend\build-frontend.bat
setlocal
cd /d "%~dp0"

if exist assets\frontend_dist rmdir /s /q assets\frontend_dist
mkdir assets\frontend_dist

pushd ..\frontend
call npm install
if errorlevel 1 goto :fail
set VITE_EMBEDDED=true
call npm run build
if errorlevel 1 goto :fail
popd

xcopy /e /i /y "..\frontend\dist" "assets\frontend_dist" >nul
if errorlevel 1 goto :fail
type nul > assets\frontend_dist\.gitkeep
echo frontend built into backend\assets\frontend_dist\
exit /b 0

:fail
echo build failed
popd
exit /b 1
