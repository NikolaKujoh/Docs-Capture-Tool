@echo off
setlocal
pushd "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install -e ".[dev]"
if errorlevel 1 goto failed
echo Setup zavrsen. Pokreni Launch OnScreen.cmd.
popd
pause
exit /b 0
:failed
echo Setup nije uspeo. Potreban je Python 3.10+ i pristup package index-u.
popd
pause
exit /b 1
