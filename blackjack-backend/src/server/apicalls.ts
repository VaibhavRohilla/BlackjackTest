import axios, { AxiosError, AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import { env } from 'process';
import { LoginData } from '../types/game.types';
dotenv.config();

// Environment and Configuration Types
type Environment = 'test' | 'prod';

interface ApiConfig {
  baseUrl: string;
  gamePassword: string;
  game: string;
  cacheDuration: number;
}

// API Request Types
interface BaseRequest {
  env: Environment;
  game: string;
  gamePassword: string;
}

interface UserRequest extends BaseRequest {
  loginData: LoginData;
}

interface BetRequest extends UserRequest {
  bet: number;
}

interface SaveBetRequest extends BetRequest {
  chipsWon: number;
}

interface RandomRequest extends BaseRequest {
  numRandom: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Add interface for the raw API response
interface RawUserResponse {
  _id: string;
  username: string;
  chips: number;
  [key: string]: any; // For other fields we don't need
}

export interface UserData {
  username: string | undefined;
  chips: number;
  userId: string;
}

export interface LeaderboardEntry {
  username: string;
  chips: number;
  rank: number;
  avatar: string;
  country: string;
}

export interface BetResult {
  userId: string;
  betAmount: number;
  chipsWon: number;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

// Cache Types
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// API Client Class
export class BlockspinAPI {
  private readonly config: ApiConfig;
  private readonly axiosInstance: AxiosInstance;
  private readonly cache: Map<string, CacheEntry<unknown>>;

  constructor(environment: Environment = 'test') {
    this.config = {
      baseUrl: environment === 'test' 
        ? process.env.TEST_API_URL || 'https://apitest.blockspingaming.com'
        : process.env.PROD_API_URL || 'https://api.blockspingaming.com',
      gamePassword: process.env.GAME_PASSWORD || '',
      game: 'blackjack',
      cacheDuration: 5 * 60 * 1000 // 5 minutes
    };

    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.cache = new Map();
  }

  // Private Helper Methods
  private getBaseRequest(): BaseRequest {
    return {
      env: this.config.baseUrl.includes('apitest') ? 'test' : 'prod',
      game: this.config.game,
      gamePassword: this.config.gamePassword
    };
  }

  private getCacheKey(endpoint: string, params: unknown): string {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < this.config.cacheDuration) {
      return cached.data;
    }
    return null;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private async makeRequest<T>(endpoint: string, data: unknown): Promise<T> {
    try {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
      
      // Add game password and authentication headers
      const requestData = {
        ...(typeof data === 'object' ? data : {}),
        gamePassword: this.config.gamePassword
      };

      // Add authentication headers if loginData is present
      if (data && typeof data === 'object' && 'loginData' in data) {
        const loginData = (data as any).loginData;
        if (typeof loginData === 'string' && loginData.startsWith('ey')) {
          this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${loginData}`;
        }
      }

      // Log request details
      console.log(`Making API request to ${cleanEndpoint}:`, {
        url: `${this.config.baseUrl}/${cleanEndpoint}`,
        data: requestData,
        environment: this.config.baseUrl.includes('apitest') ? 'test' : 'prod'
      });

      const response = await this.axiosInstance.post<T>(cleanEndpoint, requestData);
      
      // Log successful responses
      console.log(`API Success (${endpoint}):`, response.data);
      
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      
      // Enhanced error logging
      console.error('API Error:', {
        endpoint,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
        config: {
          url: axiosError.config?.url,
          method: axiosError.config?.method,
          baseURL: axiosError.config?.baseURL,
          data: axiosError.config?.data
        }
      });
      
      throw error; // Let the calling method handle the error
    }
  }

  // Public API Methods
  public async getUserData(loginData: LoginData): Promise<ApiResponse<UserData>> {
    try {
      const requestData: UserRequest = {
        ...this.getBaseRequest(),
        loginData
      };

      console.log('Making API request with data:', {
        ...requestData,
        loginData: loginData// Log only part of the token
      });

      const response = await this.axiosInstance.post('/externalgame/getuser', requestData);
      console.log('API Response:', response.data);

      if (response.data.error) {
        return {
          success: false,
          error: response.data.error
        };
      }

      const userData: UserData = {
        username: response.data.username || '',
        chips: response.data.chips || 0,
        userId: response.data._id || loginData // Use _id from response or fallback to loginData
      };

      return {
        success: true,
        data: userData
      };
    } catch (error) {
      console.error('API Error:', error);
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: error.response?.data?.error || error.message
        };
      }
      return {
        success: false,
        error: 'Failed to get user data'
      };
    }
  }

  public async validateBet(betAmount: number, loginData: LoginData): Promise<ApiResponse<boolean>> {
    if (!loginData) {
      return {
        success: false,
        error: 'Login data is required'
      };
    }

    try {
      const request = {
        ...this.getBaseRequest(),
        loginData,
        bet: betAmount
      };
      const response = await this.makeRequest<{ success: boolean; chips: number }>('externalgame/checkbet', request);
      
      // According to API docs, response should be { success: true, chips: "user chips after removing bet amount" }
      if (response && response.success) {
        return {
          success: true,
          data: true
        };
      }
      
      return {
        success: false,
        error: 'Invalid bet amount'
      };
    } catch (error) {
      console.error('Error validating bet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate bet'
      };
    }
  }

  public async recordBetResult(betResult: BetResult): Promise<ApiResponse<void>> {
    try {
      const request = {
        ...this.getBaseRequest(),
        bet: betResult.betAmount,
        chipsWon: betResult.chipsWon
      };
      await this.makeRequest<void>('externalgame/savebet', request);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record bet result'
      };
    }
  }

  public async getRandom(numRandom: number): Promise<ApiResponse<number[]>> {
    try {
      const request = {
        ...this.getBaseRequest(),
        numRandom
      };
      const response = await this.makeRequest<number[]>('externalgame/getrandom', request);
      return {
        success: true,
        data: response
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get random numbers'
      };
    }
  }

  public async getLeaderboard(loginData: LoginData): Promise<ApiResponse<LeaderboardEntry[]>> {
    try {
      const cacheKey = this.getCacheKey('leaderboard', loginData);
      const cached = this.getCached<LeaderboardEntry[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const request = {
        ...this.getBaseRequest(),
        loginData
      };

      const response = await this.makeRequest<LeaderboardEntry[]>('externalgame/getleaderboard', request);
      if (response) {
        this.setCache(cacheKey, response);
        return {
          success: true,
          data: response
        };
      }
      
      return {
        success: false,
        error: 'Failed to get leaderboard data'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get leaderboard'
      };
    }
  }

  // Cache Management Methods
  public clearCache(key: string): void {
    this.cache.delete(key);
  }

  public clearAllCache(): void {
    this.cache.clear();
  }
}

// Export a default instance for convenience
export const defaultApi = new BlockspinAPI('test');


