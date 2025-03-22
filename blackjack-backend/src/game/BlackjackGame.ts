import { Card, Deck } from './Deck';
import { GameStateMessage, HandMessage, MessageType } from '../models/Message';

/**
 * Represents a hand of cards in blackjack
 */
export interface Hand {
  type: 'player' | 'dealer' | 'split';
  cards: Card[];
  value: number;
  busted: boolean;
  blackjack: boolean;
  soft: boolean;  // Indicates if the hand contains an Ace counted as 11
}

/**
 * Game outcome types
 */
export enum GameOutcome {
  PLAYER_WIN = 'player_win',
  DEALER_WIN = 'dealer_win',
  PUSH = 'push',
  PLAYER_BLACKJACK = 'player_blackjack',
  PLAYER_BUST = 'player_bust',
  DEALER_BUST = 'dealer_bust',
  SURRENDER = 'surrender',
  INSURANCE_WON = 'insurance_won'
}

/**
 * Result of the game
 */
export interface GameResult {
  outcome: GameOutcome;
  message: string;
  payout: number;
  playerValue: number;
  dealerValue: number;
}

/**
 * Special conditions in the game
 */
export interface SpecialConditions {
  insuranceAvailable: boolean;
  splitAvailable: boolean;
  playerBlackjack: boolean;
  dealerBlackjack: boolean;
}

/**
 * Result of insurance
 */
export interface InsuranceResult {
  dealerHasBlackjack: boolean;
  payout: number;
}

/**
 * Core blackjack game logic
 */
export class BlackjackGame {
  private deck: Deck;
  private playerHand: Hand;
  private dealerHand: Hand;
  private splitHand: Hand | null = null;
  private activeSplitHand: 'first' | 'second' | null = null;
  
  private currentBet: number = 0;
  private lastBet: number = 0;
  private insuranceBet: number = 0;
  
  private gamePhase: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete' = 'betting';
  private doubledDown: boolean = false;
  private surrendered: boolean = false;
  
  // Number of decks to use
  private numDecks: number = 6;
  
  constructor() {
    this.deck = new Deck(this.numDecks);
    this.playerHand = this.createHand('player');
    this.dealerHand = this.createHand('dealer');
  }
  
  /**
   * Create a new hand
   */
  private createHand(type: 'player' | 'dealer' | 'split'): Hand {
    return {
      type,
      cards: [],
      value: 0,
      busted: false,
      blackjack: false,
      soft: false
    };
  }
  
  /**
   * Reset the game state for a new round
   */
  public reset(): void {
    // Create a new deck if less than 25% of cards remain
    if (this.deck.getCardsRemaining() < (52 * this.numDecks * 0.25)) {
      this.deck = new Deck(this.numDecks);
    }
    
    // Reset hands
    this.playerHand = this.createHand('player');
    this.dealerHand = this.createHand('dealer');
    this.splitHand = null;
    this.activeSplitHand = null;
    
    // Reset state
    this.currentBet = 0;
    this.insuranceBet = 0;
    this.doubledDown = false;
    this.surrendered = false;
    this.gamePhase = 'betting';
  }
  
  /**
   * Place a bet
   */
  public placeBet(amount: number): boolean {
    if (this.gamePhase !== 'betting') {
      throw new Error('Cannot place bet - game already in progress');
    }
    
    this.currentBet = amount;
    this.lastBet = amount;
    return true;
  }
  
  /**
   * Check if dealing cards is allowed
   */
  public canDealCards(): boolean {
    return this.gamePhase === 'betting' && this.currentBet > 0;
  }
  
  /**
   * Deal initial cards (2 to player, 2 to dealer with one face down)
   */
  public dealInitialCards(): void {
    // Allow dealing from either betting or dealing phase
    if ((this.gamePhase !== 'betting' && this.gamePhase !== 'dealing') || this.currentBet <= 0) {
      throw new Error(`Cannot deal cards - game not in valid phase (current: ${this.gamePhase}) or no bet placed`);
    }
    
    // Deal first card to player face up
    this.playerHand.cards.push(this.deck.dealCard(true));
    
    // Deal first card to dealer face up
    this.dealerHand.cards.push(this.deck.dealCard(true));
    
    // Deal second card to player face up
    this.playerHand.cards.push(this.deck.dealCard(true));
    
    // Deal second card to dealer face down
    this.dealerHand.cards.push(this.deck.dealCard(false));
    
    // Calculate hand values
    this.calculateHandValues();
    
    // Check for player blackjack
    if (this.playerHand.value === 21) {
      this.playerHand.blackjack = true;
    }
    
    // Change game phase
    this.gamePhase = 'player_turn';
  }
  
  /**
   * Calculate values for all hands
   */
  private calculateHandValues(): void {
    const playerValue = this.calculateHandValue(this.playerHand.cards);
    this.playerHand.value = playerValue.value;
    this.playerHand.soft = playerValue.soft;
    this.playerHand.busted = playerValue.value > 21;
    
    const dealerValue = this.calculateHandValue(this.dealerHand.cards);
    this.dealerHand.value = dealerValue.value;
    this.dealerHand.soft = dealerValue.soft;
    this.dealerHand.busted = dealerValue.value > 21;
    
    if (this.splitHand) {
      const splitValue = this.calculateHandValue(this.splitHand.cards);
      this.splitHand.value = splitValue.value;
      this.splitHand.soft = splitValue.soft;
      this.splitHand.busted = splitValue.value > 21;
    }
  }
  
  /**
   * Calculate the value of a hand (public version)
   */
  public calculateHandValue(cards: Card[], onlyFaceUp: boolean = false): { value: number; soft: boolean; busted: boolean } {
    let value = 0;
    let aces = 0;
    let soft = false;
    
    // Sum up the values of all cards
    for (const card of cards) {
      // Skip face-down cards if onlyFaceUp is true
      if (onlyFaceUp && !card.faceUp) continue;
      
      // Count aces separately
      if (card.rank === 'A') {
        aces++;
      } else {
        value += card.value;
      }
    }
    
    // Add aces with optimal values
    for (let i = 0; i < aces; i++) {
      if (value + 11 <= 21) {
        value += 11;
        soft = true;
      } else {
        value += 1;
      }
    }
    
    // Check for bust
    const busted = value > 21;
    
    return { value, soft, busted };
  }
  
  /**
   * Check for special conditions (blackjack, insurance, split)
   */
  public checkSpecialConditions(): SpecialConditions {
    const conditions: SpecialConditions = {
      insuranceAvailable: this.isInsuranceAvailable(),
      splitAvailable: this.canSplit(),
      playerBlackjack: this.playerHand.blackjack,
      dealerBlackjack: false
    };
    
    // Check for dealer blackjack (only if dealer's up card is A or 10)
    const dealerUpCard = this.dealerHand.cards[0];
    if (dealerUpCard.rank === 'A' || dealerUpCard.value === 10) {
      const dealerSecondCard = this.dealerHand.cards[1];
      conditions.dealerBlackjack = 
        (dealerUpCard.rank === 'A' && dealerSecondCard.value === 10) || 
        (dealerUpCard.value === 10 && dealerSecondCard.rank === 'A');
    }
    
    return conditions;
  }
  
  /**
   * Deal a card to the player (hit)
   * @returns The card that was dealt
   */
  public hit(): Card {
    // Deal a card to the player
    const card = this.deck.dealCard(true);
    this.playerHand.cards.push(card);
    
    // Recalculate hand values
    this.calculateHandValues();
    
    return card;
  }
  
  /**
   * Player action: Stand
   */
  public stand(): void {
    if (this.gamePhase !== 'player_turn') {
      throw new Error('Cannot stand - not player\'s turn');
    }
    
    // Move to dealer's turn
    this.gamePhase = 'dealer_turn';
  }
  
  /**
   * Double down - player doubles bet, gets exactly one more card, and stands
   * @returns The card that was dealt
   */
  public doubleDown(): Card {
    if (this.gamePhase !== 'player_turn') {
      throw new Error('Cannot double down - not in player turn phase');
    }
    
    if (!this.canDoubleDown()) {
      throw new Error('Cannot double down - not eligible (must have exactly 2 cards)');
    }
    
    // Double the bet
    this.currentBet *= 2;
    this.doubledDown = true;
    
    // Deal one more card to player
    const card = this.deck.dealCard(true);
    this.playerHand.cards.push(card);
    
    // Recalculate hand values
    this.calculateHandValues();
    
    // Player turn is over after double down
    this.gamePhase = 'dealer_turn';
    
    return card;
  }
  
  /**
   * Split a pair into two separate hands
   * @returns An array with the first cards of each hand after splitting
   */
  public split(): [Card, Card] {
    if (this.gamePhase !== 'player_turn') {
      throw new Error('Cannot split - not in player turn phase');
    }
    
    if (!this.canSplit()) {
      throw new Error('Cannot split - cards must be of the same rank');
    }
    
    // Create split hand if it doesn't exist
    if (!this.splitHand) {
      this.splitHand = this.createHand('split');
    }
    
    // Move second card from player hand to split hand
    const secondCard = this.playerHand.cards.pop() as Card;
    this.splitHand.cards.push(secondCard);
    
    // Deal a new card to each hand
    const newCardForPlayerHand = this.deck.dealCard(true);
    const newCardForSplitHand = this.deck.dealCard(true);
    
    this.playerHand.cards.push(newCardForPlayerHand);
    this.splitHand.cards.push(newCardForSplitHand);
    
    // Set active split hand
    this.activeSplitHand = 'first';
    
    // Recalculate hand values
    this.calculateHandValues();
    
    // Return the first cards of each hand after splitting
    return [this.playerHand.cards[0], this.splitHand.cards[0]];
  }
  
  /**
   * Deal a card to the specified split hand
   * @param hand Which split hand to hit ('first' or 'second')
   * @returns The card that was dealt
   */
  public hitSplitHand(hand: 'first' | 'second'): Card {
    if (!this.hasSplit()) {
      throw new Error('Cannot hit split hand - no split has been performed');
    }
    
    let cardDealt: Card;
    
    if (hand === 'first') {
      // Hit the main player hand
      cardDealt = this.deck.dealCard(true);
      this.playerHand.cards.push(cardDealt);
    } else {
      // Hit the split hand
      if (!this.splitHand) {
        throw new Error('Split hand is not available');
      }
      
      cardDealt = this.deck.dealCard(true);
      this.splitHand.cards.push(cardDealt);
    }
    
    // Recalculate hand values
    this.calculateHandValues();
    
    return cardDealt;
  }
  
  /**
   * Player action: Stand on split hand
   * @returns Whether this completes player's turn (both hands played)
   */
  public standSplitHand(hand: 'first' | 'second'): boolean {
    if (this.gamePhase !== 'player_turn') {
      throw new Error('Cannot stand - not player\'s turn');
    }
    
    if (!this.splitHand) {
      throw new Error('No split hand exists');
    }
    
    // Switch to the other hand if first hand, or complete player turn if second hand
    if (hand === 'first') {
      // Switch to second hand
      this.activeSplitHand = 'second';
      return false;
    } else {
      // Both hands played, move to dealer's turn
      this.gamePhase = 'dealer_turn';
      return true;
    }
  }
  
  /**
   * Check if both split hands have been played
   */
  private areBothSplitHandsPlayed(): boolean {
    if (!this.splitHand) return true; // No split hand
    
    // Both hands are busted or have 21
    return (
      (this.playerHand.busted || this.playerHand.value >= 21) &&
      (this.splitHand.busted || this.splitHand.value >= 21)
    );
  }
  
  /**
   * Player action: Take Insurance
   */
  public takeInsurance(insuranceAmount: number): InsuranceResult {
    if (!this.isInsuranceAvailable()) {
      throw new Error('Insurance not available');
    }
    
    // Set insurance bet
    this.insuranceBet = insuranceAmount;
    
    // Check if dealer has blackjack
    const dealerUpCard = this.dealerHand.cards[0];
    const dealerDownCard = this.dealerHand.cards[1];
    
    const dealerHasBlackjack = 
      (dealerUpCard.rank === 'A' && dealerDownCard.value === 10) || 
      (dealerUpCard.value === 10 && dealerDownCard.rank === 'A');
    
    // Reveal dealer's hole card if they have blackjack
    if (dealerHasBlackjack) {
      dealerDownCard.faceUp = true;
      this.calculateHandValues();
      this.dealerHand.blackjack = true;
      this.gamePhase = 'complete';
      
      // Insurance pays 2:1
      return {
        dealerHasBlackjack: true,
        payout: this.insuranceBet * 2
      };
    }
    
    // Dealer doesn't have blackjack, player loses insurance bet
    return {
      dealerHasBlackjack: false,
      payout: 0
    };
  }
  
  /**
   * Player action: Decline Insurance
   */
  public declineInsurance(): void {
    // No action needed, just decline and continue
    this.insuranceBet = 0;
  }
  
  /**
   * Player action: Surrender
   */
  public surrender(): number {
    if (this.gamePhase !== 'player_turn') {
      throw new Error('Cannot surrender - not player\'s turn');
    }
    
    if (this.playerHand.cards.length !== 2) {
      throw new Error('Can only surrender on initial two cards');
    }
    
    // Mark as surrendered
    this.surrendered = true;
    this.gamePhase = 'complete';
    
    // Return half the bet
    return this.currentBet / 2;
  }
  
  /**
   * Player action: Clear Bet
   */
  public clearBet(): number {
    if (this.gamePhase !== 'betting') {
      throw new Error('Cannot clear bet - game already in progress');
    }
    
    const returnAmount = this.currentBet;
    this.currentBet = 0;
    
    return returnAmount;
  }
  
  /**
   * Dealer's turn
   */
  public dealerTurn(): void {
    if (this.gamePhase !== 'dealer_turn') {
      throw new Error('Not dealer\'s turn');
    }
    
    // Reveal dealer's hole card
    if (this.dealerHand.cards.length > 1) {
      this.dealerHand.cards[1].faceUp = true;
    }
    
    // Recalculate dealer's hand value with hole card revealed
    this.calculateHandValues();
    
    // Player busted in both hands or surrendered, dealer doesn't need to hit
    if ((this.playerHand.busted && (!this.splitHand || this.splitHand.busted)) || this.surrendered) {
      this.gamePhase = 'complete';
      return;
    }
    
    // Dealer hits until 17 or higher
    while (this.dealerHand.value < 17) {
      this.dealerHand.cards.push(this.deck.dealCard(true));
      this.calculateHandValues();
    }
    
    // Check for dealer bust
    if (this.dealerHand.value > 21) {
      this.dealerHand.busted = true;
    }
    
    // Game complete
    this.gamePhase = 'complete';
  }
  
  /**
   * Check if insurance is available
   */
  private isInsuranceAvailable(): boolean {
    // Insurance is available when dealer's face-up card is an Ace
    return (
      this.gamePhase === 'player_turn' &&
      this.dealerHand.cards.length > 0 &&
      this.dealerHand.cards[0].rank === 'A'
    );
  }
  
  /**
   * Check if the game is over
   */
  public isGameOver(): boolean {
    return this.gamePhase === 'complete';
  }
  
  /**
   * Determine the outcome of the game
   * @returns A string representing the game outcome
   */
  public determineOutcome(): string {
    // Ensure game is complete
    if (this.gamePhase !== 'complete' && this.gamePhase !== 'dealer_turn') {
      console.warn('Game is not complete, outcome may not be final');
    }
    
    // Handle surrender
    if (this.surrendered) {
      return 'surrender';
    }
    
    // Handle blackjack (only applies to initial two cards)
    if (this.playerHand.blackjack && !this.splitHand) {
      if (this.dealerHand.blackjack) {
        // Both have blackjack - push
        return 'push';
      } else {
        // Player has blackjack, dealer doesn't
        return 'player_blackjack';
      }
    } else if (this.dealerHand.blackjack && !this.splitHand) {
      // Dealer has blackjack, player doesn't (and hasn't split)
      return 'dealer_win';
    }
    
    // Handle busts
    if (this.playerHand.busted) {
      return 'player_bust';
    } else if (this.dealerHand.busted) {
      return 'dealer_bust';
    }
    
    // Compare hand values
    if (this.playerHand.value > this.dealerHand.value) {
      return 'player_win';
    } else if (this.playerHand.value < this.dealerHand.value) {
      return 'dealer_win';
    } else {
      return 'push';
    }
  }
  
  /**
   * Get the current bet amount
   */
  public getCurrentBet(): number {
    return this.currentBet;
  }
  
  /**
   * Get the last bet amount (for rebetting)
   */
  public getLastBet(): number {
    return this.lastBet;
  }
  
  /**
   * Check if the game has a split hand
   */
  public hasSplit(): boolean {
    return this.splitHand !== null;
  }
  
  /**
   * Get the dealer's face-up card
   */
  public getDealerUpCard(): Card | null {
    return this.dealerHand.cards.length > 0 ? this.dealerHand.cards[0] : null;
  }
  
  /**
   * Get the player's cards
   */
  public getPlayerCards(): Card[] {
    return [...this.playerHand.cards];
  }
  
  /**
   * Convert a Hand to HandMessage for transmission
   */
  private handToMessage(hand: Hand): HandMessage {
    return {
      type: hand.type,
      cards: hand.cards.filter(card => card.faceUp).map(card => ({
        suit: card.suit,
        rank: card.rank,
        value: card.value,
        faceUp: card.faceUp
      })),
      value: hand.value,
      busted: hand.busted,
      blackjack: hand.blackjack,
      soft: hand.soft
    };
  }
  
  /**
   * Get the current game state message
   */
  public getGameState(): GameStateMessage {
    const allowedActions: MessageType[] = [];
    
    // Add allowed actions based on game phase
    if (this.gamePhase === 'betting') {
      allowedActions.push(MessageType.PLACE_BET);
      
      if (this.currentBet > 0) {
        allowedActions.push(MessageType.DEAL_CARDS);
        allowedActions.push(MessageType.CLEAR_BET);
      }
      
      if (this.lastBet > 0) {
        allowedActions.push(MessageType.REBET);
      }
    } 
    // Add dealing phase handling to ensure buttons show up right after dealing
    else if (this.gamePhase === 'dealing') {
      // In the dealing phase, we should prepare the same actions as player_turn
      // since we'll transition to player_turn immediately after dealing
      allowedActions.push(MessageType.HIT);
      allowedActions.push(MessageType.STAND);
      
      // Only allow double down on initial two cards
      if (this.playerHand.cards.length === 2 && !this.hasSplit()) {
        allowedActions.push(MessageType.DOUBLE_DOWN, MessageType.SURRENDER);
      }
      
      // Allow split if possible
      if (this.canSplit()) {
        allowedActions.push(MessageType.SPLIT);
      }
      
      // Allow insurance if available
      if (this.isInsuranceAvailable()) {
        allowedActions.push(MessageType.INSURANCE);
      }
    }
    else if (this.gamePhase === 'player_turn') {
      allowedActions.push(MessageType.HIT);
      allowedActions.push(MessageType.STAND);
      
      // Only allow double down on initial two cards
      if (this.playerHand.cards.length === 2 && !this.hasSplit()) {
        allowedActions.push(MessageType.DOUBLE_DOWN, MessageType.SURRENDER);
      }
      
      // Allow split if possible
      if (this.canSplit()) {
        allowedActions.push(MessageType.SPLIT);
      }
      
      // Allow insurance if available
      if (this.isInsuranceAvailable()) {
        allowedActions.push(MessageType.INSURANCE);
      }
    } else if (this.gamePhase === 'complete') {
      allowedActions.push(MessageType.PLACE_BET);
      allowedActions.push(MessageType.REBET);
    }
    
    // Create game state message
    return {
      playerHand: this.handToMessage(this.playerHand),
      dealerHand: this.handToMessage(this.dealerHand),
      splitHand: this.splitHand ? this.handToMessage(this.splitHand) : undefined,
      activeSplitHand: this.activeSplitHand,
      playerBalance: 0, // To be filled by GameSession
      currentBet: this.currentBet,
      insuranceBet: this.insuranceBet,
      gamePhase: this.gamePhase,
      allowedActions
    };
  }

  /**
   * Get the current game phase
   */
  public getGamePhase(): 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete' {
    return this.gamePhase;
  }

  /**
   * Set the game phase
   */
  public setGamePhase(phase: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete'): void {
    this.gamePhase = phase;
  }

  /**
   * Get the insurance bet amount
   */
  public getInsuranceBet(): number {
    return this.insuranceBet;
  }

  /**
   * Check if player's turn is over
   * This happens when player busts, has 21, or has completed all hands in a split
   */
  public isPlayerTurnOver(): boolean {
    // If player busted, turn is over
    if (this.playerHand.busted) {
      return true;
    }
    
    // If player has 21, turn is over
    if (this.playerHand.value === 21) {
      return true;
    }
    
    // If this is a split hand, check both hands
    if (this.splitHand) {
      // If we're on the second hand
      if (this.activeSplitHand === 'second') {
        return this.splitHand.busted || this.splitHand.value === 21;
      }
      // If we're on the first hand and it's done (busted or 21)
      else if (this.activeSplitHand === 'first' && (this.playerHand.busted || this.playerHand.value === 21)) {
        // Switch to second hand and continue
        this.activeSplitHand = 'second';
        return false;
      }
    }
    
    // If we doubled down, turn is over
    if (this.doubledDown) {
      return true;
    }
    
    return false;
  }

  /**
   * Reveal the dealer's hole card
   */
  public revealDealerCard(): void {
    if (this.dealerHand.cards.length >= 2) {
      this.dealerHand.cards[1].faceUp = true;
      this.calculateHandValues();
    }
  }

  /**
   * Execute the dealer's turn following blackjack rules
   * Dealer must hit on 16 or less, and stand on 17 or more
   */
  public executeDealerTurn(): void {
    // Skip if player busted
    if (this.playerHand.busted && (!this.splitHand || this.splitHand.busted)) {
      return;
    }
    
    // Reveal dealer's hole card if not already revealed
    this.revealDealerCard();
    
    // Dealer hits until 17 or more
    while (this.dealerHand.value < 17) {
      const card = this.deck.dealCard(true);
      this.dealerHand.cards.push(card);
      this.calculateHandValues();
    }
  }

  /**
   * Check if the player can double down
   * Player can double down if they have only 2 cards
   */
  public canDoubleDown(): boolean {
    return this.gamePhase === 'player_turn' && 
           this.playerHand.cards.length === 2 && 
           !this.doubledDown;
  }

  /**
   * Check if the player can surrender
   * Player can surrender on their first action if they have only 2 cards
   */
  public canSurrender(): boolean {
    return this.gamePhase === 'player_turn' && 
           this.playerHand.cards.length === 2 && 
           !this.doubledDown && 
           !this.splitHand;
  }

  /**
   * Check if the player can take insurance
   * Player can take insurance if dealer's up card is an Ace
   */
  public canTakeInsurance(): boolean {
    if (this.gamePhase !== 'player_turn' || this.insuranceBet > 0) {
      return false;
    }
    
    const dealerUpCard = this.getDealerUpCard();
    return dealerUpCard !== null && dealerUpCard.rank === 'A';
  }

  /**
   * Player action: Double Down alias for external access
   * Public method that calls the private doubleDown method
   */
  public playerDoubleDown(): void {
    this.doubleDown();
  }

  /**
   * Player action: Split alias for external access
   * Public method that calls the private split method
   */
  public playerSplit(): void {
    this.split();
  }

  /**
   * Get the active split hand for the UI
   * This helps the UI know which hand is currently being played
   */
  public getActiveSplitHandForUI(): 'first' | 'second' | null {
    return this.activeSplitHand;
  }
  
  /**
   * Player action: Hit alias for external access
   * Public method that calls the private hit method
   */
  public playerHit(): void {
    this.hit();
  }

  /**
   * Player action: Stand alias for external access
   * Public method that calls the private stand method
   */
  public playerStand(): void {
    this.stand();
  }

  /**
   * Set the active split hand for the UI
   * @param hand The hand to set as active
   */
  public setActiveSplitHandUI(hand: 'first' | 'second'): void {
    if (this.hasSplit() && (hand === 'first' || hand === 'second')) {
      this.activeSplitHand = hand;
    }
  }

  /**
   * Get the dealer's cards
   */
  public getDealerCards(): Card[] {
    return this.dealerHand.cards;
  }
  
  /**
   * Get the cards from the split hand
   */
  public getSplitCards(): Card[] | null {
    if (!this.splitHand) {
      return null;
    }
    return this.splitHand.cards;
  }
  
  /**
   * Check if the dealer has blackjack
   */
  public checkDealerHasBlackjack(): boolean {
    // Dealer needs exactly 2 cards with a value of 21
    if (this.dealerHand.cards.length !== 2) {
      return false;
    }
    
    // Calculate the value considering all cards (including face down)
    const value = this.calculateHandValue(this.dealerHand.cards, false).value;
    return value === 21;
  }

  /**
   * Check if the dealer should hit according to blackjack rules
   */
  public dealerShouldHit(): boolean {
    const dealerValue = this.dealerHand.value;
    
    // Dealer must hit on 16 or less
    if (dealerValue <= 16) {
      return true;
    }
    
    // Dealer must hit on soft 17 (Ace counted as 11 with total of 17)
    if (dealerValue === 17 && this.dealerHand.soft) {
      return true;
    }
    
    // Otherwise, dealer stands
    return false;
  }
  
  /**
   * Deal a card to the dealer
   * @returns The card that was dealt
   */
  public dealerHit(): Card {
    if (this.gamePhase !== 'dealer_turn') {
      throw new Error('Cannot hit dealer - not in dealer turn phase');
    }
    
    // Deal a card to the dealer
    const card = this.deck.dealCard(true);
    this.dealerHand.cards.push(card);
    
    // Recalculate hand values
    this.calculateHandValues();
    
    return card;
  }
  
  /**
   * Check if the player can split their hand
   * Public method that can be called from GameSession
   */
  public canSplit(): boolean {
    // Must have exactly 2 cards
    if (this.playerHand.cards.length !== 2) {
      return false;
    }
    
    // Cards must be of the same rank
    const [card1, card2] = this.playerHand.cards;
    return card1.rank === card2.rank;
  }

  /**
   * Get the split hand
   */
  public getSplitHand(): Hand | null {
    return this.splitHand;
  }

  /**
   * Calculate payout for a specific outcome
   * @param outcome The game outcome to calculate payout for
   * @returns The payout amount
   */
  public calculatePayoutForOutcome(outcome: string): number {
    // Get the current bet amount
    const betAmount = this.getCurrentBet();
    
    // Default payout is 0 (loss)
    let payout = 0;
    
    // Calculate payout based on outcome
    switch (outcome) {
      case 'player_blackjack':
        // Blackjack pays 3:2
        payout = betAmount + (betAmount * 1.5);
        break;
        
      case 'player_win':
      case 'dealer_bust':
        // Regular win pays 1:1
        payout = betAmount * 2;
        break;
        
      case 'push':
        // Push returns original bet
        payout = betAmount;
        break;
        
      case 'surrender':
        // Surrender returns half the bet
        payout = betAmount / 2;
        break;
        
      // All other outcomes (dealer_win, player_bust) pay nothing
      default:
        payout = 0;
    }
    
    console.log(`Calculated payout for ${outcome}: ${payout} (bet: ${betAmount})`);
    return payout;
  }

  /**
   * Get the current value of the player's hand
   * @returns The player hand value
   */
  public getPlayerValue(): number {
    return this.playerHand.value;
  }

  /**
   * Get the current value of the dealer's hand
   * @returns The dealer hand value
   */
  public getDealerValue(): number {
    return this.dealerHand.value;
  }

  /**
   * Get the detailed game result (for compatibility with old code)
   * @returns The complete game result object
   */
  public getDetailedGameResult(): GameResult {
    const outcome = this.determineOutcome();
    let message = '';
    
    switch (outcome) {
      case 'player_blackjack':
        message = 'Blackjack! You win!';
        break;
      case 'player_win':
        message = 'You win!';
        break;
      case 'dealer_win':
        message = 'Dealer wins';
        break;
      case 'push':
        message = "Push - it's a tie";
        break;
      case 'player_bust':
        message = 'Bust! You lose';
        break;
      case 'dealer_bust':
        message = 'Dealer busts! You win';
        break;
      case 'surrender':
        message = 'You surrendered';
        break;
      default:
        message = 'Game over';
    }
    
    return {
      outcome: outcome as GameOutcome,
      message: message,
      payout: this.calculatePayoutForOutcome(outcome),
      playerValue: this.playerHand.value,
      dealerValue: this.dealerHand.value
    };
  }
} 