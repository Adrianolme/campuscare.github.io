@echo off
cd /d "%~dp0"
echo ==============================================
echo  CampusCare - servidor local
echo  Abre en Chrome o Edge: http://localhost:8080
echo  Para detenerlo presiona Ctrl + C
echo ==============================================
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8080
) else (
  npx --yes serve -l 8080 .
)
