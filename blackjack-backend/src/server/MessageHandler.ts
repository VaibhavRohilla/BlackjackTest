import { BlackjackServer } from './BlackjackServer';
import { ClientMessage, MessageType, createErrorMessage, ServerMessage } from '../models/Message';

/**
 * Tracks client message rate for rate limiting
 */
interface ClientMessageRate {
  clientId: string;
  messageCount: number;
  lastReset: number;
}

/**
 * Handles websocket messages from clients and routes them to the appropriate handlers
 * with validation, error handling, and rate limiting
 */
export class MessageHandler {
  private server: BlackjackServer;
  
  // Rate limiting configuration
  private readonly MAX_MESSAGES_PER_MINUTE = 120; // 2 messages per second on average
  private readonly RATE_LIMIT_RESET_MS = 60000; // 1 minute
  private clientMessageRates: Map<string, ClientMessageRate> = new Map();
  
  constructor(server: BlackjackServer) {
    this.server = server;
  }

  /**
   * Process an incoming client message with validation and rate limiting
   */
  public handleMessage(clientId: string, message: ClientMessage): void {
    try {
      // Apply rate limiting
      if (this.isRateLimited(clientId)) {
        this.server.sendToClient(clientId, createErrorMessage(
          'Rate limit exceeded. Please slow down your requests.'));
        return;
      }
      
      // Basic validation
      if (!this.validateMessage(message)) {
        this.server.sendToClient(clientId, createErrorMessage('Invalid message format'));
        return;
      }
      
      // Route the message based on type
      switch (message.type) {
        case MessageType.CREATE_SESSION:
          // Legacy support - just create/reset the game for this client
          this.handleNewGame(clientId);
          break;
          
        case MessageType.JOIN_SESSION:
          // Legacy support - treat as getting current game state
          this.handleGetGameState(clientId);
          break;
          
        case MessageType.PLACE_BET:
        case MessageType.DEAL_CARDS:
        case MessageType.HIT:
        case MessageType.STAND:
        case MessageType.DOUBLE_DOWN:
        case MessageType.SPLIT:
        case MessageType.SURRENDER:
        case MessageType.INSURANCE:
        case MessageType.REBET:
        case MessageType.CLEAR_BET:
        case MessageType.RETURN_TO_BETTING:
          this.handleGameAction(clientId, message);
          break;
          
        default:
          console.warn(`Unhandled message type: ${message.type}`);
          this.server.sendToClient(clientId, createErrorMessage(`Unsupported message type: ${message.type}`));
      }
    } catch (error) {
      // Log the error with full context
      console.error(`Error handling message ${message?.type || 'unknown'} from client ${clientId}:`, error);
      console.error('Message content:', JSON.stringify(message));
      
      // Send a friendly error message to the client
      this.server.sendToClient(clientId, createErrorMessage(
        error instanceof Error ? error.message : 'Internal server error'));
    }
  }
  
  /**
   * Check if client's message rate exceeds the limit
   */
  private isRateLimited(clientId: string): boolean {
    const now = Date.now();
    let clientRate = this.clientMessageRates.get(clientId);
    
    // Initialize rate tracking for new clients
    if (!clientRate) {
      clientRate = {
        clientId,
        messageCount: 0,
        lastReset: now
      };
      this.clientMessageRates.set(clientId, clientRate);
    }
    
    // Reset counter if time period has elapsed
    if (now - clientRate.lastReset > this.RATE_LIMIT_RESET_MS) {
      clientRate.messageCount = 0;
      clientRate.lastReset = now;
    }
    
    // Increment message count
    clientRate.messageCount++;
    
    // Check if rate limit is exceeded
    if (clientRate.messageCount > this.MAX_MESSAGES_PER_MINUTE) {
      console.warn(`Client ${clientId} exceeded rate limit: ${clientRate.messageCount} messages in the last minute`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Validate message format and content
   */
  private validateMessage(message: ClientMessage): boolean {
    // Basic format validation
    if (!message || typeof message !== 'object') {
      return false;
    }
    
    // Message type validation
    if (!message.type || !Object.values(MessageType).includes(message.type as MessageType)) {
      return false;
    }
    
    return true;
  }

  /**
   * Handle a request to create a new game
   */
  private handleNewGame(clientId: string): void {
    try {
      this.server.createGameForClient(clientId);
      
      this.server.sendToClient(clientId, {
        type: MessageType.GAME_READY,
        data: { message: "New game created" }
      });
    } catch (error) {
      console.error(`Error creating game for client ${clientId}:`, error);
      this.server.sendToClient(clientId, createErrorMessage(
        error instanceof Error ? error.message : 'Failed to create new game'));
    }
  }

  /**
   * Handle a request to get current game state
   */
  private handleGetGameState(clientId: string): void {
    const game = this.server.getGameForClient(clientId);
    
    if (!game) {
      // No game exists yet, create one
      try {
        this.server.createGameForClient(clientId);
        
        // Get the newly created game
        const newGame = this.server.getGameForClient(clientId);
        if (newGame) {
          // Send GAME_READY first to notify client
          this.server.sendToClient(clientId, {
            type: MessageType.GAME_READY,
            data: { message: "Game is ready to play" }
          });
          
          // Then immediately send the game state so buttons can appear
          setTimeout(() => {
            newGame.sendGameState(clientId);
          }, 100);
        }
      } catch (error) {
        console.error(`Error creating new game for client ${clientId}:`, error);
        this.server.sendToClient(clientId, createErrorMessage(
          error instanceof Error ? error.message : 'Failed to create new game'));
      }
      return;
    }
    
    try {
      // Send the current game state to the client
      game.sendGameState(clientId);
    } catch (error) {
      console.error(`Error sending game state to client ${clientId}:`, error);
      this.server.sendToClient(clientId, createErrorMessage(
        error instanceof Error ? error.message : 'Failed to get game state'));
    }
  }

  /**
   * Handle game-specific action
   */
  private handleGameAction(clientId: string, message: ClientMessage): void {
    const game = this.server.getGameForClient(clientId);
    
    if (!game) {
      // No game exists, create one and send game state
      this.server.sendToClient(clientId, createErrorMessage('No active game found. Creating a new game.'));
      this.handleNewGame(clientId);
      return;
    }
    
    try {
      // Process the game action
      game.handleAction(message);
    } catch (error) {
      console.error(`Error processing game action ${message.type} for client ${clientId}:`, error);
      
      // Send error to client
      this.server.sendToClient(clientId, createErrorMessage(
        error instanceof Error ? error.message : `Error processing action: ${message.type}`
      ));
      
      // Ensure game state is sent to keep client and server in sync
      try {
        game.sendGameState(clientId);
      } catch (stateError) {
        console.error(`Failed to send game state after error:`, stateError);
      }
    }
  }
} 