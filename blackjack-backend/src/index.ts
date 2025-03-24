import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { BlackjackServer } from './server/blackjackserver';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enable CORS
app.use(cors());

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Create WebSocket server
const blackjackServer = new BlackjackServer(wss);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Documentation endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Blackjack Game Server',
    description: 'WebSocket server for blackjack game',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    websocket: {
      endpoint: `ws://localhost:${PORT}`,
      protocol: 'See documentation for message format'
    }
  });
}); 