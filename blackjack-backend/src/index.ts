import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { BlackjackServer } from './server/blackjackserver';
import { ApiService } from './services/api.service';

// Load environment variables
dotenv.config();

// Server version
const SERVER_VERSION = '1.1.0';
const SERVER_START_TIME = new Date();

// Create Express application
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Initialize API service with environment
const apiService = ApiService.getInstance();
apiService.setEnvironment((process.env.NODE_ENV as 'test' | 'prod') || 'test');

// Initialize BlackjackServer
const blackjackServer = new BlackjackServer(wss);

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  const uptime = Math.floor((new Date().getTime() - SERVER_START_TIME.getTime()) / 1000);
  
  res.status(200).json({ 
    status: 'ok', 
    message: 'Blackjack server is running',
    version: SERVER_VERSION,
    uptime: `${uptime} seconds`,
    startTime: SERVER_START_TIME.toISOString(),
    environment: process.env.NODE_ENV || 'test'
  });
});


// Advanced health check with detailed metrics
app.get('/health/detailed', (req, res) => {
  const uptime = Math.floor((new Date().getTime() - SERVER_START_TIME.getTime()) / 1000);
  const memoryUsage = process.memoryUsage();
  
  res.status(200).json({
    status: 'ok',
    version: SERVER_VERSION,
    uptime: `${uptime} seconds`,
    startTime: SERVER_START_TIME.toISOString(),
    environment: process.env.NODE_ENV || 'test',
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
    },
  });
});

// Documentation endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Blackjack Game API',
    description: 'Backend API for blackjack game',
    version: SERVER_VERSION,
    environment: process.env.NODE_ENV || 'test',
    health: {
      '/health': 'Basic health check',
      '/health/detailed': 'Detailed metrics and diagnostics',
      '/api-test': 'Test API connectivity'
    },
    websocket: {
      endpoint: `ws://localhost:${process.env.PORT || 3001}`,
      protocol: 'See documentation for message format'
    },
    endpoints: {
      '/api/game/create': 'Create a new game session',
      '/api/game/:sessionId': 'Get game state',
      '/api/game/:sessionId/bet': 'Place a bet',
      '/api/game/:sessionId/deal': 'Deal cards',
      '/api/game/:sessionId/hit': 'Draw another card',
      '/api/game/:sessionId/stand': 'End turn',
      '/api/game/:sessionId/double': 'Double down',
      '/api/game/:sessionId/split': 'Split hand',
      '/api/game/:sessionId/insurance': 'Take insurance',
      '/api/game/:sessionId/surrender': 'Surrender hand',
      '/api/game/:sessionId/rebet': 'Repeat previous bet',
      '/api/game/:sessionId/clear': 'Clear current bet'
    }
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🃏 Blackjack server running on port ${PORT}`);
  console.log(`Version: ${SERVER_VERSION}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'test'}`);
  console.log(`Started at: ${SERVER_START_TIME.toISOString()}`);
  console.log(`HTTP: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  blackjackServer.shutdown();
  server.close(() => {
    console.log('Server shut down successfully');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Keep the server running but log the error
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);
  // Keep the server running but log the error
}); 