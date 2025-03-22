#!/bin/bash

# Blackjack Backend Server Startup Script

# Ensure we're in the correct directory
cd "$(dirname "$0")/.."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build the project if needed
if [ ! -d "dist" ]; then
  echo "Building project..."
  npm run build
fi

# Start the server
echo "Starting Blackjack backend server..."
npm run dev 