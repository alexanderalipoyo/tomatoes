@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\android\build.ps1" -Mode Local %*
exit /b %errorlevel%
