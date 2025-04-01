import { BlackjackServer } from './blackjackserver';
import { ClientMessage, MessageType, createErrorMessage, ServerMessage } from '../models/message';
import { ApiService } from '../services/api.service';

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
  private apiService: ApiService;
  
  // Rate limiting configuration
  private readonly MAX_MESSAGES_PER_MINUTE = 120; // 2 messages per second on average
  private readonly RATE_LIMIT_RESET_MS = 60000; // 1 minute
  private clientMessageRates: Map<string, ClientMessageRate> = new Map();
  
  constructor(server: BlackjackServer) {
    this.server = server;
    this.apiService = ApiService.getInstance();
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
        case MessageType.AUTHENTICATE:
          this.handleAuthenticate(clientId, message);
          break;
          
        case MessageType.CREATE_SESSION:
          // Legacy support - just create/reset the game for this client
          this.handleNewGame(clientId);
          break;
          
        case MessageType.JOIN_SESSION:
          // Legacy support - treat as getting current game state
          this.handleGetGameState(clientId);
          break;
          
        case MessageType.GET_PLAYER_DATA:
        case MessageType.GET_GAME_STATE:
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
          
        case MessageType.START_GAME:
          this.handleStartGame(clientId, message.data.amount);
          break;
          
        case MessageType.GET_LEADERBOARD:
          this.handleGetLeaderboard(clientId);
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

  private async handleAuthenticate(clientId: string, message: ClientMessage): Promise<void> {
    try {
      if (!message.data?.loginData) {
        this.server.sendToClient(clientId, createErrorMessage('Missing authentication data.'));
        return;
      }

      // Get or create game session for this client
      const gameSession = this.server.getOrCreateGameSession(clientId);
      
      // Authenticate the player
      const authSuccess = await gameSession.authenticatePlayer(message.data.loginData);
      
      if (!authSuccess) {
        console.error(`Authentication failed for client ${clientId}`);
        return;
      }

      // Send success message with user data
      this.server.sendToClient(clientId, {
        type: MessageType.AUTH_SUCCESS,
        data: { 
          message: 'Authentication successful',
          user: gameSession.getPlayerData()
        }
      });
      
    } catch (error) {
      console.error(`Error authenticating client ${clientId}:`, error);
      this.server.sendToClient(clientId, createErrorMessage('Authentication error.'));
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
      this.server.getOrCreateGameSession(clientId);
      
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
        this.server.getOrCreateGameSession(clientId);
        
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
    const gameSession = this.server.getGameForClient(clientId);
    
    if (!gameSession) {
      // No game exists, create one and send game state
      this.server.sendToClient(clientId, createErrorMessage('No active game found. Creating a new game.'));
      this.handleNewGame(clientId);
      return;
    }
    
    try {
      // Process the game action
      gameSession.handleAction(message);
      
      // After handling the action, ensure we send the complete game state
      // This is especially important for game-ending actions
      if (['STAND', 'HIT', 'DOUBLE_DOWN', 'SURRENDER'].includes(message.type)) {
        // For game-ending actions, ensure we send both the action result and game state
        gameSession.sendGameState(clientId);
        
        // Send a final game state after a short delay to ensure proper transition
        setTimeout(() => {
          gameSession.sendGameState(clientId);
          // After sending final state, return to betting phase if needed
          gameSession.returnToBettingPhase();
        }, 500);
      }
    } catch (error) {
      console.error(`Error processing game action ${message.type} for client ${clientId}:`, error);
      
      // Send error to client
      this.server.sendToClient(clientId, createErrorMessage(
        error instanceof Error ? error.message : `Error processing action: ${message.type}`
      ));
      
      // Ensure game state is sent to keep client and server in sync
      try {
        gameSession.sendGameState(clientId);
      } catch (stateError) {
        console.error(`Failed to send game state after error:`, stateError);
      }
    }
  }

  private handleStartGame(clientId: string, betAmount: number): void {
    const game = this.server.getGameForClient(clientId);
    if (!game) {
      this.server.sendToClient(clientId, createErrorMessage('No active game found.'));
      return;
    }

    try {
      game.startGame(betAmount);
    } catch (error: unknown) {
      this.server.sendToClient(clientId, createErrorMessage(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private async handleGetLeaderboard(clientId: string): Promise<void> {
    try {
      const gameSession = this.server.getGameForClient(clientId);
      if (!gameSession) {
        this.server.sendToClient(clientId, createErrorMessage('No active game session found'));
        return;
      }

      const loginData = gameSession.getLoginData();
      if (!loginData || !loginData.userId) {
        this.server.sendToClient(clientId, createErrorMessage('Player not authenticated'));
        return;
      }

      console.log('Requesting leaderboard data for user:', loginData.userId);
      const response = await this.apiService.getLeaderboard(loginData);
      console.log('Leaderboard API response:', JSON.stringify(response, null, 2));
      
      if (response.success && response.data) {
        console.log('Sending leaderboard data to client:', JSON.stringify(response.data, null, 2));
        this.server.sendToClient(clientId, {
          type: MessageType.LEADERBOARD_DATA,
          data: {
            entries: response.data
          }
        });
      } else {
        console.error('Failed to get leaderboard data:', response.error);
        this.server.sendToClient(clientId, createErrorMessage(
          response.error || 'Failed to get leaderboard data'
        ));
      }
    } catch (error) {
      console.error(`Error getting leaderboard for client ${clientId}:`, error);
      this.server.sendToClient(clientId, createErrorMessage('Failed to get leaderboard data'));
    }
  }
} 