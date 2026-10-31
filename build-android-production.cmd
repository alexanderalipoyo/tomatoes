@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\android\build.ps1" -Mode Production %*
exit /b %errorlevel%
