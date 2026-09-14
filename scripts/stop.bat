@echo off
setlocal
docker compose down
if errorlevel 1 exit /b %errorlevel%