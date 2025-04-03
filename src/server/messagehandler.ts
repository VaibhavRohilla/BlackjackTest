import { BlackjackServer } from './blackjackserver';
import { ClientMessage, MessageType, createErrorMessage, ServerMessage, GameStateMessage } from '../models/message';
import { ApiService } from '../services/api.service';
import { DisconnectionHandler } from '../game/disconnectionhandler';

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
          
        case MessageType.PHASE_CHANGE:
          // Legacy support for CREATE_SESSION - just create/reset the game for this client
          if (message.data?.action === 'create_session') {
            this.handleNewGame(clientId);
          }
          // Legacy support for JOIN_SESSION - treat as getting current game state
          else if (message.data?.action === 'join_session') {
            this.handleGetGameState(clientId);
          }
          // Handle other phase change requests
          else {
            this.handleGetGameState(clientId);
          }
          break;
          
        case MessageType.PLACE_BET:
        case MessageType.HIT:
        case MessageType.STAND:
        case MessageType.DOUBLE_DOWN:
        case MessageType.SPLIT:
        case MessageType.SURRENDER:
        case MessageType.INSURANCE:
        case MessageType.REBET:
        case MessageType.CLEAR_BET:
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
      // Extract login data from message
      const loginData = message.data?.loginData;
      
      if (!loginData) {
        this.server.sendToClient(clientId, {
          type: MessageType.AUTH_FAILED,
          data: { error: 'Invalid authentication data' }
        });
        return;
      }
      
      // Get game session
      const gameSession = this.server.getGameForClient(clientId);
      if (!gameSession) {
        this.server.sendToClient(clientId, {
          type: MessageType.AUTH_FAILED,
          data: { error: 'No game session found' }
        });
        return;
      }
      
      // Authenticate player
      const success = await gameSession.authenticatePlayer(loginData);
      
      if (success) {
        // Check for saved game state
        try {
          console.log(`Checking for saved game state for user ${loginData.userId}`);
          
          // Use the disconnection handler to get saved game state
          const disconnectionHandler = DisconnectionHandler.getInstance();
          const savedState = await disconnectionHandler.getSavedGameState(loginData);
          
          if (savedState) {
            // Only restore if not in betting or complete phase
            if (savedState.gamePhase !== 'betting' && savedState.gamePhase !== 'complete') {
              console.log(`Restoring saved game state: ${savedState.gamePhase}`);
              
              // Restore the game state
              await gameSession.restoreGameState(savedState);
              
              // Clear the saved game state after successful restoration
              await disconnectionHandler.clearSavedGameState(loginData);
              
              // Send success message with restored state flag
              this.server.sendToClient(clientId, {
                type: MessageType.AUTH_SUCCESS,
                data: { 
                  message: 'Authentication successful - restored saved game',
                  user: gameSession.getPlayerData(),
                  restoredState: true
                }
              });
              
              // Send game state immediately
              gameSession.sendGameState();
              return;
            } else if (savedState.completedOffline) {
              // Handle the case where the game was completed offline
              console.log('Game was completed while player was offline, showing results');
              
              // Send special message about offline completion
              this.server.sendToClient(clientId, {
                type: MessageType.AUTH_SUCCESS,
                data: { 
                  message: 'Authentication successful - game was completed offline',
                  user: gameSession.getPlayerData(),
                  offlineCompletion: true,
                  gameOutcome: savedState.outcome,
                  payout: savedState.payout,
                  playerHand: savedState.playerHand,
                  dealerHand: savedState.dealerHand
                }
              });
              
              // Clear the saved game state
              await disconnectionHandler.clearSavedGameState(loginData);
              return;
            } else {
              console.log('Saved game state is in betting/complete phase, not restoring');
            }
          } else {
            console.log('No valid saved game state found');
          }
        } catch (error) {
          // Just log the error but continue with normal auth flow
          console.error('Error checking for saved game state:', error);
        }

        // Send success message with user data (no restored state)
        this.server.sendToClient(clientId, {
          type: MessageType.AUTH_SUCCESS,
          data: { 
            message: 'Authentication successful',
            user: gameSession.getPlayerData()
          }
        });
      }
      // Authentication failed handling occurs in the authenticatePlayer method
    } catch (error) {
      console.error(`Error authenticating client ${clientId}:`, error);
      this.server.sendToClient(clientId, {
        type: MessageType.AUTH_FAILED,
        data: { error: 'Authentication failed due to server error' }
      });
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
        type: MessageType.PHASE_CHANGE,
        data: { 
          from: 'none',
          to: 'betting',
          message: "New game created" 
        }
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
          // Send PHASE_CHANGE to notify client
          this.server.sendToClient(clientId, {
            type: MessageType.PHASE_CHANGE,
            data: { 
              from: 'none',
              to: 'betting',
              message: "Game is ready to play" 
            }
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
  public async handleGameAction(clientId: string, message: ClientMessage): Promise<void> {
    const gameSession = this.server.getGameForClient(clientId);
    
    if (!gameSession) {
        throw new Error('No active game session found');
    }

    try {
        // Process the action
        gameSession.handleGameAction(message.type, message.data);

        // Send updated game state
        gameSession.sendGameState();

    } catch (error) {
        console.error('Error handling game action:', error);
        // Send error message to client
        this.server.sendToClient(clientId, createErrorMessage(
            error instanceof Error ? error.message : 'An unknown error occurred'
        ));
        
        // Send updated game state to ensure client is in sync
        if (gameSession) {
            gameSession.sendGameState();
        }
    }
  }

  private isValidActionForPhase(action: MessageType, phase: string): boolean {
    const validActions: Record<string, MessageType[]> = {
      'betting': [
        MessageType.PLACE_BET, 
        MessageType.START_GAME,
        MessageType.REBET,
        MessageType.CLEAR_BET
      ],
      'dealing': [
        MessageType.START_GAME,
        MessageType.INSURANCE
      ],
      'player_turn': [
        MessageType.HIT, 
        MessageType.STAND, 
        MessageType.DOUBLE_DOWN, 
        MessageType.SPLIT, 
        MessageType.SURRENDER,
        MessageType.INSURANCE
      ],
      'dealer_turn': [],
      'complete': [
        MessageType.START_GAME,
        MessageType.PLACE_BET,
        MessageType.REBET,
        MessageType.PHASE_CHANGE
      ]
    };

    return validActions[phase]?.includes(action) ?? false;
  }

  private validateActionParameters(action: MessageType, parameters: any): boolean {
    switch (action) {
      case MessageType.PLACE_BET:
      case MessageType.START_GAME:
        return typeof parameters?.amount === 'number' && parameters.amount > 0;
      
      case MessageType.INSURANCE:
        return typeof parameters?.takeInsurance === 'boolean';
      
      case MessageType.DOUBLE_DOWN:
        return typeof parameters?.amount === 'number' && parameters.amount > 0;
      
      case MessageType.HIT:
      case MessageType.STAND:
      case MessageType.SURRENDER:
      case MessageType.SPLIT:
      case MessageType.REBET:
      case MessageType.CLEAR_BET:
      case MessageType.PHASE_CHANGE:
        // These actions don't require parameters
        return !parameters || Object.keys(parameters).length === 0;
      
      default:
        return false;
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