import { Hand } from "../hand";

/**
 * Types of messages that can be sent between client and server
 */
export enum MessageType {
  // Connection related
  CONNECTED = 'connected',
  ERROR = 'error',
  
  // Core game flow
  START_GAME = 'start_game',
  DEAL_CARDS = 'deal_cards',
  GAME_STATE = 'game_state',
  BALANCE_UPDATE = 'balance_update',
  GAME_OUTCOME = 'game_outcome',
  
  // Player actions
  PLACE_BET = 'place_bet',
  HIT = 'hit',
  STAND = 'stand',
  DOUBLE_DOWN = 'double_down',
  SPLIT = 'split',
  SURRENDER = 'surrender',
  INSURANCE = 'insurance',
  REBET = 'rebet',
  CLEAR_BET = 'clear_bet',
  
  // Special conditions
  SPECIAL_CASE = 'special_case',
  
  // Legacy/compatibility types
  PHASE_CHANGE = 'phase_change',
  HAND_UPDATED = 'hand_updated',
  BET_PLACED = 'bet_placed',
  ACTION_RESULT = 'action_result',
  PLAYER_TURN = 'player_turn',
  DEALER_TURN = 'dealer_turn',
  CARD_DEALT = 'card_dealt',
  SPLIT_RESULT = 'split_result',
  CREATE_SESSION = 'create_session',
  RETURN_TO_BETTING = 'return_to_betting',
  GAME_READY = 'game_ready',
  
  // Utility
  GET_PLAYER_DATA = 'get_player_data',
  GET_GAME_STATE = 'get_game_state'
} 

export enum CardSuit {
  HEARTS = 'hearts',
  DIAMONDS = 'diamonds',
  CLUBS = 'clubs',
  SPADES = 'spades'
}

export enum CardRank {
  ACE = 'A',
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K'
}

export enum HandType {
  PLAYER = 'player',
  DEALER = 'dealer',
  SPLIT = 'split'
}

export interface Card {
  suit: CardSuit;
  rank: CardRank;
  value: number;
  faceUp: boolean;
}



export interface starGame {
  playerHand: Hand;
  dealerHand: Hand;
  activeSplitHand: 'first' | 'second' | null;
  playerBalance: number;
  currentBet: number;
  insuranceBet: number;
  gamePhase?: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete';
  allowedActions?: MessageType[];
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
  card: Card;     // The card being dealt
  target: 'player' | 'dealer' | 'split';  // Where the card should be placed
  isHoleCard?: boolean;  // Indicates this is the dealer's hidden hole card being revealed
  isAdditionalCard?: boolean; // Indicates this is an additional card after the hole card is revealed
}

/**
 * Create a standardized error message
 */
export interface ErrorMessage {
  type: MessageType.ERROR;
  data: { message: string };
  error: string;
} 