@echo off
cd /d "%~dp0"
start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "%~dp0app\Launch.ps1"
