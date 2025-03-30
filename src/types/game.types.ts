export interface LoginData {
  loginMethod: string;
  timestamp: number;
  jwt: string;
  userId: string;
}

export interface ExternalApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BetValidationResponse {
  isValid: boolean;
  availableChips: number;
}

export interface UserData {
  userId: string;
  username: string;
  chips: number;
  isAuthenticated: boolean;
}

export interface BetResult {
  userId: string;
  betAmount: number;
  chipsWon: number;
} 