import { BlackjackServer } from '../server/BlackjackServer';
import { 
  ClientMessage, 
  ServerMessage, 
  MessageType, 
  GameStateMessage,
  HandMessage,
  CardMessage,
  GameOutcomeMessage
} from '../models/Message';
import { Card, Deck } from './Deck';
import { BlackjackGame } from './BlackjackGame';

/**
 * Represents a hand in the UI
 */
interface UIHand {
  type: string;
  cards: any[];
  value: number;
  busted: boolean;
  blackjack: boolean;
  soft: boolean;
}

/**
 * Manages a single game for a client
 */
export class GameSession {
  private clientId: string;
  private server: BlackjackServer;
  private game: BlackjackGame;
  private playerBalance: number = 1000; // Starting balance
  
  constructor(clientId: string, _unusedParam: string, server: BlackjackServer) {
    this.clientId = clientId;
    this.server = server;
    this.game = new BlackjackGame();
    
    // Initialize the game
    this.initialize();
  }
  
  /**
   * Initialize the session
   */
  private initialize(): void {
    // Initialize with starting balance
    this.sendPlayerBalanceUpdate();
  }
  
  /**
   * Get the client ID associated with this game
   */
  public getClientId(): string {
    return this.clientId;
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Any cleanup needed for the game
    this.game.reset();
  }
  
  /**
   * Force the game to betting phase if in an inconsistent state
   * This is used as a recovery mechanism when phase transitions fail
   */
  private forceBettingPhase(): void {
    const currentPhase = this.game.getGamePhase();
    
    if (currentPhase !== 'betting') {
      console.warn(`Forcing game to betting phase from ${currentPhase} due to inconsistent state`);
      
      // Directly reset the game state
      this.game.reset();
      
      // Notify the client
      this.sendToClient({
        type: MessageType.PHASE_CHANGE,
        data: {
          from: currentPhase,
          to: 'betting',
          message: "Game reset due to inconsistent state"
        }
      });
      
      // Send updated game state
      this.sendGameState();
    }
  }
  
  /**
   * CENTRALIZED PHASE TRANSITION: Betting -> GameInProgress
   * Starts a new game by placing a bet and dealing cards
   * This single function handles the complete transition from Betting to GameInProgress
   * @param betAmount The amount to bet (if not provided, will use current bet)
   */
  public startGameWithBet(betAmount?: number): void {
    console.log(`Starting game for client ${this.clientId}`);
    
    // PHASE VALIDATION: Must be in betting phase
    if (this.game.getGamePhase() !== 'betting') {
      // Try to recover by forcing betting phase
      this.forceBettingPhase();
      
      // Check again after recovery attempt
      if (this.game.getGamePhase() !== 'betting') {
        const error = 'PHASE ERROR: Cannot start game - game already in progress';
        this.sendActionError(error, 'INVALID_PHASE');
        throw new Error(error);
      }
    }
    
    try {
      // Step 1: Place the bet if provided
      if (betAmount !== undefined && betAmount > 0) {
        if (betAmount > this.playerBalance) {
          const error = 'VALIDATION ERROR: Insufficient balance for this bet';
          this.sendActionError(error, 'INSUFFICIENT_FUNDS');
          throw new Error(error);
        }
        
        // Place the bet and deduct from balance
        this.game.placeBet(betAmount);
        this.playerBalance -= betAmount;
        
        // Send bet placed confirmation
        this.sendToClient({
          type: MessageType.BET_PLACED,
          data: { 
            amount: betAmount,
            balance: this.playerBalance
          }
        });
      }
      
      // Step 2: Validate a bet has been placed
      const currentBet = this.game.getCurrentBet();
      if (currentBet <= 0) {
        const error = 'VALIDATION ERROR: Cannot start game - no bet placed';
        this.sendActionError(error, 'NO_BET_PLACED');
        throw new Error(error);
      }
      
      // Step 3: Send phase change notification - always explicit phase change
      this.sendToClient({
        type: MessageType.PHASE_CHANGE,
        data: { 
          from: 'betting',
          to: 'dealing',
          message: "Dealing cards..."
        }
      });
      
      // Update game phase
      this.game.setGamePhase('dealing');
      
      // Step 4: Deal initial cards
      this.game.dealInitialCards();
      
      // Step 5: Send each card individually for animation purposes
      const playerCards = this.game.getPlayerCards();
      const dealerCards = this.game.getDealerCards();
      
      // First card to player
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: { 
          card: playerCards[0],
          target: 'player',
          index: 0,
          message: `Card dealt to player: ${playerCards[0].rank} of ${playerCards[0].suit}`
        }
      });
      
      // First card to dealer
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: { 
          card: dealerCards[0],
          target: 'dealer',
          index: 0,
          message: `Card dealt to dealer: ${dealerCards[0].rank} of ${dealerCards[0].suit}`
        }
      });
      
      // Second card to player
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: { 
          card: playerCards[1],
          target: 'player',
          index: 1,
          message: `Card dealt to player: ${playerCards[1].rank} of ${playerCards[1].suit}`
        }
      });
      
      // Second card to dealer (face down)
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: { 
          card: dealerCards[1],
          target: 'dealer',
          index: 1,
          message: `Card dealt face down to dealer`
        }
      });
      
      // Check for special conditions like blackjack, insurance, etc.
      const specialConditions = this.game.checkSpecialConditions();
      
      // Send game state update immediately to make buttons appear before phase change
      // This ensures buttons are displayed right after dealing
      this.sendGameState();
      
      // Send phase change notification to player turn (if no special conditions require immediate attention)
      if (!specialConditions.playerBlackjack && !specialConditions.dealerBlackjack && !specialConditions.insuranceAvailable) {
        this.sendToClient({
          type: MessageType.PHASE_CHANGE,
          data: { 
            from: 'dealing',
            to: 'player_turn',
            message: "Player's turn"
          }
        });
        
        this.game.setGamePhase('player_turn');
        
        // Send PLAYER_TURN message with allowed actions
        this.sendAllowedActions();
      }
      
      // Handle any special conditions like blackjack, insurance, split, etc.
      this.handleAutomaticTransitions(specialConditions);
      
      // Send updated game state with allowed actions again
      this.sendGameState();
      
    } catch (error) {
      // Handle any errors and rethrow
      console.error(`Error starting game for client ${this.clientId}:`, error);
      throw error;
    }
  }
  
  /**
   * CENTRALIZED GAME ACTION HANDLER
   * Handles all in-game actions (hit, stand, double, split, etc.) with phase validation
   * @param action The action type
   * @param data Additional action data if needed
   */
  public handleGameAction(action: MessageType, data?: any): void {
    console.log(`GAME ACTION: ${action} in phase ${this.game.getGamePhase()}`);
    
    try {
      // Validate the current phase allows this action
      this.validateActionForPhase(action, this.game.getGamePhase());
      
      // Process the action based on type
      switch (action) {
        case MessageType.HIT:
          this.handleHit(data?.hand);
          break;
          
        case MessageType.STAND:
          this.handleStand(data?.hand);
          break;
          
        case MessageType.DOUBLE_DOWN:
          this.handleDoubleDown();
          break;
          
        case MessageType.SPLIT:
          this.handleSplit();
          break;
          
        case MessageType.SURRENDER:
          this.handleSurrender();
          break;
          
        case MessageType.INSURANCE:
          this.handleInsurance(data);
          break;
          
        case MessageType.REBET:
          this.handleRebet();
          break;
          
        case MessageType.CLEAR_BET:
          this.handleClearBet();
          break;
          
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
      
      // State synchronization - always send updated game state after any action
      this.sendGameState();
      
      // Send a success message to explicitly let the client know the action is complete
      this.sendToClient({
        type: MessageType.ACTION_RESULT,
        data: {
          success: true,
          action: action,
          message: `${action} completed successfully`,
          phase: this.game.getGamePhase()
        }
      });
      
    } catch (error) {
      // Log the error
      console.error(`Error processing action ${action}:`, error);
      
      // Send error to client
      this.sendActionError(
        error instanceof Error ? error.message : `Unknown error processing ${action}`,
        'ACTION_ERROR'
      );
      
      // Always resend the game state to ensure synchronization
      this.sendGameState();
    }
  }
  
  /**
   * Validates if an action is allowed in the current game phase
   * @param action The action being attempted
   * @param currentPhase The current game phase
   */
  private validateActionForPhase(action: MessageType, currentPhase: string): void {
    const allowedActions = this.determineAllowedActions();
    
    if (!allowedActions.includes(action)) {
      throw new Error(`Action ${action} not allowed in phase ${currentPhase}`);
    }
  }
  
  /**
   * Process the dealer's turn
   * This is called automatically when the player's turn ends
   */
  private processDealerTurn(): void {
    console.log(`Processing dealer turn in session ${this.clientId}`);
    
    // Set game phase to dealer turn
    this.game.setGamePhase('dealer_turn');
    
    // Notify client that dealer turn is starting
    this.sendToClient({
      type: MessageType.DEALER_TURN,
      data: { message: "Dealer's turn" }
    });
    
    // Reveal dealer's hole card
    this.game.revealDealerCard();
    console.log(`Dealer's hole card revealed: ${this.game.getDealerCards()[1].rank} of ${this.game.getDealerCards()[1].suit}`);
    console.log(`Dealer's hand value after reveal: ${this.game.getDealerValue()}`);
    
    // Send message about revealed card
    this.sendToClient({
      type: MessageType.DEALER_CARD_REVEALED,
      data: {
        card: this.game.getDealerCards()[1],
        message: "Dealer's card revealed"
      }
    });
    
    // Wait 1 second before continuing (for client animations)
    setTimeout(() => {
      // Execute dealer's turn (draw cards until 17 or higher)
      const dealerCards = this.executeDealerTurn();
      console.log(`Dealer's turn complete. Final hand value: ${this.game.getDealerValue()}`);
      
      // End the game with final outcome
      this.endGame();
    }, 1000);
  }
  
  /**
   * Execute the dealer's turn, dealing cards according to blackjack rules
   */
  private executeDealerTurn(): Card[] {
    const dealerCards: Card[] = [];
    console.log(`Starting dealer's turn with hand value: ${this.game.getDealerValue()}`);
    
    // Dealer draws cards until reaching 17 or higher
    while (this.game.dealerShouldHit()) {
      // Deal a card to the dealer
      const card = this.game.dealerHit();
      dealerCards.push(card);
      console.log(`Dealer draws: ${card.rank} of ${card.suit}, new hand value: ${this.game.getDealerValue()}`);
      
      // Notify client about the dealer's new card
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: {
          card: card,
          target: 'dealer',
          index: this.game.getDealerCards().length - 1,
          message: `Dealer draws: ${card.rank} of ${card.suit}`
        }
      });
      
      // Add a short delay between cards (for client-side animation)
      // We can't use setTimeout here since this is synchronous,
      // but the frontend can add delays between animations
    }
    
    // Log dealer's final status
    if (this.game.getDealerValue() > 21) {
      console.log(`Dealer busted with ${this.game.getDealerValue()}`);
    } else {
      console.log(`Dealer stands with ${this.game.getDealerValue()}`);
    }
    
    return dealerCards;
  }
  
  /**
   * End the game and determine the outcome
   * This transitions the game from GameInProgress to EndGame phase
   */
  public endGame(): void {
    console.log(`Ending game for client ${this.clientId} - Transitioning to EndGame phase`);
    
    // PHASE TRANSITION: GameInProgress → EndGame
    
    // 1. Determine game outcome
    const outcome = this.game.determineOutcome();
    console.log(`Game outcome determined: ${outcome}`);
    
    // 2. Calculate payout - use the game's payout calculation directly
    const payout = this.game.calculatePayoutForOutcome(outcome);
    console.log(`Payout calculated: ${payout} (original bet: ${this.game.getCurrentBet()})`);
    
    // 3. Update player balance
    this.playerBalance += payout;
    console.log(`Player balance updated to: ${this.playerBalance}`);
    this.sendPlayerBalanceUpdate();
    
    // 4. Send phase change notification
    this.sendToClient({
      type: MessageType.PHASE_CHANGE,
      data: {
        from: this.game.getGamePhase(),
        to: 'complete',
        message: "Game complete"
      }
    });
    
    // 5. Send detailed outcome to client
    this.sendToClient({
      type: MessageType.GAME_OUTCOME,
      data: {
        outcome: outcome,
        message: this.getOutcomeMessage(outcome),
        payout: payout,
        playerHandValue: this.game.getPlayerValue(),
        dealerHandValue: this.game.getDealerValue(),
        playerBalance: this.playerBalance
      }
    });
    
    // 6. Mark game as complete in the game model
    this.game.setGamePhase('complete');
    
    // 7. Send updated game state
    this.sendGameState();
    
    // 8. Determine allowed actions for the EndGame phase
    this.sendAllowedActions();
    
    // Log detailed outcome
    console.log(`Game ended with outcome: ${outcome}`);
    console.log(`Player hand: ${this.game.getPlayerValue()}, Dealer hand: ${this.game.getDealerValue()}`);
    console.log(`Payout: ${payout}, New balance: ${this.playerBalance}`);
  }
  
  /**
   * Handle returning to the betting phase after a game completes or on error
   * This transitions from any phase back to Betting phase
   */
  public returnToBettingPhase(): void {
    console.log(`Returning to betting phase for client ${this.clientId}`);
    
    // Get current phase for logging
    const currentPhase = this.game.getGamePhase();
    
    // PHASE TRANSITION: Any Phase → Betting
    
    // 1. Send phase change notification
    this.sendToClient({
      type: MessageType.PHASE_CHANGE,
      data: {
        from: currentPhase,
        to: 'betting',
        message: currentPhase === 'complete' ? "Ready for next round" : "Returning to betting phase"
      }
    });
    
    // 2. Reset the game state for a new round
    this.game.reset();
    
    // 3. Send updated game state
    this.sendGameState();
    
    // 4. Determine allowed actions for betting phase
    this.sendAllowedActions();
    
    console.log(`Transitioned from ${currentPhase} to Betting phase`);
  }
  
  /**
   * Get a user-friendly message describing a game outcome
   */
  private getOutcomeMessage(outcome: string): string {
    switch (outcome) {
      case 'player_blackjack':
        return "Blackjack! You win!";
      case 'player_win':
        return "You win!";
      case 'dealer_win':
        return "Dealer wins";
      case 'push':
        return "Push - it's a tie";
      case 'player_bust':
        return "Bust! You lose";
      case 'dealer_bust':
        return "Dealer busts! You win";
      case 'surrender':
        return "You surrendered";
      default:
        return "Game over";
    }
  }
  
  /**
   * Handle automatic transitions based on special conditions
   */
  private handleAutomaticTransitions(specialConditions: any): void {
    // Auto-end game if dealer has blackjack
    if (specialConditions.dealerBlackjack) {
      // If insurance was taken, process it
      if (this.game.getInsuranceBet() > 0) {
        const insurancePayout = this.game.getInsuranceBet() * 2;
        this.playerBalance += insurancePayout;
        
        this.sendToClient({
          type: MessageType.INSURANCE_RESULT,
          data: {
            dealerHasBlackjack: true,
            payout: insurancePayout
          }
        });
      }
      
      // End the game immediately
      this.endGame();
      return;
    }
    
    // Auto-end game if player has blackjack and no dealer ace showing
    if (specialConditions.playerBlackjack && !specialConditions.insuranceAvailable) {
      this.endGame();
      return;
    }
    
    // If dealer shows an ace, offer insurance
    if (specialConditions.insuranceAvailable) {
      this.sendToClient({
        type: MessageType.OFFER_INSURANCE,
        data: {
          dealerCard: this.game.getDealerUpCard(),
          insuranceAmount: this.game.getCurrentBet() / 2
        }
      });
    }
    
    // If player has a pair, offer split
    if (specialConditions.splitAvailable) {
      this.sendToClient({
        type: MessageType.OFFER_SPLIT,
        data: {
          cards: this.game.getPlayerCards()
        }
      });
    }
  }
  
  /**
   * Determine the allowed actions based on current game state
   */
  private determineAllowedActions(): MessageType[] {
    const allowedActions: MessageType[] = [];
    const gamePhase = this.game.getGamePhase();
    
    if (gamePhase === 'betting') {
      allowedActions.push(MessageType.PLACE_BET);
      allowedActions.push(MessageType.DEAL_CARDS);
      
      // Add rebet if there's a previous bet
      if (this.game.getLastBet() > 0) {
        allowedActions.push(MessageType.REBET);
      }
      
      allowedActions.push(MessageType.CLEAR_BET);
    }
    else if (gamePhase === 'player_turn') {
      // Base actions always available during player turn
      allowedActions.push(MessageType.HIT);
      allowedActions.push(MessageType.STAND);
      
      // Check for special actions
      if (this.game.canDoubleDown()) {
        allowedActions.push(MessageType.DOUBLE_DOWN);
      }
      
      if (this.canPlayerSplit()) {
        allowedActions.push(MessageType.SPLIT);
      }
      
      if (this.game.canSurrender()) {
        allowedActions.push(MessageType.SURRENDER);
      }
      
      if (this.game.canTakeInsurance()) {
        allowedActions.push(MessageType.INSURANCE);
      }
    }
    
    return allowedActions;
  }
  
  /**
   * Check if player can split (wrapper for private canSplit method in BlackjackGame)
   */
  private canPlayerSplit(): boolean {
    // Look at the player's cards - if they have exactly 2 of the same value, they can split
    const playerCards = this.game.getPlayerCards();
    return playerCards.length === 2 && playerCards[0].value === playerCards[1].value;
  }
  
  /**
   * Handle an action from the client
   */
  public handleAction(message: ClientMessage): void {
    try {
      // Basic validation
      if (!message.type) {
        throw new Error("Invalid message format - missing type");
      }
      
      console.log(`Handling action: ${message.type} in session ${this.clientId} (current phase: ${this.game.getGamePhase()})`);
      
      // Process the message based on type
      switch (message.type) {
        case MessageType.PLACE_BET:
          // Start new game with bet - centralized phase transition
          if (message.data && typeof message.data.amount === 'number') {
            this.startGameWithBet(message.data.amount);
          } else {
            throw new Error("Invalid bet amount");
          }
          break;
          
        case MessageType.DEAL_CARDS:
          // This is now handled within startGameWithBet
          // But kept for backward compatibility
          if (this.game.getGamePhase() !== 'betting') {
            // Try to recover
            this.forceBettingPhase();
            if (this.game.getGamePhase() !== 'betting') {
              throw new Error("Cannot deal cards - not in betting phase");
            }
          }
          this.startGameWithBet();
          break;
          
        // All gameplay actions are now handled by centralized handler
        case MessageType.HIT:
        case MessageType.STAND:
        case MessageType.DOUBLE_DOWN:
        case MessageType.SPLIT:
        case MessageType.SURRENDER:
        case MessageType.INSURANCE:
        case MessageType.REBET:
        case MessageType.CLEAR_BET:
          this.handleGameAction(message.type, message.data);
          break;
          
        // Session management
        case MessageType.JOIN_SESSION:
          // Send initial game state when client joins
          this.sendGameState();
          break;
          
        // Return to betting phase command
        case MessageType.RETURN_TO_BETTING:
          this.returnToBettingPhase();
          break;
          
        default:
          console.warn(`Unhandled message type: ${message.type}`);
          this.sendActionError(`Unsupported action: ${message.type}`, 'UNSUPPORTED_ACTION');
      }
      
    } catch (error) {
      console.error(`Error handling action:`, error);
      
      // Send error to client
      this.sendToClient({
        type: MessageType.ERROR,
        data: {
          message: error instanceof Error ? error.message : 'Unknown error processing action',
          action: message.type,
          phase: this.game.getGamePhase()
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Always try to recover by returning to betting phase if needed
      // Only do this for errors, not for minor validation issues
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('phase') || errorMsg.includes('state')) {
        console.log('Attempting recovery from phase error...');
        this.returnToBettingPhase();
      }
      
      // Always keep client and server in sync by sending current state
      this.sendGameState();
    }
  }
  
  /**
   * Send current game state to client
   */
  public sendGameState(targetClientId: string = this.clientId): void {
    const gameState = this.game.getGameState();
    
    const stateMessage: GameStateMessage = {
      ...gameState,
      playerBalance: this.playerBalance
    };
    
    this.server.sendToClient(targetClientId, {
      type: MessageType.INITIAL_STATE,
      data: stateMessage
    });
  }
  
  /**
   * Send player balance update
   */
  private sendPlayerBalanceUpdate(): void {
    this.sendToClient({
      type: MessageType.PLAYER_BALANCE_UPDATE,
      data: { balance: this.playerBalance }
    });
  }
  
  /**
   * Send a message to the client
   */
  private sendToClient(message: ServerMessage): void {
    this.server.sendToClient(this.clientId, message);
  }
  
  /**
   * Check if we have a split hand
   */
  private hasSplitHand(): boolean {
    return this.game.hasSplit();
  }
  
  /**
   * Get the active split hand
   */
  private getActiveSplitHand(): 'first' | 'second' | null {
    const gameState = this.game.getGameState();
    return gameState.activeSplitHand || null;
  }
  
  /**
   * Handle the switch between split hands
   */
  private handleSplitHandSwitch(hand: 'first' | 'second'): void {
    this.game.setActiveSplitHandUI(hand);
    
    this.sendToClient({
      type: MessageType.SPLIT_HAND_SWITCH,
      data: {
        activeHand: hand,
        message: `Now playing ${hand === 'first' ? 'first' : 'second'} hand`
      }
    });
    
    // Send allowed actions for the active hand
    this.sendAllowedActions();
  }
  
  /**
   * Check if the hit operation resulted in a bust or 21
   */
  private checkHandAfterHit(hand: UIHand): boolean {
    // Return true if player turn is over (bust or 21)
    return hand.busted || hand.value === 21;
  }
  
  /**
   * Check if dealer has blackjack
   * @returns A boolean indicating whether the dealer has blackjack
   */
  private isDealerBlackjack(): boolean {
    // Get the result from checkDealerBlackjack and return it as a boolean
    return this.game.checkDealerHasBlackjack();
  }
  
  /**
   * Send an error message for an action
   * @param message Error message to send
   * @param code Error code for categorization
   */
  private sendActionError(message: string, code: string): void {
    console.error(`Action error: ${message} (${code})`);
    
    this.sendToClient({
      type: MessageType.ACTION_RESULT,
      data: {
        success: false,
        message: message,
        code: code,
        phase: this.game.getGamePhase()
      }
    });
  }
  
  /**
   * Handle a hit request from the player
   */
  private handleHit(hand?: 'first' | 'second'): void {
    console.log(`Player hit request in session ${this.clientId}${hand ? ' for ' + hand + ' hand' : ''}`);
    
    // Verify we're in the player turn phase
    if (this.game.getGamePhase() !== 'player_turn') {
      throw new Error('Cannot hit - not in player turn phase');
    }
    
    let cardDealt: Card;
    
    // Handle split hands if applicable
    if (this.game.hasSplit()) {
      // If no hand specified but in split mode, use the active split hand
      const targetHand = hand || this.getActiveSplitHand() || 'first';
      console.log(`Processing hit for split hand: ${targetHand}`);
      
      if (targetHand === 'first') {
        // Hit the main player hand
        cardDealt = this.game.hit();
        
        // Send card dealt notification
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: cardDealt,
            target: 'player',
            index: this.game.getPlayerCards().length - 1,
            message: `Card dealt to first hand: ${cardDealt.rank} of ${cardDealt.suit}`
          }
        });
        
        // Check if hand is bust or 21
        const playerHand = this.mapHand(this.game.getPlayerCards());
        console.log(`First hand after hit: value=${playerHand.value}, busted=${playerHand.busted}`);
        
        if (playerHand.busted) {
          console.log('First hand busted, switching to second hand');
          // If first hand is bust, switch to second hand
          this.handleSplitHandSwitch('second');
        }
        else if (playerHand.value === 21) {
          console.log('First hand has 21, automatically standing and switching to second hand');
          // If first hand is 21, automatically stand and switch to second hand
          this.handleSplitHandSwitch('second');
        }
      } 
      else {
        // Hit the split hand
        cardDealt = this.game.hitSplitHand('second');
        
        // Send card dealt notification
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: cardDealt,
            target: 'split',
            index: this.game.getSplitCards()?.length || 0 - 1,
            message: `Card dealt to second hand: ${cardDealt.rank} of ${cardDealt.suit}`
          }
        });
        
        // Check if hand is bust or 21
        const splitHand = this.mapHand(this.game.getSplitCards() || []);
        console.log(`Second hand after hit: value=${splitHand.value}, busted=${splitHand.busted}`);
        
        if (splitHand.busted || splitHand.value === 21) {
          console.log('Second hand busted or has 21, proceeding to dealer turn');
          // If split hand is bust or 21, player turn is over
          this.processDealerTurn();
        }
      }
    } 
    else {
      // Regular hit
      console.log('Processing regular hit for non-split hand');
      cardDealt = this.game.hit();
      
      // Send card dealt notification
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: {
          card: cardDealt,
          target: 'player',
          index: this.game.getPlayerCards().length - 1,
          message: `Card dealt: ${cardDealt.rank} of ${cardDealt.suit}`
        }
      });
      
      // Check if player busted or has 21
      const playerHand = this.mapHand(this.game.getPlayerCards());
      console.log(`Player hand after hit: value=${playerHand.value}, busted=${playerHand.busted}`);
      
      if (playerHand.busted) {
        console.log('Player busted, ending game');
        // If player busts, dealer's turn is skipped
        this.endGame();
      }
      else if (playerHand.value === 21) {
        console.log('Player has 21, automatically standing');
        // If player has 21, automatically stand
        this.handleStand();
      }
    }
    
    // Send updated allowed actions
    this.sendAllowedActions();
  }
  
  /**
   * Handle a stand request from the player
   */
  private handleStand(hand?: 'first' | 'second'): void {
    console.log(`Player stand request in session ${this.clientId}${hand ? ' for ' + hand + ' hand' : ''}`);
    
    // Verify we're in the player turn phase
    if (this.game.getGamePhase() !== 'player_turn') {
      throw new Error('Cannot stand - not in player turn phase');
    }
    
    // Handle split hands if applicable
    if (this.game.hasSplit()) {
      // If no hand specified but in split mode, use the active split hand
      const targetHand = hand || this.getActiveSplitHand() || 'first';
      console.log(`Processing stand for split hand: ${targetHand}`);
      
      if (targetHand === 'first') {
        console.log('Standing on first hand, switching to second hand');
        // Stand on first hand, switch to second hand
        this.handleSplitHandSwitch('second');
      } 
      else {
        console.log('Standing on second hand, proceeding to dealer turn');
        // Stand on second hand, player turn is over
        this.processDealerTurn();
      }
    } 
    else {
      console.log('Processing regular stand for non-split hand');
      // Regular stand, proceed to dealer's turn
      this.processDealerTurn();
    }
  }
  
  /**
   * Handle a double down request from the player
   */
  private handleDoubleDown(): void {
    console.log(`Player double down request in session ${this.clientId}`);
    
    // Verify we're in the player turn phase
    if (this.game.getGamePhase() !== 'player_turn') {
      throw new Error('Cannot double down - not in player turn phase');
    }
    
    // Verify doubling down is valid
    if (!this.game.canDoubleDown()) {
      throw new Error('Cannot double down - not eligible (must have 2 cards)');
    }
    
    // Double the bet
    const originalBet = this.game.getCurrentBet();
    const newBet = originalBet * 2;
    console.log(`Doubling bet from ${originalBet} to ${newBet}`);
    
    // Deduct additional bet amount from player balance
    this.playerBalance -= originalBet;
    
    // Execute double down in game logic
    const cardDealt = this.game.doubleDown();
    
    // Update client on action
    this.sendToClient({
      type: MessageType.HAND_UPDATED,
      data: {
        action: 'double_down',
        newBet: newBet,
        originalBet: originalBet,
        playerBalance: this.playerBalance
      }
    });
    
    // Notify client about the card dealt
    this.sendToClient({
      type: MessageType.CARD_DEALT,
      data: {
        card: cardDealt,
        target: 'player',
        index: this.game.getPlayerCards().length - 1,
        message: `Card dealt for double down: ${cardDealt.rank} of ${cardDealt.suit}`
      }
    });
    
    // Check player's hand after doubling
    const playerHand = this.mapHand(this.game.getPlayerCards());
    console.log(`Player hand after double down: value=${playerHand.value}, busted=${playerHand.busted}`);
    
    // After double down, automatically proceed to dealer's turn
    this.processDealerTurn();
  }
  
  /**
   * Handle a split request from the player
   */
  private handleSplit(): void {
    console.log(`Player split request in session ${this.clientId}`);
    
    // Verify we're in the player turn phase
    if (this.game.getGamePhase() !== 'player_turn') {
      throw new Error('Cannot split - not in player turn phase');
    }
    
    // Verify splitting is valid
    if (!this.game.canSplit()) {
      throw new Error('Cannot split - not eligible (must have 2 cards of same rank)');
    }
    
    // Deduct additional bet from player balance
    const betAmount = this.game.getCurrentBet();
    this.playerBalance -= betAmount;
    console.log(`Split bet placed: ${betAmount}, new balance: ${this.playerBalance}`);
    
    // Execute split in game logic
    const [firstCard, secondCard] = this.game.split();
    console.log(`Split performed: first hand with ${firstCard.rank} of ${firstCard.suit}, second hand with ${secondCard.rank} of ${secondCard.suit}`);
    
    // Update client on the split action
    this.sendToClient({
      type: MessageType.SPLIT_RESULT,
      data: {
        success: true,
        playerHand: this.mapHand(this.game.getPlayerCards()),
        splitHand: this.mapHand(this.game.getSplitCards() || []),
        activeHand: 'first',
        playerBalance: this.playerBalance,
        message: "Hand split successfully"
      }
    });
    
    // Show the first hand as active
    this.handleSplitHandSwitch('first');
  }
  
  /**
   * Handle surrendering
   */
  private handleSurrender(): void {
    console.log(`Player surrender request in session ${this.clientId}`);
    
    if (this.game.getGamePhase() !== 'player_turn') {
      throw new Error('Cannot surrender - not in player turn phase');
    }
    
    if (!this.game.canSurrender()) {
      throw new Error('Cannot surrender - not eligible');
    }
    
    // Execute surrender in game logic and get half the bet back
    const returnAmount = this.game.surrender();
    this.playerBalance += returnAmount;
    console.log(`Surrender: returning ${returnAmount} to player, new balance: ${this.playerBalance}`);
    
    // End the game
    this.endGame();
  }
  
  /**
   * Handle insurance
   * @param data Insurance data from client
   */
  private handleInsurance(data: any): void {
    const takeInsurance = data?.takeInsurance === true;
    console.log(`Player insurance request in session ${this.clientId}: ${takeInsurance ? 'accepting' : 'declining'} insurance`);
    
    if (this.game.getGamePhase() !== 'player_turn') {
      throw new Error('Cannot take insurance - not in player turn phase');
    }
    
    if (!this.game.canTakeInsurance()) {
      throw new Error('Cannot take insurance - not eligible');
    }
    
    if (takeInsurance) {
      // Calculate insurance amount (half the original bet)
      const insuranceAmount = this.game.getCurrentBet() / 2;
      
      // Check if player has enough balance
      if (this.playerBalance < insuranceAmount) {
        throw new Error('Insufficient balance for insurance');
      }
      
      // Deduct insurance amount from balance
      this.playerBalance -= insuranceAmount;
      console.log(`Insurance bet placed: ${insuranceAmount}, new balance: ${this.playerBalance}`);
      
      // Set insurance bet on the game by using takeInsurance
      const insuranceResult = this.game.takeInsurance(insuranceAmount);
      
      // Send updated balance to client
      this.sendToClient({
        type: MessageType.PLAYER_BALANCE_UPDATE,
        data: { balance: this.playerBalance }
      });
    }
    
    // Check if dealer has blackjack
    const dealerHasBlackjack = this.isDealerBlackjack();
    console.log(`Dealer has blackjack: ${dealerHasBlackjack}`);
    
    // Send insurance result to client
    this.sendToClient({
      type: MessageType.INSURANCE_RESULT,
      data: {
        dealerHasBlackjack: dealerHasBlackjack,
        payout: dealerHasBlackjack ? this.game.getInsuranceBet() * 2 : 0
      }
    });
    
    // If dealer has blackjack, add insurance payout and end game
    if (dealerHasBlackjack) {
      if (takeInsurance) {
        // Insurance pays 2:1
        const insurancePayout = this.game.getInsuranceBet() * 2;
        this.playerBalance += insurancePayout;
        console.log(`Insurance won! Payout: ${insurancePayout}, new balance: ${this.playerBalance}`);
      }
      
      // Reveal dealer card and end game
      this.game.revealDealerCard();
      this.endGame();
    } else {
      // Continue game with normal gameplay buttons
      this.sendAllowedActions();
    }
  }
  
  /**
   * Handle rebet (placing the same bet as last time)
   */
  private handleRebet(): void {
    if (this.game.getGamePhase() !== 'betting') {
      throw new Error('Cannot rebet - game already in progress');
    }
    
    const lastBet = this.game.getLastBet();
    
    if (lastBet <= 0) {
      throw new Error('No previous bet to repeat');
    }
    
    if (this.playerBalance < lastBet) {
      throw new Error('Insufficient balance for rebet');
    }
    
    // Place the same bet as last time
    this.playerBalance -= lastBet;
    this.game.placeBet(lastBet);
    
    // Send confirmation
    this.sendToClient({
      type: MessageType.BET_PLACED,
      data: { 
        betAmount: lastBet,
        currentBalance: this.playerBalance
      }
    });
  }
  
  /**
   * Handle clearing the current bet
   */
  private handleClearBet(): void {
    if (this.game.getGamePhase() !== 'betting') {
      throw new Error('Cannot clear bet - game already in progress');
    }
    
    const currentBet = this.game.getCurrentBet();
    
    if (currentBet <= 0) {
      return; // Nothing to clear
    }
    
    // Return the bet to the player's balance
    this.playerBalance += currentBet;
    this.game.clearBet();
    
    // Send updated balance to client
    this.sendToClient({
      type: MessageType.PLAYER_BALANCE_UPDATE,
      data: { balance: this.playerBalance }
    });
  }
  
  /**
   * Map a hand from the game to a UI representation
   */
  private mapHand(cards: Card[]): UIHand {
    if (!cards || cards.length === 0) {
      return {
        type: 'player',
        cards: [],
        value: 0,
        busted: false,
        blackjack: false,
        soft: false
      };
    }
    
    // Calculate the value and properties of the hand
    const handCalc = this.game.calculateHandValue ? 
      this.game.calculateHandValue(cards, false) : 
      { value: 0, soft: false, busted: false };
    
    return {
      type: 'player',
      cards: cards,
      value: handCalc.value,
      busted: handCalc.value > 21,
      blackjack: cards.length === 2 && handCalc.value === 21,
      soft: handCalc.soft
    };
  }
  
  /**
   * Send allowed actions to the client
   */
  private sendAllowedActions(): void {
    const allowedActions = this.determineAllowedActions();
    
    this.sendToClient({
      type: MessageType.PLAYER_TURN,
      data: {
        allowedActions: allowedActions
      }
    });
  }
} 