@echo off
echo Starting local server...
echo.
echo Please choose a method:
echo 1. Python (if installed)
echo 2. Node.js (if installed)
echo.

set /p choice="Enter 1 or 2: "

if "%choice%"=="1" (
    echo Starting Python server on http://localhost:8000
    python -m http.server 8000
) else if "%choice%"=="2" (
    echo Starting Node.js server...
    npx serve -l 8000
) else (
    echo Invalid choice
    pause
)
