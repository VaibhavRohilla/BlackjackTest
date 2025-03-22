@echo off
REM Blackjack Backend Server Startup Script

REM Ensure we're in the correct directory
cd %~dp0\..

REM Install dependencies if needed
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

REM Build the project if needed
if not exist dist (
  echo Building project...
  call npm run build
)

REM Start the server
echo Starting Blackjack backend server...
call npm run dev 