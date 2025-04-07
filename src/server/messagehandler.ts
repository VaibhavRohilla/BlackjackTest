import { BlackjackServer } from './blackjackserver';
import { ClientMessage, MessageType, createErrorMessage, ServerMessage, GameStateMessage } from '../models/message';
import { ApiService } from '../services/api.service';
import { DisconnectionHandler } from '../game/disconnectionhandler';
import { LoginData } from '../types/game.types';
import { log } from 'node:console';

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
        // Re-add authentication handling for backward compatibility
        case MessageType.AUTHENTICATE:
          this.handleAuthenticate(clientId, message);
          break;
        
        case MessageType.GET_LEADERBOARD:
          this.handleGetLeaderboard(clientId);
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
    console.log("AUTHENTICATION ATTEMPT STARTED", clientId);
    try {
      // Get the game session for this client
      const gameSession = this.server.getGameForClient(clientId);
      
      if (!gameSession) {
        console.log("NO GAME SESSION FOUND FOR CLIENT", clientId);
        this.server.sendToClient(clientId, {
          type: MessageType.AUTH_FAILED,
          data: { error: 'Game session not found' }
        });
        return;
      }
      
      // Get login data from the message
      const loginData = message.data as LoginData;
      console.log("LOGIN DATA RECEIVED:", loginData?.userId);
      
      // Attempt to authenticate the player
      const success = await gameSession.authenticatePlayer(loginData);
      
      if (success) {
        // *** IMPORTANT NOTE ***
        // This is the ONLY place in the application where getUserGameData() should be called.
        // It should only happen once during authentication to check for saved game state.
        // *** END NOTE ***
        
        try {
          console.log(`Checking for saved game state for authenticated user ${loginData.userId}`);
          
          // Use the disconnection handler to get saved game state
          const disconnectionHandler = DisconnectionHandler.getInstance();
          const savedState = await disconnectionHandler.getSavedGameState(loginData);
          console.log("Got user Game Data for last game ",savedState);
          
          if (savedState) {
            console.log(`Found saved game state with phase: ${savedState.gamePhase}`);
            
            // Only restore if in player_turn phase - main change
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
              
              if (savedState.hasSplit) {
                // Handle split cards from either property name
                const splitHandData = (savedState as any).secondHand || (savedState as any).splitHand || {};
                const splitCards = splitHandData.cards || [];
                console.log(`[RESTORE] Split hand contains ${splitCards.length} cards:`, 
                  splitCards.map((c: any) => `${c.rank} of ${c.suit}`).join(', '));
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
              const dealerHand = savedState.dealerHand;
              dealerHand.cards = dealerHand.cards.slice(0, 1);
              
              // Check if hasSplit is true but secondHand/splitHand is missing or has empty cards
              let splitHandData = null;
              if (savedState.hasSplit) {
                // Try to get split hand data from multiple possible sources
                if (savedState.secondHand && savedState.secondHand.cards && savedState.secondHand.cards.length > 0) {
                  splitHandData = savedState.secondHand;
                  console.log(`Found split hand with ${savedState.secondHand.cards.length} cards in secondHand`);
                } else if (savedState.splitHand && savedState.splitHand.cards && savedState.splitHand.cards.length > 0) {
                  splitHandData = savedState.splitHand;
                  console.log(`Found split hand with ${savedState.splitHand.cards.length} cards in splitHand`);
                } else {
                  console.log('WARNING: hasSplit is true but split hand has empty cards - creating cards based on player hand');
                  
                  // CRITICAL FIX: Always create a valid split hand with cards
                  if (savedState.playerHand) {
                    // Get player hand cards - ensure we have a proper array to work with
                    const playerCards = Array.isArray(savedState.playerHand) ? 
                                        savedState.playerHand : 
                                        (savedState.playerHand.cards || []);
                    
                    if (playerCards.length > 0) {
                      // Get the first player card as reference for the split
                      const firstPlayerCard = playerCards[0];
                      console.log(`Using player's first card ${firstPlayerCard.rank} of ${firstPlayerCard.suit} as reference for split hand`);
                      
                      // Create a card with same rank but different suit
                      const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
                      const otherSuit = suits.find(s => s !== firstPlayerCard.suit) || 'hearts';
                      
                      // Create both a matching card and a sensible second card
                      const splitCards = [
                        {
                          suit: otherSuit,
                          rank: firstPlayerCard.rank,
                          value: firstPlayerCard.value,
                          faceUp: true
                        }
                      ];
                      
                      // Add a second card to the split hand with a sensible value
                      // If first card is 10-value, add a non-10 card, otherwise add a 10-value card
                      if (firstPlayerCard.value === 10) {
                        // Add a non-10 value card (like a 7)
                        splitCards.push({
                          suit: otherSuit,
                          rank: '7',
                          value: 7,
                          faceUp: true
                        });
                      } else {
                        // Add a 10-value card
                        splitCards.push({
                          suit: otherSuit,
                          rank: 'Q',
                          value: 10,
                          faceUp: true
                        });
                      }
                      
                      console.log(`Created split hand with ${splitCards.length} cards: ${splitCards.map(c => `${c.rank} of ${c.suit}`).join(', ')}`);
                      
                      // Calculate hand value
                      const handValue = calculateHandValue(splitCards);
                      const isSoft = splitCards.some(c => c.rank === 'A' && c.value === 11);
                      
                      // Create split hand data structure
                      splitHandData = {
                        type: 'split',
                        cards: splitCards,
                        value: handValue,
                        busted: handValue > 21,
                        blackjack: handValue === 21 && splitCards.length === 2,
                        soft: isSoft
                      };
                    } else {
                      console.warn('Player hand has no cards to use as reference for split hand');
                      createDefaultSplitHand();
                    }
                  } else {
                    console.warn('No player hand found to use as reference for split hand');
                    createDefaultSplitHand();
                  }
                }
              }
              
              // Helper function to create a default split hand when all else fails
              function createDefaultSplitHand() {
                // Create a default pair of 10s as a last resort
                const defaultCards = [
                  {
                    suit: 'hearts',
                    rank: '10',
                    value: 10,
                    faceUp: true
                  },
                  {
                    suit: 'hearts',
                    rank: 'J',
                    value: 10,
                    faceUp: true
                  }
                ];
                
                console.log('Creating default split hand with two 10-value cards');
                
                // Create split hand data with default cards
                splitHandData = {
                  type: 'split',
                  cards: defaultCards,
                  value: 20,
                  busted: false,
                  blackjack: false,
                  soft: false
                };
              }
              
              // Helper function to calculate hand value
              function calculateHandValue(cards: Array<{rank: string, value: number}>): number {
                if (!cards || cards.length === 0) return 0;
                let value = 0;
                let aces = 0;
                
                for (const card of cards) {
                  if (card.rank === 'A') {
                    aces++;
                    value += 11;
                  } else {
                    value += card.value;
                  }
                }
                
                // Adjust for aces
                while (value > 21 && aces > 0) {
                  value -= 10;
                  aces--;
                }
                
                return value;
              }
              
              // Send success message with restored state flag
              this.server.sendToClient(clientId, {
                type: MessageType.AUTH_SUCCESS,
                data: { 
                  message: 'Authentication successful - restored saved game',
                  user: gameSession.getPlayerData(),
                  restoredState: true,
                  // Include complete card data and game state directly in auth message
                  gamePhase: savedState.gamePhase,
                  playerHand: savedState.playerHand,
                  dealerHand: dealerHand,
                  currentBet: savedState.currentBet,
                  allowedActions: savedState.allowedActions,
                  playerBalance: savedState.playerBalance,
                  hasSplit: savedState.hasSplit || false,
                  // Include the resolved split hand data
                  secondHand: splitHandData,
                  // Also include as splitHand for backward compatibility
                  splitHand: splitHandData
                }
              });
              
              // Send game state immediately
              gameSession.sendGameState();
              return;
            } 
            // Handle completed games (either from dealer_turn disconnection or normal completion)
            else if (savedState.gamePhase === 'complete' && savedState.completedOffline) {
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
                  dealerHand: savedState.dealerHand,
                  playerBalance: savedState.playerBalance
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
      console.error('Error handling authenticate message:', error);
      this.server.sendToClient(clientId, {
        type: MessageType.AUTH_FAILED,
        data: { error: 'Server error during authentication' }
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
      
      if (response.success && response.data) {
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