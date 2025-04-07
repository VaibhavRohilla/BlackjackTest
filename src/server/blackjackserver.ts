import { WebSocket, WebSocketServer } from 'ws';
import { GameSession } from '../game/gamesession';
import { MessageHandler } from '../server/messagehandler';
import { ClientMessage, ServerMessage, MessageType, createErrorMessage } from '../models/message';
import { DisconnectionHandler } from '../game/disconnectionhandler';
import { ApiService } from '../services/api.service';

/**
 * BlackjackServer
 * 
 * This server implements a simplified WebSocket messaging protocol for blackjack:
 * 
 * 1. START_GAME - Sent when starting a new game with initial state
 * 2. CARD_DEALT - Sent for each card dealt with target and card data
 * 3. PHASE_CHANGE - Sent when game phase changes (betting, player_turn, dealer_turn, complete)
 * 4. GAME_END - Sent at game end with outcome, payout, balance and bet information
 * 
 * Additionally, SPECIAL_CASE is sent for insurance and split options,
 * and standard ERROR messages for error conditions.
 * 
 * This simplified protocol reduces message types and makes the system more robust.
 */

/**
 * Extended WebSocket interface with custom properties
 */
interface CustomWebSocket extends WebSocket {
  clientId?: string;
  userId?: string;
  isAlive?: boolean;
  lastActivity?: number;
}

/**
 * Manages WebSocket connections and message routing
 */
export class BlackjackServer {
  private gameSessions: Map<string, GameSession> = new Map();
  private userIdToClientId: Map<string, string> = new Map(); // Track userId to clientId mapping
  private messageHandler: MessageHandler;
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionCleanupInterval: NodeJS.Timeout | null = null;
  
  // Connection monitoring configuration
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly INACTIVE_TIMEOUT = 300000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  constructor(private wss: WebSocketServer) {
    this.messageHandler = new MessageHandler(this);
    this.setupWebSocketServer();
    this.setupConnectionMonitoring();
  }

  /**
   * Set up the WebSocket server with connection handling
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: CustomWebSocket, req: any) => {
      try {
        // Set initial WebSocket state
        const clientId = this.generateClientId();
        ws.clientId = clientId;
        ws.isAlive = true;
        ws.lastActivity = Date.now();
        
        // Extract userId from URL query parameters if available
        let userId = '';
        try {
          if (req.url) {
            const url = new URL(`http://localhost${req.url}`);
            userId = url.searchParams.get('userId') || '';
            ws.userId = userId;
          }
        } catch (error) {
          console.error(`Error extracting userId from URL:`, error);
        }

        console.log(`New client connected: ${clientId}${userId ? `, userId: ${userId}` : ''}`);

        // Handle existing connection for this user
        this.handleExistingConnection(userId, clientId, ws);

        // Create a new game session for this client
        const gameSession = new GameSession(clientId, '', this);
        this.gameSessions.set(clientId, gameSession);
        
        // Store userId to clientId mapping if available
        if (userId) {
          this.userIdToClientId.set(userId, clientId);
        }

        // Extract login data from URL and set in game session
        this.extractAndSetLoginData(req, gameSession);

        // Send initial connection message
        this.sendToClient(clientId, {
          type: MessageType.CONNECTED,
          data: {
            clientId: clientId,
            message: 'Connected to blackjack server'
          }
        });

        // Auto-authenticate the user if login data is available
        this.autoAuthenticateUser(clientId, gameSession);

        // Set up WebSocket event handlers
        this.setupWebSocketEventHandlers(ws, clientId);
      } catch (error) {
        console.error('Error handling new connection:', error);
        try {
          ws.close(1011, 'Server error during connection setup');
        } catch (closeError) {
          console.error('Error closing problematic connection:', closeError);
        }
      }
    });
  }

  /**
   * Handle existing connection for a user - close previous connection if exists
   */
  private handleExistingConnection(userId: string, newClientId: string, newWs: CustomWebSocket): void {
    if (userId && this.userIdToClientId.has(userId)) {
      const existingClientId = this.userIdToClientId.get(userId);
      console.log(`User ${userId} already has active connection ${existingClientId}, closing old connection`);
      
      // First update mapping to prevent race conditions
      this.userIdToClientId.set(userId, newClientId);
      
      // Save game session state for transfer if needed
      const existingSession = this.gameSessions.get(existingClientId!);
      let savedLoginData = null;
      if (existingSession) {
        savedLoginData = existingSession.getLoginData();
      }
      
      // Remove old game session
      this.gameSessions.delete(existingClientId!);
      
      // Then close existing connection
      const existingWs = this.getClientWebSocket(existingClientId!);
      if (existingWs) {
        try {
          existingWs.close(1000, 'Replaced by newer connection');
        } catch (error) {
          console.error(`Error closing existing connection for ${userId}:`, error);
        }
      }
      
      // If we have login data from old session, transfer it to new session
      if (savedLoginData) {
        const newSession = new GameSession(newClientId, '', this);
        newSession.setLoginData(savedLoginData);
        this.gameSessions.set(newClientId, newSession);
        console.log(`Transferred login data from old session to new session for ${userId}`);
      }
    }
  }
  
  /**
   * Extract login data from request URL and set in game session
   */
  private extractAndSetLoginData(req: any, gameSession: GameSession): void {
    try {
      if (req.url) {
        const url = new URL(`http://localhost${req.url}`);
        const userId = url.searchParams.get('userId');
        
        if (userId) {
          // Create login data object from URL parameters
          const loginData = {
            userId: userId,
            loginMethod: url.searchParams.get('loginMethod') || '',
            jwt: url.searchParams.get('jwt') || '',
            timestamp: parseInt(url.searchParams.get('timestamp') || '0', 10)
          };
          
          // Add any other parameters that might be in the URL
          url.searchParams.forEach((value, key) => {
            if (!['userId', 'loginMethod', 'jwt', 'timestamp'].includes(key)) {
              // @ts-ignore - Add unknown properties without type error
              loginData[key] = value;
            }
          });
          
          // Set login data in game session
          gameSession.setLoginData(loginData);
          console.log(`Extracted login data from URL: userId=${userId}`);
        }
      }
    } catch (error) {
      console.error(`Error extracting login data from URL:`, error);
    }
  }
  
  /**
   * Set up WebSocket event handlers for a client
   */
  private setupWebSocketEventHandlers(ws: CustomWebSocket, clientId: string): void {
    // Handle pong responses for connection monitoring
    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastActivity = Date.now();
    });
    
    // Handle client messages
    ws.on('message', (message: string) => {
      try {
        // Update activity timestamp
        ws.lastActivity = Date.now();
        
        // Parse and handle message
        const clientMessage: ClientMessage = JSON.parse(message);
        this.messageHandler.handleMessage(clientId, clientMessage);
      } catch (error) {
        console.error(`Error processing message from client ${clientId}:`, error);
        this.sendToClient(clientId, createErrorMessage(
          error instanceof Error ? error.message : 'Invalid message format'
        ));
      }
    });

    // Handle client disconnection
    ws.on('close', (code: number, reason: string) => {
      console.log(`Client disconnected: ${clientId}, code: ${code}, reason: ${reason || 'No reason provided'}`);
      this.handleClientDisconnection(clientId);
    });
    
    // Handle connection errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      // Close the connection on error
      try {
        ws.close(1011, 'Connection error');
      } catch (closeError) {
        console.error(`Error closing connection after error for client ${clientId}:`, closeError);
      }
      this.handleClientDisconnection(clientId);
    });
  }

  /**
   * Handle client disconnection and clean up resources
   */
  private async handleClientDisconnection(clientId: string): Promise<void> {
    try {
      // Get the game session before we delete it
      const gameSession = this.gameSessions.get(clientId);
      
      if (gameSession) {
        // Handle disconnection based on game state
        this.handleDisconnection(gameSession);
        
        // Clean up userIdToClientId mapping if this client had a userId
        const loginData = gameSession.getLoginData();
        if (loginData && loginData.userId) {
          if (this.userIdToClientId.get(loginData.userId) === clientId) {
            console.log(`Removing userId mapping for ${loginData.userId}`);
            this.userIdToClientId.delete(loginData.userId);
          }
        }
      }
      
      // Remove the game session
      this.gameSessions.delete(clientId);
    } catch (error) {
      console.error(`Error handling disconnection for client ${clientId}:`, error);
    }
  }
  
  /**
   * Set up connection monitoring with ping/pong and inactive connection cleanup
   */
  private setupConnectionMonitoring(): void {
    // Set up ping interval to detect dead connections
    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((client) => {
        const ws = client as CustomWebSocket;
        
        if (ws.isAlive === false) {
          console.log(`Client ${ws.clientId} did not respond to ping, terminating connection`);
          return ws.terminate();
        }
        
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (error) {
          console.error(`Error sending ping to client ${ws.clientId}:`, error);
          ws.terminate();
        }
      });
    }, this.PING_INTERVAL);
    
    // Set up inactive connection cleanup
    this.connectionCleanupInterval = setInterval(() => {
      const now = Date.now();
      this.wss.clients.forEach((client) => {
        const ws = client as CustomWebSocket;
        
        if (ws.lastActivity && now - ws.lastActivity > this.INACTIVE_TIMEOUT) {
          console.log(`Client ${ws.clientId} inactive for too long, closing connection`);
          try {
            ws.close(1000, 'Connection timeout due to inactivity');
          } catch (error) {
            console.error(`Error closing inactive connection for client ${ws.clientId}:`, error);
            ws.terminate();
          }
        }
      });
    }, this.CLEANUP_INTERVAL);
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
      try {
        const messageStr = JSON.stringify(message);
        ws.send(messageStr);
        ws.lastActivity = Date.now(); // Update activity timestamp
      } catch (error) {
        console.error(`Error sending message to client ${clientId}:`, error);
        // Close the problematic connection
        try {
          ws.close(1011, 'Error sending message');
        } catch (closeError) {
          console.error(`Error closing problematic connection for client ${clientId}:`, closeError);
          ws.terminate();
        }
      }
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
   * Get or create a game session for a client
   */
  public getOrCreateGameSession(clientId: string): GameSession {
    // Check if a game already exists for this client
    const existingGame = this.gameSessions.get(clientId);
    if (existingGame) {
      console.log(`Game already exists for client ${clientId}, returning existing game`);
      return existingGame;
    }

    // Create a new game session
    console.log(`Creating new game for client ${clientId}`);
    const gameSession = new GameSession(clientId, '', this);
    this.gameSessions.set(clientId, gameSession);
    return gameSession;
  }

  /**
   * Handle client disconnection based on game state
   * @param gameSession The game session for the disconnected client
   */
  private async handleDisconnection(gameSession: GameSession): Promise<void> {
    try {
      const loginData = gameSession.getLoginData();
      
      // Only handle disconnection for authenticated players
      if (!loginData || !gameSession.isAuthenticated()) {
        console.log('Disconnected client was not authenticated, no state to save');
        return;
      }
      
      const gameState = gameSession.getGameState();
      const blackjackGame = gameSession.getGame();
      
      if (!gameState) {
        console.log('No game state available, nothing to handle for disconnection');
        return;
      }
      
      console.log(`Handling disconnection for client with game phase: ${gameState.gamePhase}`);
      
      // Special handling for split hands - verify split data is properly set before saving
      if (gameState.hasSplit === true) {
        console.log('Game has split hands - verifying split data before saving');
        
        // Get split cards from the game
        const splitCards = blackjackGame.getSplitCards();
        
        // If hasSplit is true but no split cards found, something is wrong
        if (!splitCards || splitCards.length === 0) {
          console.warn('Game state indicates split but no split cards found - attempting to fix before saving');
          
          // Try to get split hand from the game session directly
          const splitHandFromSession = gameSession.getLastSavedSplitCards();
          
          if (splitHandFromSession && splitHandFromSession.length > 0) {
            console.log(`Recovered ${splitHandFromSession.length} split cards from session data before disconnection save`);
            
            // Create a structure for the split hand
            gameState.secondHand = {
              type: 'split',
              cards: splitHandFromSession,
              value: blackjackGame.getSplitHandValue() || 0,
              busted: false,
              blackjack: false,
              soft: false
            };
            
            // Also ensure splitHand is populated for consistency
            gameState.splitHand = gameState.secondHand;
          } else {
            // If we can't recover split hand data, attempt to retrieve it from the API
            console.log('No split hand cards in session memory, retrieving from last API save');
            
            try {
              const apiService = ApiService.getInstance();
              const savedStateResponse = await apiService.getUserGameData(loginData);
              
              if (savedStateResponse.success && savedStateResponse.data && 
                  savedStateResponse.data.hasSplit && 
                  (savedStateResponse.data.secondHand?.cards?.length > 0 || 
                   savedStateResponse.data.splitHand?.cards?.length > 0)) {
                
                // Use the split hand from the saved game state
                const savedSplitHand = savedStateResponse.data.secondHand?.cards?.length > 0 ? 
                      savedStateResponse.data.secondHand : savedStateResponse.data.splitHand;
                      
                console.log(`Retrieved split hand from API with ${savedSplitHand.cards.length} cards`);
                
                // Restore this split hand to the current game state
                gameState.secondHand = savedSplitHand;
                gameState.splitHand = savedSplitHand;
                
                // Also save these cards in the session for future reference
                gameSession.setLastSavedSplitCards(savedSplitHand.cards);
              } else {
                // If we still can't recover, disable split to prevent issues
                console.warn('Unable to recover split hand data from any source - disabling hasSplit flag before saving');
                gameState.hasSplit = false;
                gameState.secondHand = null;
                gameState.splitHand = null;
              }
            } catch (error) {
              console.error('Error retrieving split hand data from API:', error);
              // If recovery fails, disable split to prevent issues
              gameState.hasSplit = false;
              gameState.secondHand = null;
              gameState.splitHand = null;
            }
          }
        } else {
          console.log(`Split hand verified with ${splitCards.length} cards before disconnection save`);
          // Store these cards in the session for potential future recovery
          gameSession.setLastSavedSplitCards(splitCards);
          
          // CRITICAL FIX: Add splitHandCards count to gameState to ensure split data persists even if cards are lost
          (gameState as any).splitHandCards = splitCards.length;
          console.log(`Set splitHandCards count to ${splitCards.length} for emergency recovery`);
        }
      }
      
      // Use the disconnection handler to process the disconnection
      const disconnectionHandler = DisconnectionHandler.getInstance();
      await disconnectionHandler.handleDisconnection(loginData, gameState, blackjackGame);
      
    } catch (error) {
      console.error('Error handling client disconnection:', error);
    }
  }

  /**
   * Automatically authenticate a user when connecting
   */
  private async autoAuthenticateUser(clientId: string, gameSession: GameSession): Promise<void> {
    try {
      // Use the login data from the URL query parameters or request headers
      // Extract this data from the connection request without modifying it
      const loginData = gameSession.getLoginData();
      
      if (!loginData || !loginData.userId) {
        console.warn(`No login data available for client ${clientId}, waiting for explicit authentication`);
        return;
      }

      console.log(`Auto-authenticating user: ${loginData.userId}`);
      
      // Try to authenticate with the extracted login data - THIS HAPPENS FIRST (like in frontend)
      const success = await gameSession.authenticatePlayer(loginData);
      
      if (!success) {
        console.warn(`Auto-authentication failed for client ${clientId}`);
        
        // Send auth failure message
        this.sendToClient(clientId, {
          type: MessageType.AUTH_FAILED,
          data: { 
            message: 'Authentication failed'
          }
        });
        return;
      }
      
      console.log(`Auto-authentication successful for user: ${loginData.userId}`);
      
      // Check for saved game state
      try {
        console.log(`Checking for saved game state for auto-authenticated user ${loginData.userId}`);
        
        // Use the disconnection handler to get saved game state
        const disconnectionHandler = DisconnectionHandler.getInstance();
        const savedState = await disconnectionHandler.getSavedGameState(loginData);
        
        if (savedState) {
          console.log(`Found saved game state with phase: ${savedState.gamePhase}`);
          
          // Only restore if in player_turn phase
          if (savedState.gamePhase === 'player_turn') {
            console.log(`Restoring saved game state from player_turn phase`);
            
            // Log detailed information about the saved hands
            if (savedState.playerHand) {
              const playerCards = Array.isArray(savedState.playerHand) ? savedState.playerHand : 
                                (savedState.playerHand.cards || []);
              console.log(`[RESTORE] Player hand contains ${playerCards.length} cards:`, 
                playerCards.map((c: any) => `${c.rank} of ${c.suit}`).join(', '));
            }
            
            if (savedState.dealerHand) {
              const dealerCards = Array.isArray(savedState.dealerHand) ? savedState.dealerHand : 
                                (savedState.dealerHand.cards || []);
              console.log(`[RESTORE] Dealer hand contains ${dealerCards.length} cards:`, 
                dealerCards.map((c: any) => `${c.rank} of ${c.suit}`).join(', '));
            }
            
            // Fix dealer hand to only show first card (hole card should be hidden)
            if (savedState.dealerHand && Array.isArray(savedState.dealerHand.cards) && savedState.dealerHand.cards.length > 1) {
              const dealerHand = { ...savedState.dealerHand };
              dealerHand.cards = [savedState.dealerHand.cards[0]];
              savedState.dealerHand = dealerHand;
            }
            
            // Check if hasSplit is true but secondHand/splitHand is missing
            let splitHandData = null;
            if (savedState.hasSplit) {
              // Try to get split hand data from multiple possible sources
              if (savedState.secondHand && savedState.secondHand.cards && savedState.secondHand.cards.length > 0) {
                // Deep clone to avoid reference issues
                splitHandData = JSON.parse(JSON.stringify(savedState.secondHand));
                console.log(`Found split hand with ${savedState.secondHand.cards.length} cards in secondHand`);
              } else if (savedState.splitHand && savedState.splitHand.cards && savedState.splitHand.cards.length > 0) {
                // Deep clone to avoid reference issues
                splitHandData = JSON.parse(JSON.stringify(savedState.splitHand));
                console.log(`Found split hand with ${savedState.splitHand.cards.length} cards in splitHand`);
              } else {
                console.log('WARNING: hasSplit is true but no split hand cards found - creating default split hand');
                
                // Try to get cards from the game itself (last attempt)
                const game = gameSession.getGame();
                const splitCards = game.getSplitCards();
                
                if (splitCards && splitCards.length > 0) {
                  console.log(`Recovered ${splitCards.length} split cards from game instance`);
                  splitHandData = {
                    type: 'split',
                    cards: JSON.parse(JSON.stringify(splitCards)), // Deep clone 
                    value: game.getSplitHand()?.value || 0,
                    busted: game.getSplitHand()?.busted || false,
                    blackjack: game.getSplitHand()?.blackjack || false,
                    soft: game.getSplitHand()?.soft || false
                  };
                } else {
                  // Create an empty fallback structure
                  splitHandData = {
                    type: 'split',
                    cards: [], 
                    value: 0,
                    busted: false,
                    blackjack: false,
                    soft: false
                  };
                  
                  // If we have no split hand data but hasSplit is true, 
                  // we should log a warning and set hasSplit to false to prevent issues
                  console.warn('No split hand data could be recovered, disabling hasSplit flag');
                  savedState.hasSplit = false;
                }
              }
              
              // Always ensure that both secondHand and splitHand are populated for consistency
              if (splitHandData) {
                savedState.secondHand = JSON.parse(JSON.stringify(splitHandData));
                savedState.splitHand = JSON.parse(JSON.stringify(splitHandData));
                console.log('Ensuring both secondHand and splitHand are populated with the same data');
                
                // Double check the data after assignment to ensure it's there
                console.log(`VERIFICATION: secondHand has ${savedState.secondHand?.cards?.length || 0} cards, splitHand has ${savedState.splitHand?.cards?.length || 0} cards`);
              }
            }
            
            // Restore the game state
            await gameSession.restoreGameState(savedState);
            
            // Log the restored game state and actions for debugging
            console.log(`Game state restored with phase: ${savedState.gamePhase}`);
            if (savedState.allowedActions) {
              console.log(`Restored allowed actions: ${JSON.stringify(savedState.allowedActions)}`);
            }

            // Clear the saved game state after successful restoration
            await disconnectionHandler.clearSavedGameState(loginData);
            
            // Send auth success message first
            this.sendToClient(clientId, {
              type: MessageType.AUTH_SUCCESS,
              data: { 
                message: 'Authentication successful - restored saved game',
                user: gameSession.getPlayerData(),
                restoredState: true,
                // Include complete card data and game state directly in auth message
                gamePhase: savedState.gamePhase,
                playerHand: savedState.playerHand,
                dealerHand: savedState.dealerHand,
                currentBet: savedState.currentBet,
                allowedActions: savedState.allowedActions,
                playerBalance: savedState.playerBalance,
                hasSplit: savedState.hasSplit || false,
                // Include the resolved split hand data only if hasSplit is true
                ...(savedState.hasSplit ? {
                  secondHand: splitHandData,
                  splitHand: splitHandData
                } : {})
              }
            });
            
            // Wait a short delay to ensure client has processed auth message
            setTimeout(() => {
              // Send game state after small delay (just like in frontend App.ts)
              gameSession.sendGameState();
            }, 500);
            
            return;
          } 
          // Handle completed games (either from dealer_turn disconnection or normal completion)
          else if (savedState.gamePhase === 'complete' && savedState.completedOffline) {
            console.log('Game was completed while player was offline, showing results');
            
            // Send special message about offline completion
            this.sendToClient(clientId, {
              type: MessageType.AUTH_SUCCESS,
              data: { 
                message: 'Authentication successful - game was completed offline',
                user: gameSession.getPlayerData(),
                offlineCompletion: true,
                gameOutcome: savedState.outcome,
                payout: savedState.payout,
                playerHand: savedState.playerHand,
                dealerHand: savedState.dealerHand,
                playerBalance: savedState.playerBalance,
                // Include split data only if hasSplit is true
                ...(savedState.hasSplit ? {
                  hasSplit: true,
                  secondHand: savedState.secondHand,
                  splitHand: savedState.splitHand
                } : {
                  hasSplit: false
                })
              }
            });
            
            // Clear the saved game state
            await disconnectionHandler.clearSavedGameState(loginData);
            return;
          } 
          // For other phases (betting, dealer_turn, dealing), don't restore
          else {
            console.log(`Saved game state phase ${savedState.gamePhase} not eligible for restoration`);
            
            // For dealer_turn, we should execute it on reconnect and save the outcome
            if (savedState.gamePhase === 'dealer_turn') {
              console.log('Found saved game in dealer_turn phase - handling on server side');
              
              // Complete dealer turn via the disconnection handler
              await disconnectionHandler.completeDealerTurn(loginData, savedState, gameSession.getGame());
              
              // Clear the saved game state since we're handling it now
              await disconnectionHandler.clearSavedGameState(loginData);
            } else {
              // Clear other non-restorable states
              await disconnectionHandler.clearSavedGameState(loginData);
            }
          }
        } else {
          console.log('No valid saved game state found');
        }
      } catch (error) {
        // Just log the error but continue with normal auth flow
        console.error('Error checking for saved game state during auto-auth:', error);
      }
      
      // Send success message with user data (no restored state)
      this.sendToClient(clientId, {
        type: MessageType.AUTH_SUCCESS,
        data: { 
          message: 'Authentication successful',
          user: gameSession.getPlayerData()
        }
      });
      
      // Wait for client to acknowledge authentication before sending any game data (like in frontend App.ts)
      setTimeout(() => {
        // Immediately send game state after authentication
        gameSession.sendGameState();
        
        // Send a GET_LEADERBOARD message after a small additional delay to avoid overwhelming the client
        setTimeout(() => {
          const leaderboardMessage: ClientMessage = {
            type: MessageType.GET_LEADERBOARD,
            data: {}
          };
          this.messageHandler.handleMessage(clientId, leaderboardMessage);
        }, 500);
      }, 500);
    } catch (error) {
      console.error(`Error during auto-authentication for client ${clientId}:`, error);
      
      // Send auth error message
      this.sendToClient(clientId, {
        type: MessageType.AUTH_ERROR,
        data: { 
          message: 'Authentication error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  /**
   * Shutdown the server and clean up resources
   */
  public shutdown(): void {
    console.log('Shutting down BlackjackServer...');
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Clear connection cleanup interval
    if (this.connectionCleanupInterval) {
      clearInterval(this.connectionCleanupInterval);
      this.connectionCleanupInterval = null;
    }
    
    // Clean up all game sessions
    for (const [clientId, gameSession] of this.gameSessions.entries()) {
      try {
        gameSession.cleanup();
      } catch (error) {
        console.error(`Error cleaning up game session for client ${clientId}:`, error);
      }
    }
    
    // Clear the game sessions map
    this.gameSessions.clear();
    
    // Terminate all WebSocket connections
    this.wss.clients.forEach((client) => {
      try {
        client.terminate();
      } catch (error) {
        console.error('Error terminating client connection:', error);
      }
    });
    
    console.log('BlackjackServer shutdown complete');
  }
} 