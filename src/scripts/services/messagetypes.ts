import { Hand } from "../hand";

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
  CARD_DEALT = 'card_dealt',
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
  
  // Additional actions
  REBET = 'rebet',
  CLEAR_BET = 'clear_bet',
  ACTION_RESULT = "action_result",
  START_GAME = "start_game"
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

