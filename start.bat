@echo off
REM Starts the backend (port 4000) and frontend (port 3000) fully detached.
pushd "%~dp0"

pushd backend
start "Laptop-Backend" /min cmd /k "node server.js"
popd

pushd frontend
start "Laptop-Frontend" /min cmd /k "npm run dev -- --port 3695"
popd