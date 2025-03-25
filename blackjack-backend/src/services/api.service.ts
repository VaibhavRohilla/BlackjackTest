import { BlockspinAPI } from '../server/apicalls';
import dotenv from 'dotenv';

dotenv.config();

export interface UserData {
  username: string;
  chips: number;
  userId: string;
  isAuthenticated: boolean;
}

export interface BetResult {
  userId: string;
  betAmount: number;
  chipsWon: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ApiService {
  private api: BlockspinAPI;
  private static instance: ApiService;
  private environment: 'test' | 'prod';

  private constructor() {
    // Get environment from .env or default to test
    this.environment = (process.env.NODE_ENV as 'test' | 'prod') || 'test';
    this.api = new BlockspinAPI(this.environment);
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Get user data from the API
   * @param loginData The user's login data
   * @returns Promise with user data or error
   */
  public async getUserData(loginData: string): Promise<ApiResponse<UserData>> {
    if (!loginData) {
      return {
        success: false,
        error: 'Login data is required'
      };
    }

    try {
      const response = await this.api.getUserData(loginData);
      
      if (response.success && response.data) {
        return {
          success: true,
          data: {
            username: response.data.username,
            chips: response.data.chips,
            userId: response.data.userId,
            isAuthenticated: true
          }
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to get user data'
      };
    } catch (error) {
      console.error('Error getting user data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting user data'
      };
    }
  }

  /**
   * Record a bet result with the API
   * @param betResult The bet result data
   * @returns Promise with success status or error
   */
  public async recordBetResult(betResult: BetResult): Promise<ApiResponse<void>> {
    if (!betResult || !betResult.userId || !betResult.betAmount) {
      return {
        success: false,
        error: 'Invalid bet result data'
      };
    }

    try {
      const response = await this.api.recordBetResult(betResult);
      
      if (response.success) {
        return { success: true };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to record bet result'
      };
    } catch (error) {
      console.error('Error recording bet result:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error recording bet result'
      };
    }
  }

  /**
   * Validate a bet amount with the API
   * @param betAmount The amount to bet
   * @param loginData The player's login data
   * @returns Promise with validation result
   */
  public async validateBet(betAmount: number, loginData: string): Promise<ApiResponse<boolean>> {
    if (betAmount <= 0) {
      return {
        success: false,
        error: 'Bet amount must be greater than 0'
      };
    }

    try {
      const response = await this.api.validateBet(betAmount, loginData);
      
      if (response.success) {
        return {
          success: true,
          data: response.data
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to validate bet'
      };
    } catch (error) {
      console.error('Error validating bet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error validating bet'
      };
    }
  }

  /**
   * Set the API environment (test/production)
   * @param environment The environment to use
   */
  public setEnvironment(environment: 'test' | 'prod'): void {
    this.environment = environment;
    this.api = new BlockspinAPI(environment);
  }

  /**
   * Get the current environment
   */
  public getEnvironment(): 'test' | 'prod' {
    return this.environment;
  }
} 