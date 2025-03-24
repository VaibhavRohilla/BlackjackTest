import { WebSocket, WebSocketServer } from 'ws';
import { GameSession } from '../game/gamesession';
import { MessageHandler } from './messagehandler';
import { ClientMessage, ServerMessage, MessageType } from '../models/message';

/**
 * Extended WebSocket interface with custom properties
 */
interface CustomWebSocket extends WebSocket {
  clientId?: string;
}

/**
 * Manages WebSocket connections and message routing
 */
export class BlackjackServer {
  private gameSessions: Map<string, GameSession> = new Map();
  private messageHandler: MessageHandler;

  constructor(private wss: WebSocketServer) {
    this.messageHandler = new MessageHandler(this);
    this.setupWebSocketServer();
  }

  /**
   * Set up the WebSocket server with connection handling
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: CustomWebSocket) => {
      const clientId = this.generateClientId();
      ws.clientId = clientId; // Store client ID on the WebSocket instance
      console.log(`New client connected: ${clientId}`);

      // Create a new game session for this client
      const gameSession = new GameSession(clientId, '', this);
      this.gameSessions.set(clientId, gameSession);

      // Set up message handling for this connection
      ws.on('message', (message: string) => {
        try {
          const clientMessage: ClientMessage = JSON.parse(message);
          this.messageHandler.handleMessage(clientId, clientMessage);
        } catch (error) {
          console.error(`Error processing message from client ${clientId}:`, error);
          this.sendToClient(clientId, {
            type: MessageType.ERROR,
            data: {
              message: 'Invalid message format',
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        this.gameSessions.delete(clientId);
      });

      // Send initial connection message
      this.sendToClient(clientId, {
        type: MessageType.CONNECTED,
        data: {
          clientId: clientId,
          message: 'Connected to blackjack server'
        }
      });
    });
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Send a message to a specific client
   */
  public sendToClient(clientId: string, message: ServerMessage): void {
    const ws = this.getClientWebSocket(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn(`Cannot send message to client ${clientId} - connection not open`);
    }
  }

  /**
   * Get the WebSocket connection for a client
   */
  private getClientWebSocket(clientId: string): CustomWebSocket | undefined {
    // Find the WebSocket connection for this client
    for (const client of this.wss.clients) {
      const customClient = client as CustomWebSocket;
      if (customClient.clientId === clientId) {
        return customClient;
      }
    }
    return undefined;
  }

  /**
   * Get a game session for a client
   */
  public getGameForClient(clientId: string): GameSession | undefined {
    return this.gameSessions.get(clientId);
  }

  /**
   * Handle client disconnection
   */
  public handleClientDisconnect(clientId: string): void {
    const gameSession = this.gameSessions.get(clientId);
    if (gameSession) {
      gameSession.cleanup();
      this.gameSessions.delete(clientId);
    }
  }
} 