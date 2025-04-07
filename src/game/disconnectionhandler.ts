import { BlackjackGame } from './blackjackgame';
import { ApiService, GameStateData } from '../services/api.service';
import { LoginData, BetResult } from '../types/game.types';

/**
 * DisconnectionHandler - Manages game state when players disconnect
 * - Stores game state when player disconnects during player's turn
 * - Completes game when player disconnects during dealer's turn
 * - Provides methods to retrieve and clear saved game state
 */
export class DisconnectionHandler {
  private static instance: DisconnectionHandler;
  private apiService: ApiService;
  
  private constructor() {
    this.apiService = ApiService.getInstance();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): DisconnectionHandler {
    if (!DisconnectionHandler.instance) {
      DisconnectionHandler.instance = new DisconnectionHandler();
    }
    return DisconnectionHandler.instance;
  }
  
  /**
   * Handle a player disconnection based on the current game phase
   * @param loginData Player login data
   * @param gameState Current game state
   * @param game Reference to the game instance
   * @returns Void
   */
  public async handleDisconnection(
    loginData: LoginData, 
    gameState: GameStateData, 
    game: BlackjackGame
  ): Promise<void> {
    if (!loginData || !gameState) {
      console.log('Cannot handle disconnection: Missing login data or game state');
      return;
    }
    
    const { gamePhase } = gameState;
    console.log(`Handling disconnection during ${gamePhase} phase for user ${loginData.userId}`);
    
    // Case 1: Player disconnects during their turn - store the game state
    if (gamePhase === 'player_turn') {
      console.log('Player disconnected during player turn - saving game state');
      await this.storeGameState(loginData, gameState);
    } 
    // Case 2: Player disconnects during dealer turn - complete the game
    else if (gamePhase === 'dealer_turn') {
      console.log('Player disconnected during dealer turn - completing the game');
      await this.completeDealerTurn(loginData, gameState, game);
    }
    // Case 3: Player disconnects during initial dealing - might need to store or complete
    else if (gamePhase === 'dealing') {
      console.log('Player disconnected during dealing phase - waiting for next connection');
      // We don't save or process this state as it will reset to betting on reconnect
    }
    // For other phases (betting, complete) - no special handling needed
    else {
      console.log(`No special handling for disconnection during ${gamePhase} phase`);
    }
  }
  
  /**
   * Store game state when player disconnects during their turn
   * @param loginData Player login data
   * @param gameState Current game state
   */
  private async storeGameState(loginData: LoginData, gameState: GameStateData): Promise<void> {
    try {
      // Update timestamp to track when the state was saved
      const stateToSave: GameStateData = {
        ...gameState,
        timestamp: Date.now(),
        disconnected: true
      };
      
      // Make sure split hand data is properly preserved if it exists
      if (stateToSave.hasSplit === true) {
        // Ensure we're saving both secondHand and splitHand for compatibility
        if (stateToSave.secondHand && (!stateToSave.splitHand || Object.keys(stateToSave.splitHand).length === 0)) {
          stateToSave.splitHand = stateToSave.secondHand;
          console.log('Copying secondHand to splitHand to ensure split data preservation');
        } else if (stateToSave.splitHand && (!stateToSave.secondHand || Object.keys(stateToSave.secondHand).length === 0)) {
          stateToSave.secondHand = stateToSave.splitHand;
          console.log('Copying splitHand to secondHand to ensure split data preservation');
        }
        
        // CRITICAL FIX: Ensure splitHand has actual cards with data before saving
        // If both splitHand and secondHand have empty cards arrays but hasSplit is true,
        // this indicates a bug in the disconnection flow where the cards were lost
        if ((!stateToSave.splitHand?.cards || stateToSave.splitHand.cards.length === 0) &&
            (!stateToSave.secondHand?.cards || stateToSave.secondHand.cards.length === 0)) {
          console.warn('Split hand data is missing despite hasSplit=true - attempting to repair before saving');
          
          // Check if we have the cards count but not the actual data
          const cardCount = (gameState as any).splitHandCards || 0;
          if (cardCount > 0) {
            console.log(`Found splitHandCards count of ${cardCount} - creating placeholder structure`);
            
            // Create a placeholder structure with the correct card count
            const placeholderCards = Array(cardCount).fill(null).map(() => ({
              suit: 'hearts',
              rank: 'A', 
              value: 11,
              faceUp: true
            }));
            
            // Create split hand structure with these cards
            const repairSplitHand = {
              type: 'split',
              cards: placeholderCards,
              value: 11 * Math.min(cardCount, 1), // Ace value
              busted: false,
              blackjack: false,
              soft: true
            };
            
            // Assign to both splitHand and secondHand
            stateToSave.splitHand = repairSplitHand;
            stateToSave.secondHand = repairSplitHand;
            
            console.log(`Created placeholder split hand with ${cardCount} cards to prevent data loss`);
          }
        }
        
        // Log the split hand state being saved with actual card count
        const cardCount = stateToSave.splitHand?.cards?.length || stateToSave.secondHand?.cards?.length || 0;
        console.log(`Saving split hand data with ${cardCount} cards`);
      }
      
      // Save to user data using API
      const response = await this.apiService.saveUserGameData(loginData, stateToSave);
      
      if (!response.success) {
        console.error('Failed to save game state on disconnection:', response.error);
      } else {
        console.log('Game state saved successfully on disconnection');
      }
    } catch (error) {
      console.error('Error saving game state on disconnection:', error);
    }
  }
  
  /**
   * Complete the dealer's turn and determine final outcome when player disconnects
   * @param loginData Player login data
   * @param gameState Current game state
   * @param game Reference to the game instance
   */
  public async completeDealerTurn(
    loginData: LoginData, 
    gameState: GameStateData, 
    game: BlackjackGame
  ): Promise<void> {
    try {
      console.log('Completing dealer turn automatically');
      
      // Execute dealer's turn according to rules
      game.executeDealerTurn();
      
      // Just use the game's existing methods to determine the outcome
      // This avoids trying to create a Hand object ourselves
      let outcome = '';
      if (game.getPlayerValue() > 21) {
        outcome = 'player_bust';
      } else if (game.getDealerValue() > 21) {
        outcome = 'dealer_bust';
      } else if (game.getPlayerValue() === 21 && game.getPlayerCards().length === 2) {
        outcome = 'player_blackjack';
      } else if (game.getPlayerValue() > game.getDealerValue()) {
        outcome = 'player_win';
      } else if (game.getPlayerValue() < game.getDealerValue()) {
        outcome = 'dealer_win';
      } else {
        outcome = 'push';
      }
      
      let chipsWon = 0;
      
      // Calculate winnings based on outcome
      const currentBet = gameState.currentBet;
      
      switch (outcome) {
        case 'player_blackjack':
          chipsWon = Math.floor(currentBet * 2.5); // Blackjack pays 3:2
          break;
        case 'player_win':
        case 'dealer_bust':
          chipsWon = currentBet * 2; // Regular win pays 1:1
          break;
        case 'push':
          chipsWon = currentBet; // Push returns the bet
          break;
        case 'dealer_win':
        case 'player_bust':
          chipsWon = 0; // Player loses bet
          break;
      }
      
      // Record bet result with the API
      const betResult: BetResult = {
        userId: loginData.userId,
        betAmount: currentBet,
        chipsWon: chipsWon
      };
      await this.apiService.recordBetResult(betResult, loginData);
      
      // Check for split hand
      const hasSplit = gameState.hasSplit || false;
      let splitHandData = null;
      
      if (hasSplit) {
        // Handle split hand data from multiple possible sources
        if (gameState.secondHand && gameState.secondHand.cards && gameState.secondHand.cards.length > 0) {
          splitHandData = gameState.secondHand;
          console.log(`Found split hand with ${gameState.secondHand.cards.length} cards in secondHand`);
        } else if (gameState.splitHand && gameState.splitHand.cards && gameState.splitHand.cards.length > 0) {
          splitHandData = gameState.splitHand;
          console.log(`Found split hand with ${gameState.splitHand.cards.length} cards in splitHand`);
        } else {
          console.log('WARNING: hasSplit is true but no split hand cards found in game state');
          
          // Try to get split cards from the game as a last resort
          const splitCards = game.getSplitCards();
          if (splitCards && splitCards.length > 0) {
            splitHandData = {
              cards: splitCards,
              type: 'split',
              value: game.getSplitHand()?.value || 0,
              busted: game.getSplitHand()?.busted || false,
              blackjack: game.getSplitHand()?.blackjack || false,
              soft: game.getSplitHand()?.soft || false
            };
            console.log(`Recovered ${splitCards.length} split cards from game instance`);
          }
        }
      }
      
      // Store final outcome in user data for when they reconnect
      const finalGameState: GameStateData = {
        gamePhase: 'complete',
        playerBalance: gameState.playerBalance + (chipsWon - currentBet), // Adjust balance
        currentBet: currentBet,
        lastBet: currentBet,
        playerHand: game.getPlayerCards(),
        dealerHand: game.getDealerCards(),
        allowedActions: [],
        hasSplit: hasSplit,
        secondHand: splitHandData,
        splitHand: splitHandData, // Include both for compatibility
        outcome: outcome,
        payout: chipsWon,
        timestamp: Date.now(),
        completedOffline: true
      };
      
      // Final validation before saving - if hasSplit is true but no split data, disable split
      if (finalGameState.hasSplit && (!finalGameState.secondHand || !finalGameState.splitHand)) {
        console.log('Disabling hasSplit flag because no valid split hand data is available');
        finalGameState.hasSplit = false;
        finalGameState.secondHand = null;
        finalGameState.splitHand = null;
      }
      
      // Save the completed game state
      await this.apiService.saveUserGameData(loginData, finalGameState);
      
      console.log(`Game completed automatically with outcome: ${outcome}, chips won: ${chipsWon}`);
    } catch (error) {
      console.error('Error completing dealer turn on disconnection:', error);
    }
  }
  
  /**
   * Check if player has a saved game state and return it
   * @param loginData Player login data
   * @returns Game state data if available, null otherwise
   */
  public async getSavedGameState(loginData: LoginData): Promise<GameStateData | null> {
    try {
      // Only attempt to get user game data if loginData contains authentication info
      if (!loginData || !loginData.userId) {
        console.log('Cannot retrieve saved game state: Player not authenticated');
        return null;
      }

      // Log authentication check before retrieving game data
      console.log(`Retrieving saved game state for authenticated user: ${loginData.userId}`);
      
      const response = await this.apiService.getUserGameData(loginData);
      
      if (!response.success || !response.data) {
        return null;
      }
      
      return response.data;
    } catch (error) {
      console.error('Error retrieving saved game state:', error);
      return null;
    }
  }
  
  /**
   * Clear saved game state after restoring it
   * @param loginData Player login data
   */
  public async clearSavedGameState(loginData: LoginData): Promise<void> {
    try {
      await this.apiService.clearUserGameData(loginData);
    } catch (error) {
      console.error('Error clearing saved game state:', error);
    }
  }
} 