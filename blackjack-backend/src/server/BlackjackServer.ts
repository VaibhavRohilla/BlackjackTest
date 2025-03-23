import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { MessageType, ServerMessage, ClientMessage, createErrorMessage } from '../models/message';
import { GameSession } from '../game/gamesession';
import { MessageHandler } from './messagehandler';

/**
 * Main Blackjack server class that manages WebSocket connections
 * and message routing
 */
export class BlackjackServer {
  private wss: WebSocket.Server;
  private clients: Map<string, WebSocket> = new Map();
  private clientGames: Map<string, GameSession> = new Map();
  private messageHandler: MessageHandler;
  
  constructor(wss: WebSocket.Server) {
    this.wss = wss;
    this.messageHandler = new MessageHandler(this);
    this.initialize();
  }

  private initialize(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      // Assign a unique ID to each client
      const clientId = uuidv4();
      this.clients.set(clientId, ws);

      console.log(`Client connected: ${clientId}`);
      
      // Create a game session immediately for this client
      this.createGameForClient(clientId);
      
      // Send welcome message
      this.sendToClient(clientId, {
        type: MessageType.CONNECTED,
        data: { clientId }
      });

      // Handle client messages
      ws.on('message', (message: string) => {
        try {
          const parsedMessage = JSON.parse(message) as ClientMessage;
          
          // Log incoming message (excluding sensitive data)
          console.log(`Received from ${clientId}: ${parsedMessage.type}`);
          
          // Process the message
          this.messageHandler.handleMessage(clientId, parsedMessage);
        } catch (error) {
          console.error(`Error processing message from ${clientId}:`, error);
          this.sendToClient(clientId, createErrorMessage('Invalid message format'));
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        
        // Clean up the client's game
        this.clientGames.delete(clientId);
        
        // Remove client from the map
        this.clients.delete(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });
    });
  }

  /**
   * Send a message to a specific client
   */
  public sendToClient(clientId: string, message: ServerMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to client ${clientId}:`, error);
      }
    } else {
      console.warn(`Cannot send message to client ${clientId}: client not found or connection not open`);
    }
  }

  /**
   * Create a new game for a client
   */
  public createGameForClient(clientId: string): void {
    // Verify client exists
    if (!this.clients.has(clientId)) {
      throw new Error(`Cannot create game: client ${clientId} not found`);
    }
    
    // Remove any existing game for this client
    if (this.clientGames.has(clientId)) {
      this.clientGames.delete(clientId);
    }
    
    // Create a new game session with direct client ID (no session ID needed)
    const game = new GameSession(clientId, clientId, this);
    
    // Store the game associated with this client
    this.clientGames.set(clientId, game);
    
    console.log(`Created new game for client ${clientId}`);
    
    // Send a notification that game is ready
    this.sendToClient(clientId, {
      type: MessageType.GAME_READY,
      data: { message: "Game is ready to play" }
    });
  }

  /**
   * Get the game associated with a client
   */
  public getGameForClient(clientId: string): GameSession | undefined {
    return this.clientGames.get(clientId);
  }

  /**
   * Reset a client's game (create a new one)
   */
  public resetClientGame(clientId: string): void {
    this.createGameForClient(clientId);
  }

  /**
   * Shutdown the server and cleanup resources
   */
  public shutdown(): void {
    // Close all client connections
    for (const [clientId, ws] of this.clients.entries()) {
      try {
        ws.close();
      } catch (error) {
        console.error(`Error closing connection for client ${clientId}:`, error);
      }
    }
    
    // Clear all maps
    this.clients.clear();
    this.clientGames.clear();
    
    // Close the WebSocket server
    this.wss.close();
    
    console.log('Blackjack server shutdown complete');
  }
} 