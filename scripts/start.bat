@echo off
setlocal
docker compose up -d --build
if errorlevel 1 exit /b %errorlevel%