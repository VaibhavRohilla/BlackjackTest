// Define the message interfaces without external dependencies
// No import needed since we'll use generic types

// Message types enum to match backend MessageType
export enum MessageType {
    START_GAME = 'start_game',
    CARD_DEALT = 'card_dealt',
    PHASE_CHANGE = 'phase_change',
    GAME_END = 'game_end',
    GAME_STATE = 'game_state',
    AUTHENTICATE = 'authenticate',
    AUTH_SUCCESS = 'auth_success',
    AUTH_ERROR = 'auth_error',
    AUTH_FAILED = 'auth_failed',
    GET_LEADERBOARD = "get_leaderboard",
    LEADERBOARD_DATA = "leaderboard_data",
    SPECIAL_CASE = 'special_case',
    PLACE_BET = 'place_bet',
    HIT = 'hit',
    STAND = 'stand',
    DOUBLE_DOWN = 'double_down',
    SPLIT = 'split',
    SURRENDER = 'surrender',
    INSURANCE = 'insurance',
    REBET = 'rebet',
    CLEAR_BET = 'clear_bet',
    // Add new types for reconnection handling
    RECONNECT_STATE_RESTORED = 'RECONNECT_STATE_RESTORED'
}

// Interface for card objects
export interface CardType {
    suit: string;
    rank: string;
    value: number;
    faceUp: boolean;
}

// Interface for the start game message
export interface starGame {
    playerBalance: number;
    currentBet: number;
    gamePhase: string;
    playerHand?: any;
    dealerHand?: any;
    allowedActions?: string[];
    // New properties for supporting restored game state
    restoredState?: boolean;
    hasSplit?: boolean;
    secondHand?: any;
    splitHand?: any;
    firstHand?: any;
    activeSplitHand?: 'first' | 'second';
    activeHand?: 'first' | 'second';
    // Add outcome for restored completed games
    outcome?: string;
    payout?: number;
    completedOffline?: boolean;
    // Add insurance properties
    insuranceAmount?: number;
    insurancePayout?: number;
}

// Interface for the card dealt message
export interface cardDealt {
    card: CardType;
    target: string;
    isHoleCard?: boolean;
    isAdditionalCard?: boolean;
    allowedActions?: string[];
} 