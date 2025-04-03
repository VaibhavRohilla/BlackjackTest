import { ExternalApiResponse, LoginData, BetValidationResponse } from '../types/game.types';
import { BlockspinAPI, UserData, BetResult } from '../server/apicalls';
import { Environment } from '../config/env';
import { log } from 'console';

// Import GameStateData type or define interface for game state
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

  async getUser(loginData: LoginData): Promise<ExternalApiResponse<UserData>> {
    try {
      const response = await this.api.getUserData(loginData);
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

  async getUserData(loginData: LoginData): Promise<ExternalApiResponse<UserData>> {
    try {
      const response = await this.api.getUserData(loginData);
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

  async recordBetResult(betResult: BetResult): Promise<ExternalApiResponse<any>> {
    try {
      const response = await this.api.recordBetResult(betResult);
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
    try {
      const response = await this.api.validateBet(bet, loginData);
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
    try {
      const response = await this.api.recordBetResult({
        userId: loginData.userId || '',
        betAmount: bet,
        chipsWon: chipsWon
      });
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
      
      // Validate that the data contains expected game state format
      const gameData = response.data.gameState as GameStateData;
      if (!gameData || typeof gameData !== 'object' || !gameData.gamePhase) {
        console.log('Invalid game data format:', response.data);
        return {
          success: false,
          error: 'Invalid game data format'
        };
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
        gameState: {
          ...gameState,
          timestamp: Date.now()
        }
      };
      
      // Update last save timestamp
      this.lastSaveTimestamp = now;
      
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
      
      // Send empty object to clear existing data
      const response = await this.api.setUserGameData(loginData, { gameState: null });
      
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