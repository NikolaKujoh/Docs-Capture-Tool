@echo off
setlocal
pushd "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Prvo pokreni Setup Backend.cmd.
  popd
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m onscreen
popd
pause
