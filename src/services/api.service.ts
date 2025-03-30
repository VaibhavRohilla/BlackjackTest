import { ExternalApiResponse, LoginData, BetValidationResponse } from '../types/game.types';
import { BlockspinAPI, UserData, BetResult } from '../server/apicalls';
import { Environment } from '../config/env';

type ApiEnvironment = 'test' | 'prod';

export class ApiService {
  private static instance: ApiService;
  private api: BlockspinAPI;
  private environment: Environment;

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
} 