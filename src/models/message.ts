/**
 * Types of messages that can be sent between client and server
 */
export enum MessageType {
  // Connection related
  CONNECTED = 'connected',
  ERROR = 'error',
  
  // Core game flow - ONLY THESE 4 MESSAGES WILL BE USED FOR GAME COMMUNICATION
  START_GAME = 'start_game',     // For starting the game with initial state
  CARD_DEALT = 'card_dealt',     // For all card dealing operations with target and card info
  PHASE_CHANGE = 'phase_change', // For communicating game phase transitions
  GAME_END = 'game_end',         // For game outcome, payout, balance and currentBet
  GAME_STATE = 'game_state',     // For sending full game state (added back for gamestate synchronization)

  // Authentication (still needed)
  AUTHENTICATE = 'authenticate',
  AUTH_SUCCESS = 'auth_success',
  AUTH_ERROR = 'auth_error',
  AUTH_FAILED = 'auth_failed',   // Added for consistent authentication messaging
  
  // Leaderboard (only when asked)
  GET_LEADERBOARD = "get_leaderboard",
  LEADERBOARD_DATA = "leaderboard_data",
  
  // Special case (required for insurance/split)
  SPECIAL_CASE = 'special_case',
  
  // Required for client messages to server
  PLACE_BET = 'place_bet',
  HIT = 'hit',
  STAND = 'stand',
  DOUBLE_DOWN = 'double_down',
  SPLIT = 'split',
  SURRENDER = 'surrender',
  INSURANCE = 'insurance',
  REBET = 'rebet',
  CLEAR_BET = 'clear_bet',
  
  // COMMENTED OUT - NO LONGER USED IN SERVER-TO-CLIENT COMMUNICATION
  /*
  DEAL_CARDS = 'deal_cards',
  BALANCE_UPDATE = 'balance_update',
  GAME_OUTCOME = 'game_outcome',
  HAND_UPDATED = 'hand_updated',
  BET_PLACED = 'bet_placed',
  ACTION_RESULT = 'action_result',
  PLAYER_TURN = 'player_turn',
  DEALER_TURN = 'dealer_turn',
  SPLIT_RESULT = 'split_result',
  CREATE_SESSION = 'create_session',
  RETURN_TO_BETTING = 'return_to_betting',
  GAME_READY = 'game_ready',
  GET_PLAYER_DATA = 'get_player_data',
  GET_GAME_STATE = 'get_game_state',
  JOIN_SESSION = "JOIN_SESSION",
  BET_VALIDATED = "BET_VALIDATED",
  RANDOM_NUMBERS = "RANDOM_NUMBERS",
  LEADERBOARD = "LEADERBOARD",
  BET_SAVED = "BET_SAVED"
  */
}

/**
 * Base interface for all messages
 */
interface BaseMessage {
  type: MessageType;
  data?: any;
}

/**
 * Messages sent from client to server
 */
export interface ClientMessage extends BaseMessage {
  // No additional properties needed
}

/**
 * Messages sent from server to client
 */
export interface ServerMessage extends BaseMessage {
  error?: string;
}

/**
 * Card representation for messaging
 */
export interface CardMessage {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
  value: number; 
  faceUp: boolean;
}

/**
 * Hand representation for messaging
 */
export interface HandMessage {
  type: 'player' | 'dealer' | 'split';
  cards: CardMessage[];
  value: number;
  busted: boolean;
  blackjack: boolean;
  soft: boolean;
}

/**
 * Game state representation for messaging
 */
export interface GameStateMessage {
  playerHand?: HandMessage;
  dealerHand?: HandMessage;
  splitHand?: HandMessage;
  activeSplitHand?: 'first' | 'second' | null;
  playerBalance: number;
  currentBet: number;
  insuranceBet: number;
  gamePhase: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete';
  allowedActions: MessageType[];
  outcome?: string;
  message?: string;
  hasSplit?: boolean;
  firstHand?: HandMessage;
  secondHand?: HandMessage;
}

/**
 * Game outcome representation for messaging
 */
export interface GameOutcomeMessage {
  outcome: string;
  message: string;
  payout: number;
  playerHandValue: number;
  dealerHandValue: number;
  playerBalance: number;
}

/**
 * Special case message for insurance and split
 */
export interface SpecialCaseMessage {
  type: 'insurance' | 'split';
  // Making specific data fields optional as frontend only uses the type
  dealerCard?: any;
  insuranceAmount?: number;
  cards?: any[];
}

/**
 * Card dealt message - simplified format for card dealing
 */
export interface CardDealtMessage {
  card: CardMessage;     // The card being dealt
  target: 'player' | 'dealer' | 'split';  // Where the card should be placed
  isHoleCard?: boolean;  // Indicates this is the dealer's hidden hole card being revealed
  isAdditionalCard?: boolean; // Indicates this is an additional card after the hole card is revealed
  allowedActions?: MessageType[]; // Optional: allowed actions after this card
}

/**
 * Create a standardized error message
 */
export function createErrorMessage(message: string): ServerMessage {
  return {
    type: MessageType.ERROR,
    data: { message },
    error: message
  };
}

/**
 * Create a standardized phase change message
 */
export function createPhaseChangeMessage(from: string, to: string, message: string = ""): ServerMessage {
  return {
    type: MessageType.PHASE_CHANGE,
    data: { 
      from,
      to,
      message
    }
  };
}