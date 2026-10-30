@echo off
setlocal
pushd "%~dp0frontend"
where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher nije dostupan. Pokreni: python -m http.server 8080 --bind 127.0.0.1 --directory frontend
  pause
  popd
  exit /b 1
)
echo OnScreen frontend demo: http://127.0.0.1:8080
echo Otvori ovu adresu u browseru. Ctrl+C za zaustavljanje.
echo Demo ne menja Excel fajlove.
py -3 -m http.server 8080 --bind 127.0.0.1
popd
