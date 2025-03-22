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
  
  // Additional actions
  REBET = 'rebet',
  CLEAR_BET = 'clear_bet',
  ACTION_RESULT = "ACTION_RESULT"
} 