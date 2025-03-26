import { Card } from "./deck";
import { MessageType, ClientMessage, ServerMessage } from "../models/message";
import { BetResult } from "../server/apicalls";
import { BlackjackServer } from "../server/blackjackserver";
import { ApiService } from "../services/api.service";
import { BlackjackGame } from "./blackjackgame";

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
 * Represents player authentication data
 */
interface PlayerAuthData {
  loginData: string;
  userId: string;
  chips: number;
  isAuthenticated: boolean;
}

/**
 * Manages a single game for a client
 */
export class GameSession {
  private clientId: string;
  private server: BlackjackServer;
  private game: BlackjackGame;
  private playerBalance: number = 1000; // Starting balance - will be updated from API
  private gameData: any; // Store game data for reconnection
  private endGameTimeout: NodeJS.Timeout | null = null; // Timeout for holding game data
  private apiService: ApiService;
  private playerAuth: PlayerAuthData = {
    loginData: '',
    userId: '',
    chips: 0,
    isAuthenticated: false
  };
  private blackjackDealer: BlackjackGame; // Add blackjackDealer property
  
  // Add a class-level flag to track if insurance has been offered
  private insuranceOffered: boolean = false;
  
  // Add a flag to track if insurance has been decided for this game
  private insuranceDecided: boolean = false;
  
  constructor(clientId: string, _unusedParam: string, server: BlackjackServer) {
    this.clientId = clientId;
    this.server = server;
    this.game = new BlackjackGame();
    this.apiService = ApiService.getInstance();
    this.blackjackDealer = this.game; // Initialize blackjackDealer with game instance
    
    // Initialize the game
    this.initialize();
    this.gameData = null; // Initialize game data
  }
  
  /**
   * Initialize the session
   */
  private initialize(): void {
    // Initialize with starting balance but don't send game state
    this.playerBalance = 1000;
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
   * Start the game with a bet amount and transition to playing state
   */
  public async startGame(betAmount: number): Promise<void> {
    // Reset the insurance offered and decided flags for the new game
    this.insuranceOffered = false;
    this.insuranceDecided = false;
    
    console.log(`Starting game validation for bet amount: ${betAmount}, player balance: ${this.playerBalance}`);
    
    // Basic validation
    if (typeof betAmount !== 'number' || isNaN(betAmount)) {
      console.error(`Invalid bet amount type: ${betAmount}`);
      this.sendToClient({
        type: MessageType.ERROR,
        data: {
          error: 'Invalid bet amount format'
        }
      });
      return;
    }

    if (betAmount <= 0) {
      console.error(`Bet amount must be greater than 0: ${betAmount}`);
      this.sendToClient({
        type: MessageType.ERROR,
        data: {
          error: 'Bet amount must be greater than 0'
        }
      });
      return;
    }

    if (betAmount > this.playerBalance) {
      console.error(`Insufficient balance: bet ${betAmount} > balance ${this.playerBalance}`);
      this.sendToClient({
        type: MessageType.ERROR,
        data: {
          error: 'Insufficient balance for this bet'
        }
      });
      return;
    }
    
    // Validate bet amount using API if player is authenticated
    if (this.playerAuth.isAuthenticated && this.playerAuth.loginData) {
      console.log(`Validating bet with API for authenticated player`);
      try {
        const isValidBet = await this.apiService.validateBet(betAmount, this.playerAuth.loginData);
        
        if (!isValidBet.success || !isValidBet.data) {
          console.error(`API bet validation failed:`, isValidBet.error);
          this.sendToClient({
            type: MessageType.ERROR,
            data: {
              error: isValidBet.error || 'API validation failed'
            }
          });
          return;
        }
      } catch (error) {
        console.error(`Error during API bet validation:`, error);
        this.sendToClient({
          type: MessageType.ERROR,
          data: {
            error: 'Failed to validate bet with API'
          }
        });
        return;
      }
    } else {
      console.log(`Skipping API validation for unauthenticated player`);
    }
    
    console.log("---------STARTING GAME---------", betAmount);

    // Place the bet
    this.game.placeBet(betAmount);
    this.playerBalance -= betAmount;

    // Transition to dealing phase and deal cards
    this.game.setGamePhase('dealing');
    this.game.dealInitialCards();

    // Get the initial game state with dealt cards
    const gameState = this.game.getGameState(this.playerBalance);

    // Check for special conditions like blackjack
    const specialConditions = this.game.checkSpecialConditions();
    console.log("Checking for special conditions at game start:", specialConditions);

    // If player has blackjack, handle it immediately
    if (specialConditions.playerBlackjack) {
      console.log("Player has blackjack at start of game!");
      
      // Set game phase to complete
      this.game.setGamePhase('complete');
      
      // Reveal dealer's card
      this.game.revealDealerCard();
      const dealerHoleCard = this.game.getDealerCards()[1];
      
      // Update the dealer hand in game state to include the revealed card
      const updatedDealerHand = this.mapHand(this.game.getDealerCards());
      
      // Send the initial state so client can see cards
      this.sendToClient({
        type: MessageType.START_GAME,
        data: {
          playerHand: gameState.playerHand,
          dealerHand: updatedDealerHand, // Use updated dealer hand with hole card
          splitHand: gameState.splitHand,
          activeSplitHand: gameState.activeSplitHand,
          playerBalance: this.playerBalance,
          currentBet: this.game.getCurrentBet(),
          insuranceBet: this.game.getInsuranceBet(),
          gamePhase: 'complete',
          allowedActions: []
        }
      });
      
      // Send the hole card as a separate message for proper animation
      if (dealerHoleCard) {
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: dealerHoleCard,
            target: 'dealer',
            isHoleCard: true
          }
        });
      }
      
      // End the game with blackjack outcome
      setTimeout(() => {
        this.endGame();
      }, 1000);
      
      return;
    }

    // Get initial allowed actions including surrender and double down
    const initialAllowedActions = this.determineInitialAllowedActions();

    // Transition to player turn
    this.game.setGamePhase('player_turn');

    // Create standardized game state message
    const stateMessage = {
      playerHand: gameState.playerHand,
      dealerHand: gameState.dealerHand,
      splitHand: gameState.splitHand,
      activeSplitHand: gameState.activeSplitHand,
      playerBalance: this.playerBalance,
      currentBet: this.game.getCurrentBet(),
      insuranceBet: this.game.getInsuranceBet(),
      gamePhase: 'player_turn',
      allowedActions: initialAllowedActions
    };

    // Send START_GAME message with complete initial state
    this.sendToClient({
      type: MessageType.START_GAME,
      data: stateMessage
    });
    
    // Handle insurance if needed
    if (specialConditions.insuranceAvailable) {
      this.sendToClient({
        type: MessageType.SPECIAL_CASE,
        data: {
          type: 'insurance',
          dealerCard: this.game.getDealerUpCard(),
          insuranceAmount: this.game.getCurrentBet() / 2
        }
      });
    }

    // Handle split if available
    if (specialConditions.splitAvailable) {
      this.sendToClient({
        type: MessageType.SPECIAL_CASE,
        data: {
          type: 'split',
          cards: this.game.getPlayerCards()
        }
      });
    }
  }
  
  /**
   * Determine the initial allowed actions when game starts
   */
  private determineInitialAllowedActions(): MessageType[] {
    const allowedActions: MessageType[] = [];
    
    // Base actions always available
    allowedActions.push(MessageType.HIT);
    allowedActions.push(MessageType.STAND);
    
    // Add surrender and double down for initial hand if player has enough balance
    if (this.playerBalance >= this.game.getCurrentBet()) {
      allowedActions.push(MessageType.DOUBLE_DOWN);
    }
    allowedActions.push(MessageType.SURRENDER);
    
    // Check for split - only available with two cards of same value and sufficient balance
    const playerCards = this.game.getPlayerCards();
    if (playerCards.length === 2 && 
        playerCards[0].value === playerCards[1].value && 
        this.playerBalance >= this.game.getCurrentBet()) {
      allowedActions.push(MessageType.SPLIT);
    }
    
    // Check for insurance - only available when dealer shows an Ace
    const dealerUpCard = this.game.getDealerUpCard();
    if (dealerUpCard && 
        dealerUpCard.rank === 'A' && 
        this.playerBalance >= this.game.getCurrentBet() / 2) {
      allowedActions.push(MessageType.INSURANCE);
    }
    
    return allowedActions;
  }
  
  /**
   * Handle player actions in a centralized manner
   */
  public handlePlayerAction(action: MessageType, data?: any): void {
    switch (action) {
      case MessageType.HIT:
        this.handleHit(data);
        break;
      case MessageType.STAND:
        this.handleStand(data);
        break;
      // ... other actions ...
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
  
  /**
   * End the game and record results
   */
  public async endGame(): Promise<void> {
    try {
        // Get game outcome
        const outcome = this.game.getGameOutcome();
        
        // Calculate chips won/lost
        const betAmount = this.game.getCurrentBet();
        let chipsWon = 0;
        let outcomeType = ''; // For frontend display using GameOutcome enum
        
        switch (outcome) {
            case 'win':
                chipsWon = betAmount * 2;
                outcomeType = 'player_win'; // Match GameOutcome enum
                break;
            case 'push':
                chipsWon = betAmount;
                outcomeType = 'push'; // Match GameOutcome enum
                break;
            case 'blackjack':
                chipsWon = betAmount * 2.5;
                outcomeType = 'player_blackjack'; // Match GameOutcome enum
                break;
            case 'lose':
                chipsWon = 0;
                // Check for dealer blackjack (two cards with value 21)
                if (this.game.getDealerCards().length === 2 && 
                    this.game.getDetailedGameResult().dealerValue === 21) {
                    outcomeType = 'dealer_win'; // Specific case for dealer blackjack
                } 
                // Check if player busted (went over 21)
                else if (this.game.getDetailedGameResult().playerValue > 21) {
                    outcomeType = 'player_bust'; // Player busted
                } 
                else {
                    outcomeType = 'dealer_win'; // Regular dealer win
                }
                break;
            case 'dealer_bust':
                chipsWon = betAmount * 2;
                outcomeType = 'dealer_bust'; // Match GameOutcome enum
                break;
            case 'surrender':
                chipsWon = betAmount / 2;
                outcomeType = 'surrender'; // Match GameOutcome enum
                break;
            case 'insurance_won':
                // If player won insurance, add the insurance payout
                const insuranceBet = this.game.getInsuranceBet();
                chipsWon = insuranceBet * 2; // Insurance pays 2:1
                outcomeType = 'insurance_won'; // Match GameOutcome enum
                break;
            // Handle split outcomes
            case 'split_win_win':
                chipsWon = betAmount * 4; // Win on both hands (2x bet * 2)
                outcomeType = 'split_win';
                break;
            case 'split_lose_lose':
                chipsWon = 0;
                outcomeType = 'split_lose';
                break;
            case 'split_push_push':
                chipsWon = betAmount * 2; // Return both original bets
                outcomeType = 'split_push';
                break;
            case 'split_win_lose':
                chipsWon = betAmount * 2; // Win on one hand (bet * 2), lose on other
                outcomeType = 'split_win_lose';
                break;
            case 'split_lose_win':
                chipsWon = betAmount * 2; // Win on one hand (bet * 2), lose on other
                outcomeType = 'split_win_lose'; // Same outcome type
                break;
            case 'split_win_push':
                chipsWon = betAmount * 3; // Win on one hand (bet * 2) + push bet return
                outcomeType = 'split_win_push';
                break;
            case 'split_push_win':
                chipsWon = betAmount * 3; // Win on one hand (bet * 2) + push bet return
                outcomeType = 'split_win_push'; // Same outcome type
                break;
            case 'split_lose_push':
                chipsWon = betAmount; // Lose on one hand, push on other (return 1 bet)
                outcomeType = 'split_lose_push';
                break;
            case 'split_push_lose':
                chipsWon = betAmount; // Lose on one hand, push on other (return 1 bet)
                outcomeType = 'split_lose_push'; // Same outcome type
                break;
        }
        
        // Update player balance
        this.playerBalance += chipsWon;
        
        // Record bet result if player is authenticated
        if (this.playerAuth.isAuthenticated) {
            await this.recordBetResult(betAmount, chipsWon);
        }
        
        // Send game outcome to client via GAME_END
        this.sendToClient({
            type: MessageType.GAME_END,
            data: {
                outcome: outcomeType, // Use our enhanced outcome type that matches GameOutcome enum
                chipsWon,
                playerBalance: this.playerBalance,
                payout: chipsWon, // Ensure payout field is included for UI display
                insurancePayout: outcome === 'insurance_won' ? this.game.getInsuranceBet() * 2 : undefined
            }
        });
        
        // Reset game state
        this.game.reset();
        
        // Return to betting phase
        this.returnToBettingPhase();
        
    } catch (error) {
        console.error('Error ending game:', error);
        this.sendToClient({
            type: MessageType.ERROR,
            data: {
                error: 'Error ending game'
            }
        });
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
      // Special handling for insurance
      if (action === MessageType.INSURANCE) {
        // Insurance is always checked first without strict phase validation
        // since it's offered at the start of player's turn
        if (this.canTakeInsurance()) {
          this.handleInsurance(data);
          return;
        } else {
          throw new Error(`Insurance not available - dealer's up card is not an Ace or not initial hand`);
        }
      }
      
      // Regular action validation for other actions
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
    
    // Set game phase to dealer_turn
    this.game.setGamePhase('dealer_turn');
    
    // Notify client that dealer turn is starting
    this.sendToClient({
      type: MessageType.DEALER_TURN,
      data: { message: "Dealer's turn" }
    });
    
    // Reveal dealer's hole card first - THIS MUST HAPPEN BEFORE ANY OTHER CARDS
    this.game.revealDealerCard();
    const dealerHoleCard = this.game.getDealerCards()[1];
    console.log(`Dealer's hole card revealed: ${dealerHoleCard.rank} of ${dealerHoleCard.suit}`);
    console.log(`Dealer's hand value after reveal: ${this.game.getDealerValue()}`);
    
    // Send CARD_DEALT message for revealed hole card with dealer target and isHoleCard flag
    this.sendToClient({
      type: MessageType.CARD_DEALT,
      data: {
        card: dealerHoleCard,
        target: 'dealer',
        isHoleCard: true
      }
    });
    
    // Add a delay to ensure hole card is processed before additional cards
    const delay = 800;
    const start = Date.now();
    while (Date.now() - start < delay) {
      // Simple delay
    }
    
    // Check if player has busted
    const playerHand = this.mapHand(this.game.getPlayerCards());
    const splitHand = this.game.hasSplit() ? this.mapHand(this.game.getSplitCards() || []) : null;
    const allHandsBusted = playerHand.busted && (!splitHand || splitHand.busted);
    
    // If all player hands busted, skip dealer drawing cards
    if (allHandsBusted) {
      console.log('All player hands busted, skipping dealer drawing cards and ending game');
      this.game.setGamePhase('complete');
      this.endGame();
      return;
    }
    
    // Execute dealer's turn (draw cards until 17 or higher) after revealing hole card
    // We're using a delayed approach to ensure cards are processed in sequence
    setTimeout(() => {
      const dealerCards = this.executeDealerTurn();
      console.log(`Dealer's turn complete. Final hand value: ${this.game.getDealerValue()}`);
      
      // End the game with final outcome after a slight delay
      setTimeout(() => {
        this.game.setGamePhase('complete');
        this.endGame();
      }, 500);
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
      
      // Send simplified CARD_DEALT message for each new dealer card
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: {
          card: card,
          target: 'dealer',
          isHoleCard: false,
          isAdditionalCard: true
        }
      });
      
      // Add a small delay to allow animations to complete
      const delay = 500; // milliseconds
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Simple delay without setTimeout (which would require promises/async)
      }
    }
    
    // Log dealer's final status
    const finalMessage = this.game.getDealerValue() > 21 
      ? `Dealer busted with ${this.game.getDealerValue()}`
      : `Dealer stands with ${this.game.getDealerValue()}`;
    console.log(finalMessage);
    
    // Send final hand state after dealer finishes drawing
    this.sendToClient({
      type: MessageType.HAND_UPDATED,
      data: {
        action: this.game.getDealerValue() > 21 ? 'bust' : 'stand',
        dealerHand: this.mapHand(this.game.getDealerCards()),
        playerHand: this.mapHand(this.game.getPlayerCards()),
        splitHand: this.game.hasSplit() ? this.mapHand(this.game.getSplitCards() || []) : null,
        activeSplitHand: this.getActiveSplitHand(),
        playerBalance: this.playerBalance,
        currentBet: this.game.getCurrentBet(),
        insuranceBet: this.game.getInsuranceBet(),
        gamePhase: this.game.getGamePhase(),
        allowedActions: []
      }
    });
    
    return dealerCards;
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
        return `Blackjack! You win 3:2! New balance: ${this.playerBalance}`;
      case 'player_win':
        return `Congratulations! You win! New balance: ${this.playerBalance}`;
      case 'dealer_win':
        return `Dealer wins. Better luck next time! New balance: ${this.playerBalance}`;
      case 'push':
        return `It's a tie! Your bet has been returned. New balance: ${this.playerBalance}`;
      case 'player_bust':
        return `Bust! Your hand went over 21. New balance: ${this.playerBalance}`;
      case 'dealer_bust':
        return `Dealer busts! You win! New balance: ${this.playerBalance}`;
      case 'surrender':
        return `You surrendered. Half your bet is returned. New balance: ${this.playerBalance}`;
      case 'insurance_won':
        return `Dealer has Blackjack. Insurance pays 2:1! New balance: ${this.playerBalance}`;
      
      // Split outcome messages
      case 'split_win_win':
        return `Both hands win! New balance: ${this.playerBalance}`;
      case 'split_lose_lose':
        return `Both hands lose. New balance: ${this.playerBalance}`;
      case 'split_push_push':
        return `Both hands tie with the dealer. New balance: ${this.playerBalance}`;
      case 'split_win_lose':
        return `First hand wins, second hand loses. New balance: ${this.playerBalance}`;
      case 'split_lose_win':
        return `First hand loses, second hand wins. New balance: ${this.playerBalance}`;
      case 'split_win_push':
        return `First hand wins, second hand ties. New balance: ${this.playerBalance}`;
      case 'split_push_win':
        return `First hand ties, second hand wins. New balance: ${this.playerBalance}`;
      case 'split_lose_push':
        return `First hand loses, second hand ties. New balance: ${this.playerBalance}`;
      case 'split_push_lose':
        return `First hand ties, second hand loses. New balance: ${this.playerBalance}`;
      
      default:
        return `Game over. New balance: ${this.playerBalance}`;
    }
  }
  
  /**
   * Handle automatic transitions based on special conditions
   */
  private handleAutomaticTransitions(specialConditions: any): void {
    console.log("Checking special conditions:", specialConditions);

    // Auto-end game if dealer has blackjack
    if (specialConditions.dealerBlackjack) {
      console.log("Dealer has blackjack - ending game immediately");
      
      // If insurance was taken, process it
      if (this.game.getInsuranceBet() > 0) {
        const insurancePayout = this.game.getInsuranceBet() * 2;
        this.playerBalance += insurancePayout;
        
        this.sendToClient({
          type: MessageType.BALANCE_UPDATE,
          data: {
            balance: this.playerBalance,
            insurancePayout: insurancePayout
          }
        });
      }
      
      // Reveal dealer's hole card
      this.game.revealDealerCard();
      const dealerHoleCard = this.game.getDealerCards()[1];
      
      // Send card dealt for dealer's hole card with isHoleCard flag
      if (dealerHoleCard) {
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: dealerHoleCard,
            target: 'dealer',
            isHoleCard: true
          }
        });
      }
      
      // End the game immediately
      this.game.setGamePhase('complete');
      this.endGame();
      return;
    }
    
    // Auto-end game if player has blackjack
    if (specialConditions.playerBlackjack) {
      console.log('Player has blackjack! Ending game immediately.');
      
      // Set game phase to complete
      this.game.setGamePhase('complete');
      
      // Reveal dealer's hole card
      this.game.revealDealerCard();
      const dealerHoleCard = this.game.getDealerCards()[1];
      
      // Send card dealt for dealer's hole card with isHoleCard flag
      if (dealerHoleCard) {
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: dealerHoleCard,
            target: 'dealer',
            isHoleCard: true
          }
        });
      }
      
      // End the game with blackjack win
      this.endGame();
      return;
    }
    
    // If dealer shows an ace, offer insurance (but only if we haven't offered it yet)
    if (specialConditions.insuranceAvailable && !this.insuranceOffered) {
      this.insuranceOffered = true; // Mark insurance as offered
      console.log("Insurance offered for this hand");
      
      this.sendToClient({
        type: MessageType.SPECIAL_CASE,
        data: {
          type: 'insurance',
          dealerCard: this.game.getDealerUpCard(),
          insuranceAmount: this.game.getCurrentBet() / 2
        }
      });
    }
    
    // If player has a pair, offer split
    if (specialConditions.splitAvailable) {
      this.sendToClient({
        type: MessageType.SPECIAL_CASE,
        data: {
          type: 'split',
          cards: this.game.getPlayerCards()
        }
      });
    }
  }
  
  /**
   * Check if insurance is available for the current hand
   */
  private canTakeInsurance(): boolean {
    const gamePhase = this.game.getGamePhase();
    
    // Insurance is only available in player turn phase
    if (gamePhase !== 'player_turn') {
      return false;
    }
    
    // Only offer insurance at the very start of the hand (player has exactly 2 cards)
    const playerCards = this.game.getPlayerCards();
    if (playerCards.length !== 2) {
      return false;
    }
    
    // Check if dealer's up card is an Ace
    const dealerUpCard = this.game.getDealerUpCard();
    if (!dealerUpCard || dealerUpCard.rank !== 'A') {
      return false;
    }
    
    // Check if player has sufficient balance for insurance bet
    const insuranceBet = this.game.getCurrentBet() / 2;
    if (this.playerBalance < insuranceBet) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Determine the allowed actions based on current game state
   */
  private determineAllowedActions(): MessageType[] {
    const allowedActions: MessageType[] = [];
    const gamePhase = this.game.getGamePhase();
    
    if (gamePhase === 'betting') {
      allowedActions.push(MessageType.PLACE_BET);
      
      // Add rebet if there's a previous bet
      if (this.game.getLastBet() > 0 && this.playerBalance >= this.game.getLastBet()) {
        allowedActions.push(MessageType.REBET);
      }
    }
    else if (gamePhase === 'player_turn') {
      // Check player's hand value
      const playerHand = this.mapHand(this.game.getPlayerCards());
      const playerCards = this.game.getPlayerCards();
      
      // If player has 21 and more than 2 cards (not blackjack), only allow stand
      if (playerHand.value === 21 && playerCards.length > 2) {
        allowedActions.push(MessageType.STAND);
        return allowedActions;
      }
      
      // Base actions always available during player turn (except when 21)
      allowedActions.push(MessageType.HIT);
      allowedActions.push(MessageType.STAND);
      
      // Check if this is the initial phase (only 2 cards)
      const isInitialPhase = playerCards.length === 2;
      
      if (isInitialPhase) {
        // Surrender and double down only available initially
        allowedActions.push(MessageType.SURRENDER);
        if (this.playerBalance >= this.game.getCurrentBet()) {
          allowedActions.push(MessageType.DOUBLE_DOWN);
        }
        
        // Split only available initially with matching cards and sufficient balance
        if (this.canPlayerSplit() && this.playerBalance >= this.game.getCurrentBet()) {
          allowedActions.push(MessageType.SPLIT);
        }
        
        // Insurance check - only available when dealer shows an Ace at the start of hand
        // AND insurance has not already been decided
        if (!this.insuranceDecided && 
            this.canTakeInsurance() && 
            this.playerBalance >= this.game.getCurrentBet() / 2) {
          // Only include INSURANCE in allowed actions if the player still has exactly 2 cards
          // This ensures insurance is removed from options after the first hit
          if (playerCards.length === 2) {
            allowedActions.push(MessageType.INSURANCE);
          }
        }
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
   * Handle client messages for this session
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
        case MessageType.START_GAME:
          // Start new game with bet
          if (message.data && typeof message.data.amount === 'number') {
            this.startGame(message.data.amount);
          } else {
            throw new Error("Invalid bet amount");
          }
          break;
          
        case MessageType.DEAL_CARDS:
          // Deal cards with the current bet
          if (this.game.getGamePhase() === 'betting' && this.game.getCurrentBet() > 0) {
            this.game.dealInitialCards();
            this.handlePostDeal();
          } else {
            // Try to recover
            this.forceBettingPhase();
            throw new Error("Cannot deal cards - place a bet first");
          }
          break;
          
        // All gameplay actions
        case MessageType.HIT:
        case MessageType.STAND:
        case MessageType.DOUBLE_DOWN:
        case MessageType.SPLIT:
        case MessageType.SURRENDER:
        case MessageType.INSURANCE:
        case MessageType.REBET:
          this.handleGameAction(message.type, message.data);
          break;
          
        // Get current game state
        case MessageType.GET_GAME_STATE:
          this.sendGameState();
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
    const gameState = this.game.getGameState(this.playerBalance);
    const allowedActions = this.determineAllowedActions();

    // Create standardized game state message
    const stateMessage = {
      playerHand: gameState.playerHand,
      dealerHand: gameState.dealerHand,
      splitHand: gameState.splitHand,
      activeSplitHand: gameState.activeSplitHand,
      playerBalance: this.playerBalance,
      currentBet: this.game.getCurrentBet(),
      insuranceBet: this.game.getInsuranceBet(),
      gamePhase: gameState.gamePhase,
      allowedActions: allowedActions
    };

    // Send GAME_STATE for all game state updates
    this.server.sendToClient(targetClientId, {
      type: MessageType.GAME_STATE,
      data: stateMessage
    });
  }
  
  /**
   * Send player balance update
   */
  private sendPlayerBalanceUpdate(): void {
    this.sendToClient({
      type: MessageType.BALANCE_UPDATE,
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
    const gameState = this.game.getGameState(this.playerBalance);
    return gameState.activeSplitHand || null;
  }
  
  /**
   * Handle the switch between split hands
   */
  private handleSplitHandSwitch(hand: 'first' | 'second'): void {
    this.game.setActiveSplitHandUI(hand);
    
    const gameState = this.game.getGameState(this.playerBalance);
    
    // Extract information about each hand to provide more details to the client
    // This helps maintain proper positioning and visual state
    const playerHandValue = gameState.playerHand ? this.mapHand(gameState.playerHand.cards).value : 0;
    const splitHandValue = gameState.splitHand ? this.mapHand(gameState.splitHand.cards).value : 0;
    
    // Determine allowed actions for the active hand
    const allowedActions = this.determineAllowedActions();
    
    // Include more information to help the client maintain proper UI state
    const stateMessage = {
      playerHand: gameState.playerHand,
      dealerHand: gameState.dealerHand,
      splitHand: gameState.splitHand,
      activeSplitHand: hand,
      activeHandValue: hand === 'first' ? playerHandValue : splitHandValue,
      playerBalance: this.playerBalance,
      currentBet: this.game.getCurrentBet(),
      insuranceBet: this.game.getInsuranceBet(),
      gamePhase: gameState.gamePhase,
      allowedActions: allowedActions,
      message: `Now playing ${hand === 'first' ? 'first' : 'second'} hand`,
      // Add additional information to help client maintain positioning
      cardPositionsLocked: true, // Signal that card positions should not be recalculated
      firstHandBusted: gameState.playerHand?.busted || false,
      secondHandBusted: gameState.splitHand?.busted || false,
      firstHandValue: playerHandValue,
      secondHandValue: splitHandValue,
      // Include card counts to help prevent positioning errors
      firstHandCardCount: gameState.playerHand?.cards.length || 0,
      secondHandCardCount: gameState.splitHand?.cards.length || 0
    };
    
    console.log(`Switching to ${hand} hand - sending detailed state with values: ` +
                `first(${playerHandValue}), second(${splitHandValue}), allowed actions: ${allowedActions}`);
    
    // Send the enhanced state message to client
    this.sendToClient({
      type: MessageType.HAND_UPDATED,
      data: stateMessage
    });
  }
  
  /**
   * Check if the hit operation resulted in a bust or 21
   */
  private checkHandAfterHit(hand: UIHand): boolean {
    // Return true if player turn is over (bust or 21)
    return hand.busted || hand.value === 21;
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
    
    // After a hit, insurance is no longer available - reset any pending insurance options
    if (this.game.getDealerUpCard()?.rank === 'A') {
      console.log("Player hit after insurance was offered - insurance is no longer available");
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
        
        // Send card dealt notification - simplified format with just target and card
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: cardDealt,
            target: 'player'
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
          console.log('First hand has 21, automatically switching to second hand');
          // When first hand is 21, automatically switch to second hand
          this.handleSplitHandSwitch('second');
        }
      } 
      else {
        // Hit the split hand
        cardDealt = this.game.hitSplitHand('second');
        
        // Send card dealt notification - simplified format with just target and card
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: cardDealt,
            target: 'split'
          }
        });
        
        // Check if hand is bust or 21
        const splitHand = this.mapHand(this.game.getSplitCards() || []);
        console.log(`Second hand after hit: value=${splitHand.value}, busted=${splitHand.busted}`);
        
        if (splitHand.busted) {
          console.log('Second hand busted, proceeding to dealer turn');
          // If split hand is bust, player turn is over
          this.game.setGamePhase('dealer_turn');
          this.processDealerTurn();
        }
        else if (splitHand.value === 21) {
          console.log('Second hand has 21, automatically proceeding to dealer turn');
          // When second hand is 21, automatically proceed to dealer turn
          this.game.setGamePhase('dealer_turn');
          this.processDealerTurn();
        }
      }
    } 
    else {
      // Regular hit
      console.log('Processing regular hit for non-split hand');
      cardDealt = this.game.hit();
      
      // Send card dealt notification - simplified format with just target and card
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: {
          card: cardDealt,
          target: 'player'
        }
      });
      
      // Check if player busted or has 21
      const playerHand = this.mapHand(this.game.getPlayerCards());
      const playerCards = this.game.getPlayerCards();
      console.log(`Player hand after hit: value=${playerHand.value}, busted=${playerHand.busted}, cards=${playerCards.length}`);
      
      if (playerHand.busted) {
        console.log('Player busted, ending game');
        // If player busts, dealer's turn is skipped, directly set game phase to complete
        this.game.setGamePhase('complete');
        this.endGame();
      }
      else if (playerHand.value === 21) {
        console.log('Player has 21, automatically standing');
        // If player has 21, automatically stand (new automatic behavior)
        this.handleStand();
      }
    }
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
    
    // Send an explicit HAND_UPDATED message indicating the stand action
    this.sendToClient({
      type: MessageType.HAND_UPDATED,
      data: {
        action: 'stand',
        dealerHand: this.mapHand(this.game.getDealerCards()),
        playerHand: this.mapHand(this.game.getPlayerCards()),
        splitHand: this.game.hasSplit() ? this.mapHand(this.game.getSplitCards() || []) : null,
        activeSplitHand: this.getActiveSplitHand(),
        playerBalance: this.playerBalance,
        currentBet: this.game.getCurrentBet(),
        insuranceBet: this.game.getInsuranceBet(),
        gamePhase: this.game.getGamePhase(),
        allowedActions: [],
        message: `Player stands${hand ? ' on ' + hand + ' hand' : ''}`
      }
    });
    
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
        
        // Set game phase to dealer_turn to prevent further player actions
        this.game.setGamePhase('dealer_turn');
        
        // Process dealer's turn
        this.processDealerTurn();
      }
    } 
    else {
      console.log('Processing regular stand for non-split hand');
      // Regular stand, proceed to dealer's turn
      
      // Set game phase to dealer_turn to prevent further player actions
      this.game.setGamePhase('dealer_turn');
      
      // Process dealer's turn
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
    
    // Notify client about the card dealt - simplified message with just target and card
    this.sendToClient({
      type: MessageType.CARD_DEALT,
      data: {
        card: cardDealt,
        target: 'player'
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
    
    // Deduct additional bet from player balance for the second hand
    const betAmount = this.game.getCurrentBet();
    
    // Check if player has enough balance for the split bet
    if (this.playerBalance < betAmount) {
      throw new Error(`Insufficient balance for split (need ${betAmount}, have ${this.playerBalance})`);
    }
    
    // Deduct the bet for the second hand
    this.playerBalance -= betAmount;
    console.log(`Split bet placed: ${betAmount}, new balance: ${this.playerBalance}`);
    
    // Execute split in game logic
    const [firstCard, secondCard] = this.game.split();
    console.log(`Split performed: first hand with ${firstCard.rank} of ${firstCard.suit}, second hand with ${secondCard.rank} of ${secondCard.suit}`);
    
    // Update balance first
    this.sendToClient({
      type: MessageType.BALANCE_UPDATE,
      data: {
        balance: this.playerBalance,
        message: "Split bet placed"
      }
    });
    
    // Send first card to first hand (player hand)
    this.sendToClient({
      type: MessageType.CARD_DEALT,
      data: {
        card: firstCard,
        target: 'player'
      }
    });
    
    // Small delay between cards
    const delay = 300;
    const start = Date.now();
    while (Date.now() - start < delay) {
      // Simple delay
    }
    
    // Send second card to split hand
    this.sendToClient({
      type: MessageType.CARD_DEALT,
      data: {
        card: secondCard,
        target: 'split'
      }
    });
    
    // After cards are dealt, send complete split result
    this.sendToClient({
      type: MessageType.SPLIT_RESULT,
      data: {
        success: true,
        playerHand: this.mapHand(this.game.getPlayerCards()),
        splitHand: this.mapHand(this.game.getSplitCards() || []),
        activeHand: 'first',
        playerBalance: this.playerBalance,
        currentBet: this.game.getCurrentBet(),
        splitBet: betAmount, // Add the split bet to the message
        message: "Hand split successfully",
        allowedActions: this.determineAllowedActions()
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
    console.log(`Surrender: player will get back ${returnAmount} in endGame, current balance: ${this.playerBalance}`);

    // Send HAND_UPDATED message with empty allowed actions
    this.sendToClient({
        type: MessageType.HAND_UPDATED,
        data: {
            playerHand: this.game.getGameState(this.playerBalance).playerHand,
            dealerHand: this.game.getGameState(this.playerBalance).dealerHand,
            splitHand: null,
            activeSplitHand: null,
            playerBalance: this.playerBalance,
            currentBet: this.game.getCurrentBet(),
            insuranceBet: this.game.getInsuranceBet(),
            gamePhase: 'complete',
            allowedActions: []
        }
    });
    
    // Set game phase to complete
    this.game.setGamePhase('complete');
    
    // End the game with surrender outcome through GAME_END
    this.endGame();
  }
  
  /**
   * Handle insurance
   * @param data Insurance data from client
   */
  private handleInsurance(data: any): void {
    const takeInsurance = data?.takeInsurance === true;
    console.log(`Player insurance request in session ${this.clientId}: ${takeInsurance ? 'accepting' : 'declining'} insurance`);
    
    // Insurance validation should use our canTakeInsurance method
    if (!this.canTakeInsurance()) {
        throw new Error('Cannot take insurance - not eligible');
    }
    
    // Mark insurance as decided as soon as the player makes a choice
    this.insuranceDecided = true;
    
    // Handle insurance decision
    if (takeInsurance) {
        // Player accepts insurance
        const insuranceAmount = this.game.getCurrentBet() / 2;
        
        if (this.playerBalance < insuranceAmount) {
            throw new Error('Insufficient balance for insurance');
        }
        
        this.playerBalance -= insuranceAmount;
        const insuranceResult = this.game.takeInsurance(insuranceAmount);
        
        console.log(`Insurance taken: ${insuranceAmount} chips`);
        
        // Send balance update
        this.sendToClient({
            type: MessageType.BALANCE_UPDATE,
            data: {
                balance: this.playerBalance,
                insuranceBet: insuranceAmount,
            }
        });
        
        // Send action result for insurance
        this.sendToClient({
            type: MessageType.ACTION_RESULT,
            data: {
                success: true,
                action: MessageType.INSURANCE,
                message: `Insurance taken for ${insuranceAmount} chips`,
                phase: this.game.getGamePhase()
            }
        });

        // Check if dealer has blackjack and handle accordingly
        if (insuranceResult.outcome === 'insurance_won') {
            console.log("Dealer has blackjack - revealing card and ending game");
            
            // Reveal dealer's hole card
            this.game.revealDealerCard();
            const dealerHoleCard = this.game.getDealerCards()[1];
            
            // Send card dealt for dealer's hole card with isHoleCard flag
            if (dealerHoleCard) {
                this.sendToClient({
                    type: MessageType.CARD_DEALT,
                    data: {
                        card: dealerHoleCard,
                        target: 'dealer',
                        isHoleCard: true
                    }
                });
            }
            
            // Set game phase to complete
            this.game.setGamePhase('complete');
            
            // End the game with insurance win outcome through GAME_END
            this.endGame();
        } else {
            // Dealer doesn't have blackjack - player loses insurance bet
            console.log("Dealer doesn't have blackjack - player loses insurance bet");
            
            // Send insurance loss outcome as ACTION_RESULT
            this.sendToClient({
                type: MessageType.ACTION_RESULT,
                data: {
                    success: true,
                    action: MessageType.INSURANCE,
                    outcome: 'insurance_lost', // Use GameOutcome.INSURANCE_LOST value
                    message: "Dealer doesn't have blackjack. Insurance bet lost.",
                    allowedActions: this.determineAllowedActions(),
                    phase: this.game.getGamePhase()
                }
            });
            
            // Allow player to continue with regular actions
            this.sendAllowedActions();
        }
    } else {
        // Player declines insurance
        console.log("Player declined insurance");
        this.game.declineInsurance();
        
        // Send action result for declining insurance
        this.sendToClient({
            type: MessageType.ACTION_RESULT,
            data: {
                success: true,
                action: MessageType.INSURANCE,
                message: "Insurance declined",
                phase: this.game.getGamePhase()
            }
        });
        
        // Check if dealer has blackjack after insurance is declined
        if (this.game.checkDealerHasBlackjack()) {
            // Dealer has blackjack - end the game immediately
            console.log("Dealer has blackjack after insurance declined - ending game");
            
            // Set game phase to complete
            this.game.setGamePhase('complete');
            
            // Reveal dealer's hole card
            this.game.revealDealerCard();
            const dealerHoleCard = this.game.getDealerCards()[1];
            
            // Send card dealt for dealer's hole card with isHoleCard flag
            if (dealerHoleCard) {
                this.sendToClient({
                    type: MessageType.CARD_DEALT,
                    data: {
                        card: dealerHoleCard,
                        target: 'dealer',
                        isHoleCard: true
                    }
                });
            }
            
            // End the game which will determine the outcome and send GAME_END message
            this.endGame();
        } else {
            // Dealer doesn't have blackjack, continue normal gameplay
            console.log("Dealer doesn't have blackjack after insurance declined - continuing game");
            
            // Allow player to continue with regular actions
            this.sendAllowedActions();
        }
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
      type: MessageType.BALANCE_UPDATE,
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

  /**
   * Check if surrender is allowed
   * Only allowed in initial phase with exactly 2 cards
   */
  private canSurrender(): boolean {
    const playerCards = this.game.getPlayerCards();
    return playerCards.length === 2 && !this.game.hasSplit();
  }

  /**
   * Handle post-deal logic including checking for special conditions
   */
  private handlePostDeal(): void {
    // Check for special conditions like blackjack, insurance, etc.
    const specialConditions = this.game.checkSpecialConditions();
    
    // Send game state update
    this.sendGameState();
    
    // Handle any special conditions
    this.handleAutomaticTransitions(specialConditions);
    
    // Update game phase if no special conditions ended the game
    if (this.game.getGamePhase() !== 'complete') {
      this.game.setGamePhase('player_turn');
    }
  }

  /**
   * Authenticate a player with the API
   */
  public async authenticatePlayer(loginData: string): Promise<boolean> {
    if (!loginData) {
      console.error(`Authentication failed for client ${this.clientId}: No login data provided`);
      this.sendToClient({
        type: MessageType.AUTH_ERROR,
        data: { message: 'Login data is required' }
      });
      return false;
    }

    console.log(`Authenticating player for client ${this.clientId} with login data: ${loginData}`);

    try {
      // Get user data from API
      const response = await this.apiService.getUserData(loginData);
      
      if (response.success && response.data) {
        // Update player auth data
        this.playerAuth = {
          loginData,
          userId: response.data.userId,
          chips: response.data.chips || 1000,
          isAuthenticated: true
        };
        
        // Update player balance
        this.playerBalance = this.playerAuth.chips;
        
        // Send success message
        this.sendToClient({
          type: MessageType.AUTH_SUCCESS,
          data: {
            message: 'Authentication successful',
            balance: this.playerBalance
          }
        });
        
        console.log(`Player ${this.clientId} authenticated successfully with balance: ${this.playerBalance}`);
        return true;
      } else {
        // Handle authentication failure
        const errorMessage = response.error || 'Authentication failed';
        console.error(`Authentication failed for client ${this.clientId}:`, {
          error: errorMessage,
          response: response
        });
        
        this.sendToClient({
          type: MessageType.AUTH_ERROR,
          data: { message: errorMessage }
        });
        
        // Reset auth data
        this.playerAuth = {
          loginData: '',
          userId: '',
          chips: 0,
          isAuthenticated: false
        };
        
        return false;
      }
    } catch (error) {
      console.error(`Authentication error for client ${this.clientId}:`, error);
      
      this.sendToClient({
        type: MessageType.AUTH_ERROR,
        data: { message: 'Authentication failed due to an error' }
      });
      
      return false;
    }
  }

  /**
   * Record a bet result with the API
   */
  private async recordBetResult(betAmount: number, chipsWon: number): Promise<void> {
    if (!this.playerAuth.isAuthenticated || !this.playerAuth.userId) {
      console.warn('Cannot record bet result: Player not authenticated');
      return;
    }

    try {
      const betResult: BetResult = {
        userId: this.playerAuth.userId,
        betAmount,
        chipsWon
      };

      const response = await this.apiService.recordBetResult(betResult);
      
      if (response.success) {
        // Update local balance
        this.playerBalance += chipsWon;
        this.playerAuth.chips = this.playerBalance;
        
        // Send balance update to client
        this.sendPlayerBalanceUpdate();
      } else {
        console.error('Failed to record bet result:', response.error);
      }
    } catch (error) {
      console.error('Error recording bet result:', error);
    }
  }

  /**
   * Reset the game state for a new round
   */
  public reset(): void {
    // Reset game state
    this.game.reset();
    
    // Reset session flags
    this.insuranceOffered = false;
    this.insuranceDecided = false;
  }
} 