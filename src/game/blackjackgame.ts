import { GameStateMessage, HandMessage, MessageType } from '../models/message';
import { Card, Deck } from './deck';

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
  outcome: 'insurance_won' | 'insurance_lose';
  dealerHasBlackjack: boolean;
  payout: number;
}

/**
 * Split hand outcome result
 */
export interface SplitOutcome {
  handOneOutcome: string;
  handTwoOutcome: string;
  combinedOutcome: string;
}

/**
 * Comprehensive game result that includes all outcome information
 */
export interface CompleteGameResult {
  // Primary outcome classification
  outcomeType: 'normal' | 'insurance' | 'split';
  
  // Final outcome string to use for display/UI
  finalOutcomeString: string;
  
  // Payout amount
  payout: number;
  
  // Insurance specifics (only set if insurance was involved)
  insurance?: {
    bet: number;
    payout: number;
    won: boolean;
  };
  
  // Split specifics (only set if split was involved)
  split?: {
    handOneOutcome: string;
    handTwoOutcome: string;
    handOnePayout: number;
    handTwoPayout: number;
  };
  
  // The game message to display
  message: string;
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
  private originalBetBeforeDouble: number = 0;
  private insuranceBet: number = 0;
  
  private gamePhase: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete' = 'betting';
  private doubledDown: boolean = false;
  private surrendered: boolean = false;
  public randomNumbers : number[] = [];
  
  // Number of decks to use
  private numDecks: number = 6;
  
  // First, add a property to track previous phase
  private previousGamePhase: string = 'betting';
  
  // Track the next random number index to use
  private randomNumberIndex: number = 0;
  
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
    // Debug logging before reset
    console.log(`[RESET DEBUG] Starting reset with phase=${this.gamePhase}, bet=${this.currentBet}`);
    
    // Store the current bet and phase
    const currentBet = this.currentBet;
    const currentPhase = this.gamePhase;
    
    // Store the last bet amount before resetting current bet
    if (this.doubledDown && this.originalBetBeforeDouble > 0) {
        this.lastBet = this.originalBetBeforeDouble;
    } else if (this.currentBet > 0) {
        this.lastBet = this.currentBet;
    }
    
    // Only reset the current bet if not in dealer_turn or complete phases
    // This ensures bet amount is preserved during payout calculation
    if (currentPhase !== 'dealer_turn' && currentPhase !== 'complete') {
        this.currentBet = 0;
        console.log(`[RESET DEBUG] Reset currentBet to 0. Phase=${currentPhase}`);
    } else {
        console.log(`[RESET DEBUG] Preserved currentBet=${this.currentBet} during ${currentPhase} phase`);
    }
    
    this.originalBetBeforeDouble = 0;
    this.playerHand = this.createHand('player');
    this.dealerHand = this.createHand('dealer');
    this.splitHand = null;
    this.activeSplitHand = null;
    this.insuranceBet = 0;
    this.doubledDown = false;
    this.surrendered = false;
    
    // Only change phase to betting if not in a critical phase
    if (currentPhase !== 'dealer_turn' && currentPhase !== 'complete') {
        this.gamePhase = 'betting';
    }
    
    // Debug logging after reset
    console.log(`[RESET DEBUG] Finished reset with phase=${this.gamePhase}, bet=${this.currentBet}`);
  }
  
  /**
   * Place a bet
   */
  public placeBet(amount: number): boolean {
    console.log(`[PLACE BET DEBUG] Placing bet of ${amount} with phase=${this.gamePhase}`);
    
    if (this.gamePhase !== 'betting' &&  this.gamePhase !== 'complete') {
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
   * Deal the initial cards to the player and dealer
   */
  public dealInitialCards(): void {
    // Reset any existing hands
    this.playerHand = this.createHand('player');
    this.dealerHand = this.createHand('dealer');
    this.splitHand = null;
    this.activeSplitHand = null;
    
    // Reset flags
    this.doubledDown = false;
    this.surrendered = false;
    
    if (this.deck.getCardsRemaining() < 15) {
      console.log("Reshuffling deck - not enough cards remaining");
      this.deck = new Deck(this.numDecks);
    }
    
    // Deal first card to player face up
    const playerCard1 = this.deck.dealCard(true, this.getNextRandomNumber());
    this.playerHand.cards.push(playerCard1);
    
    // Deal first card to dealer face up
    const dealerCard1 = this.deck.dealCard(true, this.getNextRandomNumber());
    this.dealerHand.cards.push(dealerCard1);
    
    // Deal second card to player face up
    const playerCard2 = this.deck.dealCard(true, this.getNextRandomNumber());
    this.playerHand.cards.push(playerCard2);
    
    // Deal second card to dealer face down
    const dealerCard2 = this.deck.dealCard(false, this.getNextRandomNumber());
    this.dealerHand.cards.push(dealerCard2);
    
    // console.log(`Dealt initial cards: Player [${playerCard1.rank}${playerCard1.suit[0]}, ${playerCard2.rank}${playerCard2.suit[0]}], Dealer [${dealerCard1.rank}${dealerCard1.suit[0]}, ${dealerCard2.rank}${dealerCard2.suit[0]}]`);
    
    // Calculate hand values
    this.calculateHandValues();
    
    // Log blackjack info for debugging
    console.log(`Player hand value: ${this.playerHand.value}, Blackjack: ${this.playerHand.blackjack}`);
    console.log(`Dealer hand value: ${this.dealerHand.value}, Blackjack: ${this.dealerHand.blackjack}`);
    
    // Double check player blackjack
    if (this.playerHand.value === 21 && this.playerHand.cards.length === 2) {
      console.log("CONFIRMED: Player has a blackjack!");
      this.playerHand.blackjack = true;
    }
    
    // Change game phase
    this.gamePhase = 'player_turn';
  }
  
  /**
   * Calculate values of all hands
   */
  private calculateHandValues(): void {
    const playerValue = this.calculateHandValue(this.playerHand.cards);
    this.playerHand.value = playerValue.value;
    this.playerHand.soft = playerValue.soft;
    this.playerHand.busted = playerValue.value > 21;
    
    // Check for blackjack - must have exactly 2 cards and a value of 21
    this.playerHand.blackjack = (this.playerHand.cards.length === 2 && this.playerHand.value === 21);
    
    const dealerValue = this.calculateHandValue(this.dealerHand.cards);
    this.dealerHand.value = dealerValue.value;
    this.dealerHand.soft = dealerValue.soft;
    this.dealerHand.busted = dealerValue.value > 21;
    
    // Check for dealer blackjack
    this.dealerHand.blackjack = (this.dealerHand.cards.length === 2 && this.dealerHand.value === 21);
    
    if (this.splitHand) {
      const splitValue = this.calculateHandValue(this.splitHand.cards);
      this.splitHand.value = splitValue.value;
      this.splitHand.soft = splitValue.soft;
      this.splitHand.busted = splitValue.value > 21;
      
      // Split hands can also have blackjack
      this.splitHand.blackjack = (this.splitHand.cards.length === 2 && this.splitHand.value === 21);
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
      playerBlackjack: false,
      dealerBlackjack: false
    };
    
    // Check for player blackjack - must have exactly 2 cards and value of 21
    if (this.playerHand.cards.length === 2 && this.playerHand.value === 21) {
      conditions.playerBlackjack = true;
      this.playerHand.blackjack = true;
    }
    
    // Check for dealer blackjack (only if dealer's up card is A or 10)
    const dealerUpCard = this.dealerHand.cards[0];
    if (dealerUpCard && (dealerUpCard.rank === 'A' || dealerUpCard.value === 10)) {
      const dealerSecondCard = this.dealerHand.cards[1];
      if (dealerSecondCard) {
        conditions.dealerBlackjack = 
          (dealerUpCard.rank === 'A' && dealerSecondCard.value === 10) || 
          (dealerUpCard.value === 10 && dealerSecondCard.rank === 'A');
        
        if (conditions.dealerBlackjack) {
          this.dealerHand.blackjack = true;
        }
      }
    }
    
    return conditions;
  }
  
  /**
   * Deal a card to the player (hit)
   * @returns The card that was dealt
   */
  public hit(): Card {
    // Deal a card to the player
    const card = this.deck.dealCard(true, this.getNextRandomNumber());
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
    
    // Store the original bet before doubling
    this.originalBetBeforeDouble = this.currentBet;
    
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
      throw new Error('Cannot split - cards must be of the same value');
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
    
    // Both hands are busted or have 21 (considered complete)
    const isFirstHandComplete = this.playerHand.busted || this.playerHand.value === 21;
    const isSecondHandComplete = this.splitHand.busted || this.splitHand.value === 21;
    
    // Both hands are complete if they're both either busted or have 21
    return isFirstHandComplete && isSecondHandComplete;
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
        outcome: 'insurance_won',
        dealerHasBlackjack: true,
        payout: this.insuranceBet * 2
      };
    }
    
    // Dealer doesn't have blackjack, player loses insurance bet
    return {
      outcome: 'insurance_lose',
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
      this.dealerHand.cards.push(this.deck.dealCard(true, this.getNextRandomNumber()));
      this.calculateHandValues();
    }
    
    // Check for dealer bust
    if (this.dealerHand.value > 21) {
      this.dealerHand.busted = true;
    }
    
    this.gamePhase = 'complete';
  }
  
  /**
   * Check if insurance is available
   */
  private isInsuranceAvailable(): boolean {
    // Insurance is available when dealer's face-up card is an Ace
    return (
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
   * Determine the outcome of a specific hand
   * @param hand The hand to evaluate (playerHand or splitHand)
   * @returns A string representing the hand outcome
   */
  public determineHandOutcome(hand: Hand): string {
    // Handle blackjack (only applies to initial two cards)
    if (hand.blackjack) {
      if (this.dealerHand.blackjack) {
        // Both have blackjack - push
        return 'push';
      } else {
        // Hand has blackjack, dealer doesn't
        return 'player_blackjack';
      }
    } else if (this.dealerHand.blackjack) {
      // Dealer has blackjack, hand doesn't
      return 'dealer_win';
    }
    
    // Handle busts
    if (hand.busted) {
      return 'player_bust';
    } else if (this.dealerHand.busted) {
      return 'dealer_bust';
    }
    
    // Compare hand values
    if (hand.value > this.dealerHand.value) {
      // Check if player has 21 regardless of the number of cards
      if (hand.value === 21) {
        // Always return player_blackjack when player has 21
        return 'player_blackjack';
      }
      // Otherwise it's a regular win
      return 'player_win';
    } else if (hand.value < this.dealerHand.value) {
      return 'dealer_win';
    } else {
      return 'push';
    }
  }
  
  /**
   * Determine the outcome of the game
   * @returns A string representing the game outcome or an object with outcomes for split hands
   */
  public determineOutcome(): string | SplitOutcome {
    // Ensure game is complete
    if (this.gamePhase !== 'complete' && this.gamePhase !== 'dealer_turn') {
      console.warn('Game is not complete, outcome may not be final');
      
      // Set game phase to complete if we're determining outcome
      this.gamePhase = 'complete';
    }
    
    // Handle surrender
    if (this.surrendered) {
      return 'surrender';
    }
    
    // For split hands, determine outcome for each hand
    if (this.splitHand) {
      const handOneOutcome = this.determineHandOutcome(this.playerHand);
      const handTwoOutcome = this.determineHandOutcome(this.splitHand);
      
      console.log(`Split game results - Hand 1: ${handOneOutcome}, Hand 2: ${handTwoOutcome}`);
      
      return {
        handOneOutcome,
        handTwoOutcome,
        // Include a combined outcome for backward compatibility
        combinedOutcome: this.determineCombinedSplitOutcome(handOneOutcome, handTwoOutcome)
      };
    }
    
    // Regular game (no split)
    return this.determineHandOutcome(this.playerHand);
  }
  
  /**
   * Determine a combined outcome string for split hands
   * This is used for backward compatibility or simplified UI
   */
  private determineCombinedSplitOutcome(handOneOutcome: string, handTwoOutcome: string): string {
    // Both hands won
    if ((handOneOutcome === 'player_win' || handOneOutcome === 'dealer_bust' || handOneOutcome === 'player_blackjack') &&
        (handTwoOutcome === 'player_win' || handTwoOutcome === 'dealer_bust' || handTwoOutcome === 'player_blackjack')) {
      return 'player_win';
    }
    
    // Both hands lost
    if ((handOneOutcome === 'dealer_win' || handOneOutcome === 'player_bust') &&
        (handTwoOutcome === 'dealer_win' || handTwoOutcome === 'player_bust')) {
      return 'dealer_win';
    }
    
    // Both hands pushed
    if (handOneOutcome === 'push' && handTwoOutcome === 'push') {
      return 'push';
    }
    
    // One win, one loss
    if ((handOneOutcome === 'player_win' || handOneOutcome === 'dealer_bust' || handOneOutcome === 'player_blackjack') &&
        (handTwoOutcome === 'dealer_win' || handTwoOutcome === 'player_bust')) {
      return 'player_win';
    }
    
    if ((handOneOutcome === 'dealer_win' || handOneOutcome === 'player_bust') &&
        (handTwoOutcome === 'player_win' || handTwoOutcome === 'dealer_bust' || handTwoOutcome === 'player_blackjack')) {
      return 'player_win';
    }
    
    // One win, one push
    if ((handOneOutcome === 'player_win' || handOneOutcome === 'dealer_bust' || handOneOutcome === 'player_blackjack') &&
        handTwoOutcome === 'push') {
      return 'player_win';
    }
    
    if (handOneOutcome === 'push' &&
        (handTwoOutcome === 'split_win' || handTwoOutcome === 'split_blackjack')) {
      return 'player_win';
    }
    
    // One loss, one push
    if ((handOneOutcome === 'dealer_win' || handOneOutcome === 'player_bust') &&
        handTwoOutcome === 'split_push') {
      return 'push';
    }
    
    if (handOneOutcome === 'push' &&
        (handTwoOutcome === 'split_lose' || handTwoOutcome === 'split_bust')) {
      return 'push';
    }
    
    // Default case (should never happen but needed for compiler)
    return 'dealer_win';
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
   * Set the last bet amount
   */
  public setLastBet(amount: number): void {
    this.lastBet = amount;
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
  public getGameState(balance : number): GameStateMessage {
    const allowedActions: MessageType[] = [];
    
    // Add allowed actions based on game phase
    if (this.gamePhase === 'betting') {
          // Always include both PLACE_BET and REBET in complete phase
          allowedActions.push(MessageType.PLACE_BET);
          // Only add REBET if there was a previous bet
          if (this.lastBet > 0 && balance >= this.lastBet) {
              allowedActions.push(MessageType.REBET);
          }
    } 
    else if (this.gamePhase === 'dealing' || this.gamePhase === 'player_turn') {
        // Basic actions always available during player turn
        allowedActions.push(MessageType.HIT);
        allowedActions.push(MessageType.STAND);
        
        // Only allow these actions on initial two cards
        if (this.playerHand.cards.length === 2) {
            // Allow double down and surrender if not split
            if (!this.hasSplit()) {
                allowedActions.push(MessageType.DOUBLE_DOWN);
                allowedActions.push(MessageType.SURRENDER);
            }
            
            // Allow split if possible
            if (this.canSplit()) {
                allowedActions.push(MessageType.SPLIT);
            }
            
            // Allow insurance only during initial dealing phase
            if (this.gamePhase === 'dealing' && this.isInsuranceAvailable() && balance >= this.currentBet/2) {
                allowedActions.push(MessageType.INSURANCE);
            }
        }
    } 
    else if (this.gamePhase === 'complete') {
        // Always include both PLACE_BET and REBET in complete phase
        allowedActions.push(MessageType.PLACE_BET);
        // Only add REBET if there was a previous bet
        if (this.lastBet > 0 && balance >= this.lastBet) {
            allowedActions.push(MessageType.REBET);
        }
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
   * Set the current game phase and store previous phase
   */
  public setGamePhase(phase: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete'): void {
    // Store current phase before changing it
    this.previousGamePhase = this.gamePhase;
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
      const card = this.deck.dealCard(true, this.getNextRandomNumber());
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
    if (this.dealerHand.cards.length !== 2) {
      return false;
    }
    
    // First check if dealer's up card is an Ace or 10-value card
    const dealerUpCard = this.dealerHand.cards[0];
    if (dealerUpCard.rank !== 'A' && dealerUpCard.value !== 10) {
      return false;
    }
    
    // Then check if down card completes a blackjack
    const dealerDownCard = this.dealerHand.cards[1];
    const hasBlackjack = (dealerUpCard.rank === 'A' && dealerDownCard.value === 10) || 
           (dealerUpCard.value === 10 && dealerDownCard.rank === 'A');
           
    // Set blackjack flag if dealer has blackjack
    if (hasBlackjack) {
      this.dealerHand.blackjack = true;
    }
    
    return hasBlackjack;
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
    const card = this.deck.dealCard(true, this.getNextRandomNumber());
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
    return card1.value === card2.value;
  }

  /**
   * Get split hand - enhanced version supporting both getting the split hand object 
   * and getting specific split hands by index
   * @param hand Optional parameter to specify which split hand to get ('first' or 'second')
   * @returns The requested split hand or the split hand object
   */
  public getSplitHand(hand?: 'first' | 'second'): Hand | null {
    if (hand === undefined) {
      return this.splitHand;
    } else if (hand === 'first') {
      return this.playerHand;
    } else if (hand === 'second') {
      return this.splitHand;
    }
    return null;
  }

  /**
   * Calculate the payout for a given outcome
   * @param outcome The game outcome string
   * @param betAmount Optional bet amount override (uses current bet by default)
   * @returns The payout amount
   */
  public calculatePayoutForOutcome(outcome: string, betAmount?: number): number {
    // Get the current bet amount if not provided
    const bet = betAmount !== undefined ? betAmount : this.getCurrentBet();
    
    // Default payout is 0 (loss)
    let payout = 0;
    
    // Calculate payout based on outcome
    switch (outcome) {
      case 'player_blackjack':
        // Blackjack pays 3:2
        payout = bet + (bet * 1.5);
        break;
        
      case 'player_win':
      case 'dealer_bust':
        // Regular win pays 1:1
        payout = bet * 2;  // Original bet + winnings
        break;
        
      case 'push':
        // Push returns original bet
        payout = bet;
        break;
        
      case 'surrender':
        // Surrender returns half the bet
        payout = bet / 2;
        break;
        
      case 'insurance_won':
        // Insurance pays 2:1
        payout = this.insuranceBet * 2;
        break;
        
      // All other outcomes (dealer_win, player_bust) pay nothing
      default:
        payout = 0;
    }
    
    console.log(`Calculated payout for ${outcome}: ${payout} (bet: ${bet})`);
    return payout;
  }

  /**
   * Calculate total payout for split hands
   * @param splitOutcome The outcome object with results for both hands
   * @returns The total payout amount
   */
  public calculateCombinedPayout(splitOutcome: SplitOutcome): number {
    const handOnePayout = this.calculatePayoutForOutcome(splitOutcome.handOneOutcome);
    const handTwoPayout = this.calculatePayoutForOutcome(splitOutcome.handTwoOutcome);
    
    const totalPayout = handOnePayout + handTwoPayout;
    console.log(`Combined split payout: ${totalPayout} (Hand 1: ${handOnePayout}, Hand 2: ${handTwoPayout})`);
    
    return totalPayout;
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
    const outcomeResult = this.determineOutcome();
    let outcomeString: string;
    let message = '';
    
    // Handle split outcomes
    if (typeof outcomeResult !== 'string' && 'combinedOutcome' in outcomeResult) {
      // Use the combined outcome string for split hands
      outcomeString = outcomeResult.combinedOutcome;
    } else {
      // Regular outcome is already a string
      outcomeString = outcomeResult as string;
    }
    
    switch (outcomeString) {
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
      outcome: outcomeString as GameOutcome,
      message: message,
      payout: this.calculatePayoutForOutcome(outcomeString),
      playerValue: this.playerHand.value,
      dealerValue: this.dealerHand.value
    };
  }

  /**
   * Get a comprehensive game result with all outcome information
   * This centralizes all outcome determination logic in one place
   */
  public getFinalGameResult(): CompleteGameResult {
    // Add validation for game state
    if (this.gamePhase !== 'complete' && this.gamePhase !== 'dealer_turn') {
        console.warn('Getting final result before game is complete');
    }
    
    const result: CompleteGameResult = {
        outcomeType: 'normal',
        finalOutcomeString: '',
        payout: 0,
        message: ''
    };
    
    // Handle surrender first
    if (this.surrendered) {
        result.outcomeType = 'normal';
        result.finalOutcomeString = 'surrender';
        result.payout = this.currentBet / 2;
        result.message = 'You surrendered. Half your bet is returned.';
        return result;
    }
    
    // Handle insurance only when insurance bet was actually placed and dealer has blackjack
    if (this.insuranceBet > 0 && this.dealerHand.blackjack) {
        result.outcomeType = 'insurance';
        result.finalOutcomeString = 'insurance_won';
        result.insurance = {
            bet: this.insuranceBet,
            payout: this.insuranceBet * 2,
            won: true
        };
        result.payout = this.insuranceBet * 2;
        result.message = 'Dealer has blackjack! Insurance pays 2:1';
        return result;
    }
    
    // Store insurance information if bet was placed
    if (this.insuranceBet > 0) {
        result.outcomeType = 'normal';
        result.insurance = {
            bet: this.insuranceBet,
            payout: 0,
            won: false
        };
        
        // Just add insurance information, don't override the outcome yet
    }
    
    // Handle split hands only when player actually split
    if (this.hasSplit()) {
        result.outcomeType = 'split';
        const handOneOutcome = this.determineHandOutcome(this.playerHand);
        const handTwoOutcome = this.determineHandOutcome(this.splitHand!);
        
        result.split = {
            handOneOutcome,
            handTwoOutcome,
            handOnePayout: this.calculatePayoutForOutcome(handOneOutcome),
            handTwoPayout: this.calculatePayoutForOutcome(handTwoOutcome)
        };
        
        result.payout = result.split.handOnePayout + result.split.handTwoPayout;
        result.finalOutcomeString = this.determineCombinedSplitOutcome(handOneOutcome, handTwoOutcome);
        result.message = this.getSplitOutcomeMessage(handOneOutcome, handTwoOutcome);
        return result;
    }
    
    // Handle regular game outcomes
    const standardOutcome = this.determineHandOutcome(this.playerHand);
    result.finalOutcomeString = standardOutcome;
    result.payout = this.calculatePayoutForOutcome(standardOutcome);
    result.message = this.getOutcomeMessage(standardOutcome);
    
    // If player had insurance (but dealer doesn't have blackjack), include this info
    // but don't override the main game outcome
    if (this.insuranceBet > 0 && !this.dealerHand.blackjack) {
        // Add a note about insurance loss to the message
        result.message = `Insurance lost. ${result.message}`;
    }
    
    return result;
  }

  /**
   * Get a message for split outcomes
   */
  private getSplitOutcomeMessage(handOneOutcome: string, handTwoOutcome: string): string {
    // Both hands won
    if ((handOneOutcome === 'player_win' || handOneOutcome === 'dealer_bust' || handOneOutcome === 'player_blackjack') &&
        (handTwoOutcome === 'player_win' || handTwoOutcome === 'dealer_bust' || handTwoOutcome === 'player_blackjack')) {
      return 'Both hands win!';
    }
    
    // Both hands lost
    if ((handOneOutcome === 'dealer_win' || handOneOutcome === 'player_bust') &&
        (handTwoOutcome === 'dealer_win' || handTwoOutcome === 'player_bust')) {
      return 'Both hands lose.';
    }
    
    // Both hands pushed
    if (handOneOutcome === 'push' && handTwoOutcome === 'push') {
      return 'Both hands tie with the dealer.';
    }
    
    // One win, one loss
    if ((handOneOutcome === 'player_win' || handOneOutcome === 'dealer_bust' || handOneOutcome === 'player_blackjack') &&
        (handTwoOutcome === 'dealer_win' || handTwoOutcome === 'player_bust')) {
      return 'First hand wins, second hand loses.';
    }
    
    if ((handOneOutcome === 'dealer_win' || handOneOutcome === 'player_bust') &&
        (handTwoOutcome === 'player_win' || handTwoOutcome === 'dealer_bust' || handTwoOutcome === 'player_blackjack')) {
      return 'First hand loses, second hand wins.';
    }
    
    // One win, one push
    if ((handOneOutcome === 'player_win' || handOneOutcome === 'dealer_bust' || handOneOutcome === 'player_blackjack') &&
        handTwoOutcome === 'push') {
      return 'First hand wins, second hand ties.';
    }
    
    if (handOneOutcome === 'push' &&
        (handTwoOutcome === 'player_win' || handTwoOutcome === 'dealer_bust' || handTwoOutcome === 'player_blackjack')) {
      return 'First hand ties, second hand wins.';
    }
    
    // One loss, one push
    if ((handOneOutcome === 'dealer_win' || handOneOutcome === 'player_bust') &&
        handTwoOutcome === 'push') {
      return 'First hand loses, second hand ties.';
    }
    
    if (handOneOutcome === 'push' &&
        (handTwoOutcome === 'dealer_win' || handTwoOutcome === 'player_bust')) {
      return 'First hand ties, second hand loses.';
    }
    
    return 'Split game complete.';
  }

  /**
   * Get a simple outcome message for standard game outcomes
   */
  private getOutcomeMessage(outcome: string): string {
    switch (outcome) {
      case 'player_blackjack':
        return 'Blackjack! You win 3:2!';
      case 'player_win':
        return 'Congratulations! You win!';
      case 'dealer_win':
        return 'Dealer wins. Better luck next time!';
      case 'push':
        return "It's a tie! Your bet has been returned.";
      case 'player_bust':
        return 'Bust! Your hand went over 21.';
      case 'dealer_bust':
        return 'Dealer busts! You win!';
      default:
        return 'Game over.';
    }
  }

  /**
   * Get the game outcome for UI display
   */
  public getGameOutcome(): string {
    // Handle surrender case first
    if (this.surrendered) {
      return 'surrender';
    }
   
    // Check for dealer blackjack first
    const dealerHasBlackjack = this.dealerHand.blackjack;
    
    // Handle insurance with dealer blackjack case
    // This should take priority over other outcomes when dealer has blackjack and player has insurance
    if (this.insuranceBet > 0 && dealerHasBlackjack) {
      return 'insurance_won';
    }
    
    // Don't return 'insurance_lose' as the main game outcome - this will be handled separately
    // in the UI by checking the insurance status
    
    // Handle blackjack cases
    if (this.playerHand.blackjack) {
      if (dealerHasBlackjack) {
        return 'push';
      }
      return 'player_blackjack';  // Changed from 'blackjack' to 'player_blackjack'
    }
    
    // Handle bust cases
    if (this.playerHand.busted) {
      return 'player_bust';
    }
    if (this.dealerHand.busted) {
      // If dealer busts, always return dealer_bust as the main outcome
      return 'dealer_bust';
    }
    
    // Compare hand values
    if (this.playerHand.value > this.dealerHand.value) {
      // Check if player has 21 regardless of the number of cards
      if (this.playerHand.value === 21) {
        // Always return player_blackjack when player has 21
        return 'player_blackjack';
      }
      // Otherwise it's a regular win
      return 'player_win';
    }
    if (this.playerHand.value < this.dealerHand.value) {
      return 'dealer_win';
    }
    
    // Must be a push - handle ties consistently regardless of insurance status
    return 'push';
  }

  /**
   * Set the current bet amount directly
   * This is used in special cases to preserve bet amounts during game phases
   */
  public setCurrentBet(amount: number): void {
    if (amount <= 0) {
      console.warn(`[WARNING] Attempted to set bet to invalid amount: ${amount}`);
      return;
    }
    
    console.log(`[BET SET] Current bet amount changed from ${this.currentBet} to ${amount}`);
    this.currentBet = amount;
  }

  /**
   * Get the previous game phase
   */
  public getPreviousGamePhase(): string {
    return this.previousGamePhase;
  }

  /**
   * Restore player hand from saved state
   * @param cards Array of card objects to restore
   */
  public restorePlayerHand(cards: any[]): void {
    // Convert saved card format to Card format
    const restoredCards: Card[] = cards.map(c => ({
      suit: c.suit,
      rank: c.rank,
      value: c.value,
      faceUp: c.faceUp || true
    }));
    
    this.playerHand = this.createHand('player');
    this.playerHand.cards = restoredCards;
    
    // Recalculate hand values
    this.calculateHandValues();
  }

  /**
   * Restore dealer hand from saved state
   * @param cards Array of card objects to restore
   */
  public restoreDealerHand(cards: any[]): void {
    // Convert saved card format to Card format
    const restoredCards: Card[] = cards.map(c => ({
      suit: c.suit,
      rank: c.rank,
      value: c.value,
      faceUp: c.faceUp || false
    }));
    
    this.dealerHand = this.createHand('dealer');
    this.dealerHand.cards = restoredCards;
    
    // Recalculate hand values
    this.calculateHandValues();
  }

  /**
   * Set insurance bet amount
   * @param amount Insurance bet amount
   */
  public setInsuranceBet(amount: number): void {
    this.insuranceBet = amount;
  }

  /**
   * Restore split state
   * @param activeHand Which hand is active ('first' or 'second')
   */
  public restoreSplitState(activeHand: 'first' | 'second'): void {
    // Create split hand if not already exists
    if (!this.splitHand) {
      this.splitHand = this.createHand('split');
    }
    
    // Set active split hand
    this.activeSplitHand = activeHand;
  }

  /**
   * Get the currently active split hand
   */
  public getActiveSplitHand(): 'first' | 'second' | null {
    return this.activeSplitHand;
  }

  /**
   * Fetch 36 random numbers from external API
   */
  public async fetchRandomNumbers(): Promise<boolean> {
    try {
      const apiService = require('../services/api.service').ApiService.getInstance();
      const response = await apiService.getRandom(36);
      
      if (response.success && response.data) {
        this.randomNumbers = response.data;
        this.randomNumberIndex = 0;
        console.log(`Fetched ${this.randomNumbers.length} random numbers from API`);
        return true;
      } else {
        console.error('Failed to fetch random numbers:', response.error);
        return false;
      }
    } catch (error) {
      console.error('Error fetching random numbers:', error);
      return false;
    }
  }

  /**
   * Get the next random number from the pre-fetched array
   * @returns A random number between 0 and 1
   */
  public getNextRandomNumber(): number {
    if (this.randomNumbers.length === 0) {
      console.warn('No pre-fetched random numbers available, using Math.random()');
      return Math.random();
    }
    
    const randomValue = this.randomNumbers[this.randomNumberIndex] / 100;
    this.randomNumberIndex = (this.randomNumberIndex + 1) % this.randomNumbers.length;
    return randomValue;
  }
} 