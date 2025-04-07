import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Environment type definition
export type Environment = 'development' | 'test' | 'production';

// Environment configuration interface
export interface EnvConfig {
  NODE_ENV: Environment;
  PORT: number;
  TEST_API_URL: string;
  PROD_API_URL: string;
  GAME_PASSWORD: string;
}

// Default values for non-sensitive configuration
const defaults: Partial<EnvConfig> = {
  NODE_ENV: 'development',
  PORT: 3001
};

// Validate and export environment variables
export const env: EnvConfig = {
  NODE_ENV: (process.env.NODE_ENV as Environment) || defaults.NODE_ENV as Environment,
  PORT: parseInt(process.env.PORT || defaults.PORT?.toString() || "3001", 10),
  TEST_API_URL: process.env.TEST_API_URL || '',
  PROD_API_URL: process.env.PROD_API_URL || '',
  GAME_PASSWORD: process.env.GAME_PASSWORD || ''
};

// Validate required environment variables
const requiredEnvVars: (keyof EnvConfig)[] = ['GAME_PASSWORD', 'TEST_API_URL', 'PROD_API_URL'];
for (const envVar of requiredEnvVars) {
  if (!env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Log environment configuration (excluding sensitive data)
console.log('Environment Configuration:', {
  NODE_ENV: env.NODE_ENV,
  PORT: env.PORT,
  TEST_API_URL: env.TEST_API_URL ? '[SET]' : undefined,
  PROD_API_URL: env.PROD_API_URL ? '[SET]' : undefined,
  GAME_PASSWORD: env.GAME_PASSWORD ? '[REDACTED]' : undefined
}); 