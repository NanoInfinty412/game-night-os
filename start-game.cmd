@echo off
rem Game Night OS: one double-click to install, build and start the game on Windows.
cd /d "%~dp0"
title Game Night OS

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it with:  winget install OpenJS.NodeJS.LTS
  echo Then close this window and double-click start-game.cmd again.
  pause
  exit /b 1
)

echo Installing (first time takes a minute)...
call npx.cmd --yes pnpm@10.28.0 install
if errorlevel 1 goto failed

echo Building the game screens...
call npx.cmd --yes pnpm@10.28.0 --filter @gno/web build
if errorlevel 1 goto failed

echo.
echo Starting Game Night. If Windows asks about the firewall, allow Node.js on PRIVATE networks.
echo Open the TV address printed below on your TV (or in the Game Night TV app). Close this window to stop.
echo.
call npx.cmd --yes pnpm@10.28.0 --filter @gno/server start
goto end

:failed
echo.
echo Something went wrong above. Take a photo of this window and send it over.
pause
exit /b 1

:end
pause
