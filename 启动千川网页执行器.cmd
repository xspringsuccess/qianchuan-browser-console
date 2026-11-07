@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local-executor.ps1"
if errorlevel 1 (
  echo Executor startup failed. See the error above.
  pause
  exit /b 1
)
