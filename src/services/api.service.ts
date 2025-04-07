import { ExternalApiResponse, LoginData, BetValidationResponse, UserData as GameUserData, BetResult } from '../types/game.types';
import { BlockspinAPI, UserData, ApiResponse } from '../server/apicalls';
import { Environment } from '../config/env';

// Game state data interface
export interface GameStateData {
  gamePhase: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete';
  playerBalance: number;
  currentBet: number;
  lastBet: number;
  playerHand?: any;
  dealerHand?: any;
  allowedActions: string[];
  activeHand?: 'first' | 'second' | null;
  hasSplit: boolean;
  insuranceAmount?: number;
  payout?: number;
  outcome?: string;
  timestamp: number;
  disconnected?: boolean;
  completedOffline?: boolean;
  secondHand?: any;
  splitHand?: any;
  splitHandCards?: number; // Number of cards in the split hand for recovery
}

type ApiEnvironment = 'test' | 'prod';

export class ApiService {
  private static instance: ApiService;
  private api: BlockspinAPI;
  private environment: Environment;

  // Store last save timestamp to prevent too frequent API calls
  private lastSaveTimestamp: number = 0;
  private readonly MIN_SAVE_INTERVAL = 2000; // 2 seconds minimum between saves

  private constructor() {
    this.environment = 'development';
    this.api = new BlockspinAPI(this.mapEnvironment(this.environment));
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private mapEnvironment(env: Environment): ApiEnvironment {
    switch (env) {
      case 'development':
      case 'test':
        return 'test';
      case 'production':
        return 'prod';
      default:
        return 'test';
    }
  }

  public setEnvironment(env: Environment): void {
    this.environment = env;
    this.api = new BlockspinAPI(this.mapEnvironment(env));
    console.log(`ApiService environment set to: ${env} (mapped to: ${this.mapEnvironment(env)})`);
  }

  async getUser(loginData: LoginData): Promise<ExternalApiResponse<GameUserData>> {
    return this.getUserData(loginData);
  }

  async getUserData(loginData: LoginData): Promise<ExternalApiResponse<GameUserData>> {
    try {
      const response = await this.api.getUserData(loginData);
      
      if (response.success && response.data) {
        // Convert from BlockspinAPI UserData to our GameUserData format
        const userData: GameUserData = {
          userId: response.data.userId,
          username: response.data.username || '',
          chips: response.data.chips,
          isAuthenticated: true
        };
        
        return {
          success: true,
          data: userData
        };
      }
      
      return {
        success: response.success,
        error: response.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async validateBet(betAmount: number, loginData: LoginData): Promise<ExternalApiResponse<BetValidationResponse>> {
    try {
      const response = await this.api.validateBet(betAmount, loginData);
      const userData = await this.api.getUserData(loginData);
      return {
        success: response.success,
        data: {
          isValid: response.data || false,
          availableChips: userData.data?.chips || 0
        },
        error: response.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async recordBetResult(betResult: BetResult, loginData?: LoginData): Promise<ExternalApiResponse<any>> {
    try {
      if (!loginData) {
        return {
          success: false,
          error: 'Login data is required'
        };
      }
      const response = await this.api.recordBetResult(betResult, loginData);
      return {
        success: response.success,
        error: response.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async checkBet(loginData: LoginData, bet: number): Promise<ExternalApiResponse<BetValidationResponse>> {
    return this.validateBet(bet, loginData);
  }

  async getRandom(numRandom: number): Promise<ExternalApiResponse<number[]>> {
    try {
      const response = await this.api.getRandom(numRandom);
      return {
        success: response.success,
        data: response.data,
        error: response.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async saveBet(loginData: LoginData, bet: number, chipsWon: number): Promise<ExternalApiResponse<any>> {
    if (!loginData) {
      return {
        success: false,
        error: 'Login data is required'
      };
    }
    
    return this.recordBetResult({
      userId: loginData.userId,
      betAmount: bet,
      chipsWon: chipsWon
    }, loginData);
  }

  async getLeaderboard(loginData: LoginData): Promise<ExternalApiResponse<any>> {
    try {
      const response = await this.api.getLeaderboard(loginData);
      return {
        success: response.success,
        data: response.data,
        error: response.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Retrieve user's saved game state data
   * @param loginData User login credentials
   * @returns Game state data if it exists
   */
  async getUserGameData(loginData: LoginData): Promise<ExternalApiResponse<GameStateData | null>> {
    try {
      console.log('Retrieving user game data for:', loginData.userId);
      const response = await this.api.getUserGameData(loginData);
      
      if (!response.success || !response.data) {
        console.log('No saved game data found for user');
        return {
          success: false,
          error: response.error || 'No saved game data found'
        };
      }
      
      // The game state is in the userData property of the response
      const userData = response.data.userData;
      
      if (!userData || typeof userData !== 'object' || !userData.gamePhase) {
        console.log('Invalid or empty game data in user data:', userData);
        return {
          success: false,
          error: 'No valid saved game state found'
        };
      }
      
      // Convert the userData to our GameStateData type
      const gameData: GameStateData = {
        gamePhase: userData.gamePhase,
        playerBalance: userData.playerBalance,
        currentBet: userData.currentBet,
        lastBet: userData.lastBet,
        playerHand: userData.playerHand,
        dealerHand: userData.dealerHand,
        allowedActions: userData.allowedActions || [],
        activeHand: userData.activeHand,
        hasSplit: userData.hasSplit || false,
        insuranceAmount: userData.insuranceAmount || 0,
        payout: userData.payout,
        outcome: userData.outcome,
        timestamp: userData.timestamp || Date.now(),
        disconnected: userData.disconnected || false,
        completedOffline: userData.completedOffline || false
      };
      
      // CRITICAL: Handle split hand data specifically
      if (userData.hasSplit === true) {
        // First, ensure we have some split hand data, otherwise disable the split flag
        let hasValidSplitData = false;
        
        // Check if secondHand or splitHand exists with valid cards
        if (userData.secondHand && userData.secondHand.cards && userData.secondHand.cards.length > 0) {
          gameData.secondHand = userData.secondHand;
          // Also include as splitHand for consistency
          gameData.splitHand = userData.secondHand;
          console.log(`Retrieved split hand data with ${userData.secondHand.cards.length} cards from secondHand`);
          hasValidSplitData = true;
        } else if (userData.splitHand && userData.splitHand.cards && userData.splitHand.cards.length > 0) {
          gameData.secondHand = userData.splitHand;
          gameData.splitHand = userData.splitHand;
          console.log(`Retrieved split hand data with ${userData.splitHand.cards.length} cards from splitHand`);
          hasValidSplitData = true;
        } 
        
        // If hasSplit is true but we have no valid split data, create a fallback structure
        // and log a warning, but don't disable hasSplit yet - the game can attempt recovery
        if (!hasValidSplitData) {
          console.warn('Retrieved game state has hasSplit=true but no valid split hand data found');
          const defaultSplitHand = {
            type: 'split',
            cards: [],
            value: 0,
            busted: false,
            blackjack: false,
            soft: false
          };
          gameData.secondHand = defaultSplitHand;
          gameData.splitHand = defaultSplitHand;
        }
      } else {
        // Make sure split is properly disabled if hasSplit is false
        gameData.secondHand = null;
        gameData.splitHand = null;
      }
      
      console.log('Successfully retrieved game data, phase:', gameData.gamePhase);
      return {
        success: true,
        data: gameData
      };
    } catch (error) {
      console.error('Error retrieving user game data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve game data'
      };
    }
  }
  
  /**
   * Save user's current game state data for reconnection
   * @param loginData User login credentials 
   * @param gameState Current game state to save
   * @returns Success status
   */
  async saveUserGameData(loginData: LoginData, gameState: GameStateData): Promise<ExternalApiResponse<void>> {
    try {
      // Only save game state if we're in an active game phase
      if (gameState.gamePhase === 'betting' || gameState.gamePhase === 'complete') {
        console.log('Not saving game state in betting or complete phase');
        return {
          success: true
        };
      }
      
      // Check if we've saved too recently - debounce API calls
      const now = Date.now();
      if (now - this.lastSaveTimestamp < this.MIN_SAVE_INTERVAL) {
        console.log(`Skipping game state save - last save was ${now - this.lastSaveTimestamp}ms ago (min interval: ${this.MIN_SAVE_INTERVAL}ms)`);
        return {
          success: true
        };
      }
      
      console.log(`Saving game state for user: ${loginData.userId}, Phase: ${gameState.gamePhase}`);
      
      // Add timestamp to track when the state was saved
      const dataToSave = {
        ...gameState,
        timestamp: Date.now()
      };
      
      // Ensure proper handling of split hand data
      if (dataToSave.hasSplit === true) {
        // Make sure splitHand property exists and has cards
        if (!dataToSave.splitHand || !dataToSave.splitHand.cards || dataToSave.splitHand.cards.length === 0) {
          console.warn('Split hand validation failed - hasSplit is true but splitHand is missing or has no cards');
          
          // Create an empty structure if splitHand is missing or empty but hasSplit is true
          dataToSave.splitHand = {
            type: 'split',
            cards: [],
            value: 0,
            busted: false,
            blackjack: false,
            soft: false
          };
        } else {
          console.log(`Split hand validation passed: ${dataToSave.splitHand.cards.length} cards found in splitHand`);
        }
        
        // Remove secondHand property to use only splitHand
        delete dataToSave.secondHand;
      } else {
        // If hasSplit is false, make sure both splitHand properties are null/removed
        delete dataToSave.secondHand;
        delete dataToSave.splitHand;
        
        // Also ensure activeHand is null when not split
        if (dataToSave.activeHand) {
          dataToSave.activeHand = null;
        }
        
        console.log('Split hand data removed because hasSplit is false');
      }
      
      // Update last save timestamp
      this.lastSaveTimestamp = now;
      
      // The API expects the game state to be in the userData field
      const response = await this.api.setUserGameData(loginData, dataToSave);
      
      if (!response.success) {
        console.error('Failed to save game state:', response.error);
        return {
          success: false,
          error: response.error
        };
      }
      
      console.log('Game state saved successfully');
      return {
        success: true
      };
    } catch (error) {
      console.error('Error saving game state:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save game state'
      };
    }
  }
  
  /**
   * Clear saved game state for a user
   * @param loginData User login credentials
   * @returns Success status
   */
  async clearUserGameData(loginData: LoginData): Promise<ExternalApiResponse<void>> {
    try {
      console.log('Clearing game state for user:', loginData.userId);
      
      // Reset the save timestamp to ensure this API call isn't debounced
      this.lastSaveTimestamp = 0;
      
      // API expects empty object for userData to clear it
      const response = await this.api.setUserGameData(loginData, {});
      
      return {
        success: response.success,
        error: response.error
      };
    } catch (error) {
      console.error('Error clearing game state:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear game state'
      };
    }
  }
} 