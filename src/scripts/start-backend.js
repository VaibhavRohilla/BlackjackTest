/**
 * Helper script to start the backend server
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine the path to the backend directory
const backendDir = path.resolve(__dirname, '../../blackjack-backend');

// Check if the directory exists
if (!fs.existsSync(backendDir)) {
  console.error(`Backend directory not found at ${backendDir}`);
  process.exit(1);
}

// Check if we're on Windows or Unix
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('Starting backend server...');
console.log(`Backend directory: ${backendDir}`);

// Start the server with npm start
const server = spawn(npmCmd, ['start'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
});

server.on('error', (err) => {
  console.error('Failed to start backend server:', err);
});

server.on('close', (code) => {
  console.log(`Backend server exited with code ${code}`);
});

// Handle script termination
process.on('SIGINT', () => {
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  process.exit(0);
});

console.log('Backend server starting...');
console.log('Press Ctrl+C to stop'); 