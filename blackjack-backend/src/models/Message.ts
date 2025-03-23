/**
 * Types of messages that can be sent between client and server
 */
export enum MessageType {
  // Connection related
  CONNECTED = 'connected',
  ERROR = 'error',
  
  // Game session related
  CREATE_SESSION = 'create_session',
  SESSION_CREATED = 'session_created',
  JOIN_SESSION = 'join_session',
  GAME_READY = 'game_ready',
  GET_PLAYER_DATA = 'get_player_data',
  GET_GAME_STATE = 'get_game_state',
  
  // Game initialization
  PLACE_BET = 'place_bet',
  BET_PLACED = 'bet_placed',
  DEAL_CARDS = 'deal_cards',
  CARDS_DEALT = 'cards_dealt',
  INITIAL_STATE = 'initial_state',
  
  // Game actions
  HIT = 'hit',
  STAND = 'stand',
  DOUBLE_DOWN = 'double_down',
  SPLIT = 'split',
  SURRENDER = 'surrender',
  INSURANCE = 'insurance',
  
  // Game events
  PLAYER_TURN = 'player_turn',
  DEALER_TURN = 'dealer_turn',
  CARD_DEALT = 'card_dealt',
  DEALER_CARD_REVEALED = 'dealer_card_revealed',
  HAND_UPDATED = 'hand_updated',
  
  // Special conditions
  OFFER_INSURANCE = 'offer_insurance',
  INSURANCE_RESULT = 'insurance_result',
  OFFER_SPLIT = 'offer_split',
  SPLIT_RESULT = 'split_result',
  SPLIT_HAND_SWITCH = 'split_hand_switch',
  
  // Game outcome
  GAME_OUTCOME = 'game_outcome',
  PLAYER_BALANCE_UPDATE = 'player_balance_update',
  
  // Phase transitions
  PHASE_CHANGE = 'phase_change',
  RETURN_TO_BETTING = 'return_to_betting',
  
  // Action results
  ACTION_RESULT = 'action_result',
  
  // Additional actions
  REBET = 'rebet',
  CLEAR_BET = 'clear_bet',
  START_GAME = 'start_game'
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
  // No sessionId property needed anymore
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
 * Create a standardized error message
 */
export function createErrorMessage(message: string): ServerMessage {
  return {
    type: MessageType.ERROR,
    data: { message },
    error: message
  };
} 