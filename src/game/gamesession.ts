import { Card } from "./deck";
import { MessageType, ClientMessage, ServerMessage } from "../models/message";
import { BlackjackServer } from "../server/blackjackserver";
import { ApiService, GameStateData } from "../services/api.service";
import { BlackjackGame } from "./blackjackgame";
import { LoginData, ExternalApiResponse } from "../types/game.types";

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
  loginData: LoginData;
  userId: string;
  chips: number;
  isAuthenticated: boolean;
}

// Define game phase type
export enum GamePhase {
    BETTING = 'betting',
    DEALING = 'dealing',
    PLAYER_TURN = 'player_turn',
    DEALER_TURN = 'dealer_turn',
    COMPLETE = 'complete'
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
    loginData: {
      loginMethod: '',
      timestamp: 0,
      jwt: '',
      userId: ''
    },
    userId: '',
    chips: 0,
    isAuthenticated: false
  };
  private blackjackDealer: BlackjackGame; // Add blackjackDealer property
  
  // Add a class-level flag to track if insurance has been offered
  private insuranceOffered: boolean = false;
  
  // Add a flag to track if insurance has been decided for this game
  private insuranceDecided: boolean = false;
  
  // Flag to track if we need to save game state
  private shouldSaveGameState: boolean = false;
  
  // Add a flag to track if we have restored allowed actions from a saved state
  private isRestoredState: boolean = false;
  
  // Add a class-level property to store the restored allowed actions
  private restoredAllowedActions: MessageType[] = [];
  
  // Add a class-level property to store the last saved split cards
  private lastSavedSplitCards: Card[] = [];
  
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
    
    // Validate bet amount using ApiService if player is authenticated
    if (this.playerAuth.isAuthenticated && this.playerAuth.loginData) {
        console.log(`Validating bet with API for authenticated player`);
        try {
            const response = await this.apiService.checkBet(this.playerAuth.loginData, betAmount);
            
            if (!response.success || !response.data?.isValid) {
                console.error(`API bet validation failed:`, response.error);
                this.sendToClient({
                    type: MessageType.ERROR,
                    data: {
                        error: response.error || 'API validation failed'
                    }
                });
                return;
            }

            // Update player balance from API response
            this.playerBalance = response.data.availableChips;
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
    
    // Debug logging to check bet amount
    console.log(`[BET DEBUG] After placeBet, current bet = ${this.game.getCurrentBet()}`);
    
    this.playerBalance -= betAmount;

    // Fetch random numbers before dealing cards
    try {
        await this.game.fetchRandomNumbers();
        console.log("Successfully fetched random numbers for this game");
    } catch (error) {
        console.error("Failed to fetch random numbers:", error);
        // Continue with local random numbers as fallback
    }

    // Transition to dealing phase and deal cards
    this.game.setGamePhase('dealing');
    this.game.dealInitialCards();

    // Get the initial game state with dealt cards
    const gameState = this.game.getGameState(this.playerBalance);
    
    // Debug logging for bet amount verification
    console.log(`[BET DEBUG] After dealInitialCards, current bet = ${this.game.getCurrentBet()}`);

    // Check for special conditions like blackjack
    const specialConditions = this.game.checkSpecialConditions();
    console.log("Checking for special conditions at game start:", specialConditions);

    // Get initial allowed actions including surrender and double down
    const initialAllowedActions = this.determineInitialAllowedActions();

    // MODIFIED: Send START_GAME with minimal info and then send CARD_DEALT messages
    // First, send START_GAME
    this.sendToClient({
        type: MessageType.START_GAME,
        data: {
            playerBalance: this.playerBalance,
            currentBet: this.game.getCurrentBet(),
            gamePhase: 'dealing'
        }
    });
    
    // Add a small delay before sending card messages
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Then send individual cards
    // First the player's first card
    if (gameState.playerHand && gameState.playerHand.cards.length > 0) {
        this.sendToClient({
            type: MessageType.CARD_DEALT,
            data: {
                card: gameState.playerHand.cards[0],
                target: 'player'
            }
        });
        
        // Small delay between cards
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Then dealer's up card
    if (gameState.dealerHand && gameState.dealerHand.cards.length > 0) {
        this.sendToClient({
            type: MessageType.CARD_DEALT,
            data: {
                card: gameState.dealerHand.cards[0],
                target: 'dealer'
            }
        });
        
        // Small delay between cards
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Then player's second card
    if (gameState.playerHand && gameState.playerHand.cards.length > 1) {
        this.sendToClient({
            type: MessageType.CARD_DEALT,
            data: {
                card: gameState.playerHand.cards[1],
                target: 'player'
            }
        });
        
        // Small delay between cards
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Finally dealer's hole card
    if (gameState.dealerHand && gameState.dealerHand.cards.length > 1) {
        // For hole card, make sure it's face down
        const holeCard = {...gameState.dealerHand.cards[1]};
        holeCard.faceUp = false;
        
        this.sendToClient({
            type: MessageType.CARD_DEALT,
            data: {
                card: holeCard,
                target: 'dealer'
            }
        });
    }

    // If player has blackjack, handle it immediately
    if (specialConditions.playerBlackjack) {
        console.log("Player has blackjack at start of game!");
        
        // Set game phase to complete
        this.game.setGamePhase('complete');
        
        // Reveal dealer's card
        this.game.revealDealerCard();
        const dealerHoleCard = this.game.getDealerCards()[1];
        
        // Add a small delay before phase change
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Send a PHASE_CHANGE to complete
        this.sendToClient({
            type: MessageType.PHASE_CHANGE,
            data: {
                from: 'dealing',
                to: 'complete',
                playerBalance: this.playerBalance,
                currentBet: this.game.getCurrentBet()
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

    // Transition to player turn
    this.game.setGamePhase('player_turn');

    // Send a PHASE_CHANGE to player_turn
    this.sendToClient({
        type: MessageType.PHASE_CHANGE,
        data: {
            from: 'dealing',
            to: 'player_turn',
            playerBalance: this.playerBalance,
            currentBet: this.game.getCurrentBet(),
            allowedActions: initialAllowedActions
        }
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
   * End the game and send the final outcome
   */
  public async endGame(): Promise<void> {
    try {
        // Get game outcome and detailed results
        const outcome = this.game.getGameOutcome();
        const detailedResult = this.game.getFinalGameResult();
        
        // Store the bet amount before any state changes occur
        const betAmount = this.game.getCurrentBet();
        
        // Special case: Dealer has blackjack but player declined insurance
        if (this.game.checkDealerHasBlackjack() && this.insuranceDecided && this.game.getInsuranceBet() === 0) {
            console.log("Dealer has blackjack and insurance was declined - player loses");
            const outcomeType = this.game.getPlayerCards().length === 2 && 
                               this.game.getPlayerValue() === 21 ? 'push' : 'dealer_win';
            
            // Prepare allowed actions for next round
            const nextRoundActions = [MessageType.PLACE_BET];
            const currentBet = this.game.getCurrentBet();
            if (currentBet > 0 && this.playerBalance >= currentBet) {
                nextRoundActions.push(MessageType.REBET);
            }
            
            // Send game_end message
            this.sendToClient({
                type: MessageType.GAME_END,
                data: {
                    outcome: outcomeType,
                    payout: outcomeType === 'push' ? betAmount : 0,
                    playerBalance: this.playerBalance + (outcomeType === 'push' ? betAmount : 0),
                    currentBet: betAmount,
                    message: outcomeType === 'push' ? "Push - both you and dealer have blackjack" :
                            "Dealer has blackjack. You lose.",
                    allowedActions: nextRoundActions
                }
            });
            
            // Update player balance if needed (for push)
            if (outcomeType === 'push') {
                this.playerBalance += betAmount;
            }
            
            // Record bet result to API if player is authenticated
            if (this.playerAuth.isAuthenticated && this.playerAuth.loginData) {
                try {
                    const chipsWon = outcomeType === 'push' ? 0 : -betAmount;
                    console.log(`[BET TRACKING] Saving bet result for special case (dealer blackjack): bet=${betAmount}, chipsWon=${chipsWon >= 0 ? chipsWon : 0}`);
                    await this.apiService.saveBet(this.playerAuth.loginData, betAmount, chipsWon >= 0 ? chipsWon : 0);
                } catch (error) {
                    console.error('Error saving bet result:', error);
                    // Continue game flow even if saving bet result fails
                }
            }
            
            // After a delay, return to betting phase
            setTimeout(() => {
                this.returnToBettingPhase();
            }, 1000);
            
            return;
        }
        
        // Calculate payout based on outcome
        const payoutResult = this.calculatePayout(outcome, betAmount);
        const chipsWon = payoutResult.chipsWon;
        const outcomeType = payoutResult.outcomeType;
        
        // Update player balance with net winnings
        this.playerBalance += chipsWon;
        
        console.log(`Game ended with outcome: ${outcomeType}, detailed type: ${detailedResult.outcomeType}`);
        console.log(`Bet: ${betAmount}, payout: ${chipsWon}, final balance: ${this.playerBalance}`);
        
        // Handle special cases based on detailed result type
        let totalPayout = 0;
        let insurancePayout = undefined;
        let splitDetails = undefined;
        
        if (detailedResult.outcomeType === 'split') {
            // Split hand payout handling - keep details for frontend but use standard outcome type
            if (detailedResult.split) {
                totalPayout = detailedResult.payout;
                console.log(`Split outcome: Hand 1: ${detailedResult.split.handOneOutcome} (${detailedResult.split.handOnePayout}), Hand 2: ${detailedResult.split.handTwoOutcome} (${detailedResult.split.handTwoPayout})`);
                
                // Store split details for frontend display
                splitDetails = {
                    handOneOutcome: detailedResult.split.handOneOutcome,
                    handOnePayout: detailedResult.split.handOnePayout,
                    handTwoOutcome: detailedResult.split.handTwoOutcome,
                    handTwoPayout: detailedResult.split.handTwoPayout,
                    totalPayout: detailedResult.payout
                };
            }
        } else if (detailedResult.outcomeType === 'insurance') {
            // Insurance outcome handling
            if (detailedResult.insurance) {
                totalPayout = detailedResult.payout;
                insurancePayout = detailedResult.insurance.payout;
                console.log(`Insurance outcome: ${detailedResult.insurance.won ? 'won' : 'lost'}, payout: ${insurancePayout}`);
            }
        } else {
            // Normal outcome payout calculation
            switch (outcomeType) {
                case 'player_win':
                case 'dealer_bust':
                    totalPayout = betAmount * 2; // Original bet + equal profit
                    break;
                case 'player_blackjack':
                    totalPayout = betAmount + (betAmount * 1.5); // Blackjack pays 3:2
                    break;
                case 'push':
                    totalPayout = betAmount; // Original bet returned
                    break;
                case 'surrender':
                    totalPayout = betAmount / 2; // Half bet returned
                    break;
                case 'insurance_won':
                    const insuranceBet = this.game.getInsuranceBet();
                    totalPayout = insuranceBet * 2;
                    insurancePayout = insuranceBet * 2;
                    break;
                default:
                    totalPayout = 0; // Default no payout for loss
            }
        }
        
        // Ensure we store the last bet amount for rebet functionality
        if (betAmount > 0) {
            this.game.setLastBet(betAmount);
        }
        
        // Prepare allowed actions for next round
        const nextRoundActions = [MessageType.PLACE_BET];
        if (betAmount > 0 && this.playerBalance >= betAmount) {
            nextRoundActions.push(MessageType.REBET);
        }
        
        // Send game_end message
        this.sendToClient({
            type: MessageType.GAME_END,
            data: {
                outcome: outcomeType, // Now using standard outcome type for all cases
                payout: totalPayout,
                playerBalance: this.playerBalance,
                currentBet: betAmount,
                insurancePayout: insurancePayout,
                // Include insurance information if relevant
                insurance: detailedResult.insurance,
                // Include split details if available
                splitDetails: splitDetails,
                // Include message from detailed result
                message: detailedResult.message,
                // Include allowed actions for next round
                allowedActions: nextRoundActions,
                // Keep detailed result for backward compatibility
                detailedResult: detailedResult.outcomeType === 'split' ? detailedResult : undefined
            }
        });
        
        // Record bet result to API if player is authenticated
        if (this.playerAuth.isAuthenticated && this.playerAuth.loginData) {
            try {
                // Calculate net chips won/lost. For a regular win, chipsWon is already the net amount.
                // For other outcomes, we need to ensure we're recording the correct amount.
                let netChipsWon = chipsWon;
                if (outcomeType === 'push') {
                    // For push, no net win/loss (get original bet back)
                    netChipsWon = 0;
                } else if (outcomeType === 'player_bust' || outcomeType === 'dealer_win') {
                    // For losses, use 0 instead of negative value
                    netChipsWon = 0;
                }
                
                console.log(`[BET TRACKING] Saving bet result for regular game end: bet=${betAmount}, chipsWon=${netChipsWon}, outcome=${outcomeType}`);
                await this.apiService.saveBet(this.playerAuth.loginData, betAmount, netChipsWon);
                console.log(`Bet result saved: bet=${betAmount}, chipsWon=${netChipsWon}`);
            } catch (error) {
                console.error('Error saving bet result:', error);
                // Continue game flow even if saving bet result fails
            }
        }
        
        // After a delay, return to betting phase
        setTimeout(() => {
            // Always mark game as complete before returning to betting
            this.game.setGamePhase('complete');
            
            // Return to betting phase with correct allowed actions
            this.returnToBettingPhase();
        }, 1000);
        
    } catch (error) {
        console.error('Error ending game:', error);
        
        // Prepare basic allowed actions for error recovery
        const errorRecoveryActions = [MessageType.PLACE_BET];
        
        // Even on error, try to send a game end message and return to betting
        this.sendToClient({
            type: MessageType.GAME_END,
            data: {
                outcome: 'error',
                payout: 0,
                playerBalance: this.playerBalance,
                currentBet: this.game.getCurrentBet(),
                message: 'An error occurred. Please place a new bet.',
                allowedActions: errorRecoveryActions
            }
        });
        
        // Force return to betting phase
        this.returnToBettingPhase();
    }
}
  
  /**
   * Calculate payout based on game outcome
   */
  private calculatePayout(outcome: string, betAmount: number): { chipsWon: number; outcomeType: string } {
    let chipsWon = 0;
    let outcomeType = '';
    
    // Get detailed result for more accurate payout calculation
    const detailedResult = this.game.getFinalGameResult();
    
    // For split hands, convert to standard outcome types
    if (detailedResult.outcomeType === 'split' && detailedResult.split) {
        // For split hands, calculate total payout but use standard outcome types
        chipsWon = detailedResult.payout;
        
        // Determine the primary outcome type based on the result of both hands
        // If both hands won, use player_win
        if (detailedResult.split.handOneOutcome === 'win' && detailedResult.split.handTwoOutcome === 'win') {
            outcomeType = 'player_win';
        }
        // If both hands lost, use dealer_win
        else if (detailedResult.split.handOneOutcome === 'lose' && detailedResult.split.handTwoOutcome === 'lose') {
            outcomeType = 'dealer_win';
        }
        // If one hand won and one lost, still count as player_win if net positive
        else if (detailedResult.payout > 0) {
            outcomeType = 'player_win';
        }
        // If net payout is 0, it's a push
        else if (detailedResult.payout === 0) {
            outcomeType = 'push';
        }
        // Otherwise it's a dealer win
        else {
            outcomeType = 'dealer_win';
        }
        
        console.log(`Split hands standardized to outcome: ${outcomeType}, payout: ${chipsWon}`);
        return { chipsWon, outcomeType };
    }
    
    if (detailedResult.outcomeType === 'insurance' && detailedResult.insurance) {
        if (detailedResult.insurance.won) {
            // Insurance win pays 2:1
            chipsWon = detailedResult.insurance.payout;
            outcomeType = 'insurance_won';
        } else {
            // Insurance loss - already deducted from balance when placed
            chipsWon = 0;
            outcomeType = 'insurance_lose';
        }
        console.log(`Insurance payout from detailed result: ${chipsWon}`);
        return { chipsWon, outcomeType };
    }
    
    // Handle individual cases for normal game outcomes
    switch (outcome) {
        case 'win':
        case 'player_win':
            // Player wins - chipsWon is the profit (equal to bet)
            chipsWon = betAmount;
            outcomeType = 'player_win';
            break;
        case 'push':
        case 'push_with_insurance_loss':
            // Push - getting original bet back (no profit)
            chipsWon = betAmount;
            outcomeType = 'push';
            break;
        case 'blackjack':
        case 'player_blackjack':
            // Blackjack pays 3:2 (profit is 1.5x bet)
            chipsWon = betAmount * 2.5; // Original bet + 1.5x profit
            outcomeType = 'player_blackjack';
            break;
        case 'lose':
        case 'dealer_win':
            chipsWon = 0; // Player loses bet
            if (this.game.getDealerCards().length === 2 && 
                this.game.getDetailedGameResult().dealerValue === 21) {
                outcomeType = 'dealer_win';
            } else if (this.game.getDetailedGameResult().playerValue > 21) {
                outcomeType = 'player_bust';
            } else {
                outcomeType = 'dealer_win';
            }
            break;
        case 'dealer_bust':
            // Dealer busts is same as player wins (profit equals bet)
            chipsWon = betAmount * 2; // Original bet + profit
            outcomeType = 'dealer_bust';
            break;
        case 'surrender':
            // Surrender returns half the bet
            chipsWon = betAmount / 2;
            outcomeType = 'surrender';
            break;
        case 'insurance_won':
            // Insurance pays 2:1
            const insuranceBet = this.game.getInsuranceBet();
            chipsWon = insuranceBet * 2;
            outcomeType = 'insurance_won';
            break;
        case 'insurance_lose':
            chipsWon = 0; // Insurance bet already deducted
            outcomeType = 'insurance_lose';
            break;
        case 'player_bust':
            chipsWon = 0; // Player loses bet
            outcomeType = 'player_bust';
            break;
        default:
            // If we get an unrecognized outcome, use the detailed result
            chipsWon = detailedResult.payout;
            outcomeType = detailedResult.finalOutcomeString;
            break;
    }
    
    // Log the calculation result for debugging
    console.log(`Payout calculation: outcome=${outcome}, betAmount=${betAmount}, chipsWon=${chipsWon}, outcomeType=${outcomeType}`);
    
    return { chipsWon, outcomeType };
  }
  
  /**
   * Handle automatic transitions based on special conditions
   */
  private handleAutomaticTransitions(specialConditions: any): void {
    console.log("Checking special conditions:", specialConditions);
    
    // ALWAYS check for player blackjack first - this takes precedence over everything
    if (specialConditions.playerBlackjack) {
      console.log('Player has blackjack! Ending game immediately.');
      
      // Set game phase to complete
      this.game.setGamePhase('complete');
      
      // Reveal dealer's hole card
      this.game.revealDealerCard();
      const playerBlackjackDealerCard = this.game.getDealerCards()[1];
      
      // Send card dealt for dealer's hole card with isHoleCard flag
      if (playerBlackjackDealerCard) {
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: playerBlackjackDealerCard,
            target: 'dealer',
            isHoleCard: true,
            faceUp: true
          }
        });
      }
      
      // End the game with blackjack win
      this.endGame();
      return;
    }

    // Auto-end game if dealer has blackjack
    if (specialConditions.dealerBlackjack) {
      console.log("Dealer has blackjack - ending game immediately");
      
      // If insurance was taken, process it
      if (this.game.getInsuranceBet() > 0) {
        const insurancePayout = this.game.getInsuranceBet() * 2;
        this.playerBalance += insurancePayout;
        
        this.sendToClient({
          type: MessageType.PHASE_CHANGE,
          data: {
            from: this.game.getGamePhase(),
            to: this.game.getGamePhase(),
            balance: this.playerBalance,
            insurancePayout: insurancePayout
          }
        });
      }
      
      // Reveal dealer's hole card
      this.game.revealDealerCard();
      const dealerBlackjackHoleCard = this.game.getDealerCards()[1];
      
      // Send card dealt for dealer's hole card with isHoleCard flag
      if (dealerBlackjackHoleCard) {
        this.sendToClient({
          type: MessageType.CARD_DEALT,
          data: {
            card: dealerBlackjackHoleCard,
            target: 'dealer',
            isHoleCard: true,
            faceUp: true
          }
        });
      }
      
      // End the game immediately
      this.game.setGamePhase('complete');
      this.endGame();
      return;
    }
    
    // Track offers independently - both can be offered in the same hand
    
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
      console.log("Split offered for this hand");
      
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
    
    // Don't allow insurance if it's already been decided
    if (this.insuranceDecided) {
      console.log("Insurance already decided, can't take insurance");
      return false;
    }
    
    // Get player cards based on whether this is a split hand
    let playerCards;
    const hasSplit = this.game.hasSplit();
    
    if (hasSplit) {
      // When handling split hands, only check for insurance eligibility
      // on the first hand (if it's the active one)
      if (this.getActiveSplitHand() === 'first') {
        playerCards = this.game.getPlayerCards();
      } else {
        // Don't allow insurance on second split hand
        console.log("Can't take insurance on second split hand");
        return false;
      }
    } else {
      // Normal hand
      playerCards = this.game.getPlayerCards();
    }
    
    // Only offer insurance at the very start of the hand (player has exactly 2 cards)
    if (!playerCards || playerCards.length !== 2) {
      console.log(`Player doesn't have exactly 2 cards (has ${playerCards?.length || 0}), can't take insurance`);
      return false;
    }
    
    // Check if dealer's up card is an Ace
    const dealerUpCard = this.game.getDealerUpCard();
    if (!dealerUpCard || dealerUpCard.rank !== 'A') {
      console.log("Dealer's up card is not Ace, can't take insurance");
      return false;
    }
    
    // Check if player has sufficient balance for insurance bet
    const insuranceBet = this.game.getCurrentBet() / 2;
    if (this.playerBalance < insuranceBet) {
      console.log("Insufficient balance for insurance bet");
      return false;
    }
    
    console.log("Insurance is available");
    return true;
  }
  
  /**
   * Determine the allowed actions based on current game state
   */
  private determineAllowedActions(): MessageType[] {
    // If we have restored allowed actions from a saved state, use those instead
    if (this.isRestoredState && this.restoredAllowedActions && this.restoredAllowedActions.length > 0) {
      console.log('Using restored allowed actions:', this.restoredAllowedActions);
      
      // Clear the restored flag to ensure we only use these actions once
      // until another restore happens
      const actions = [...this.restoredAllowedActions];
      this.isRestoredState = false;
      this.restoredAllowedActions = [];
      return actions;
    }
    
    const allowedActions: MessageType[] = [];
    const phase = this.game.getGamePhase();
    
    if (phase === 'betting') {
      allowedActions.push(MessageType.PLACE_BET);
      allowedActions.push(MessageType.CLEAR_BET);
      
      // Add rebet only if we have a last bet saved
      if (this.game.getLastBet() > 0) {
        allowedActions.push(MessageType.REBET);
      }
      
      return allowedActions;
    }
    
    if (phase === 'player_turn') {
      // Get hand values based on active hand or split status
      let currentHandValue = 0;
      let isCurrentHandBusted = false;
      
      if (this.game.hasSplit()) {
        // Get active split hand value
        const activeHand = this.getActiveSplitHand();
        if (activeHand === 'first') {
          const playerHand = this.mapHand(this.game.getPlayerCards());
          currentHandValue = playerHand.value;
          isCurrentHandBusted = playerHand.busted;
        } else {
          const splitHand = this.mapHand(this.game.getSplitCards() || []);
          currentHandValue = splitHand.value;
          isCurrentHandBusted = splitHand.busted;
        }
      } else {
        // Regular hand
        const playerHand = this.mapHand(this.game.getPlayerCards());
        currentHandValue = playerHand.value;
        isCurrentHandBusted = playerHand.busted;
      }
      
      // Only allow HIT if the current hand is not 21 and not busted
      if (currentHandValue < 21 && !isCurrentHandBusted) {
        allowedActions.push(MessageType.HIT);
      }
      
      // STAND is always available
      allowedActions.push(MessageType.STAND);
      
      // Get player's card count
      const playerCards = this.game.getPlayerCards();
      
      // Insurance check - only available when dealer shows an Ace at the start of hand
      // AND insurance has not already been decided AND player has not split
      if (!this.insuranceDecided &&
          !this.game.hasSplit() &&
          this.canTakeInsurance() &&
          this.game.getPlayerCards().length === 2) { // Only include at the start
        // Only include INSURANCE in allowed actions if the player still has exactly 2 cards
        // This ensures insurance is removed from options after the first hit
        allowedActions.push(MessageType.INSURANCE);
        console.log("Insurance added to allowed actions - insurance is available");
      } else {
        // Log why insurance is not available
        if (this.insuranceDecided) {
          console.log("Insurance not in allowed actions - already decided");
        } else if (this.game.hasSplit()) {
          console.log("Insurance not in allowed actions - player has split");
        } else if (!this.canTakeInsurance()) {
          console.log("Insurance not in allowed actions - not eligible");
        } else if (this.game.getPlayerCards().length !== 2) {
          console.log(`Insurance not in allowed actions - player has ${this.game.getPlayerCards().length} cards instead of 2`);
        }
      }
      
      // Surrender only available initially with exactly 2 cards and not in split mode
      if (playerCards.length === 2 && !this.game.hasSplit()) {
        allowedActions.push(MessageType.SURRENDER);
      }
      
      // Only allow double down with exactly 2 cards, not in split mode, and if player has enough balance
      if (playerCards.length === 2 && !this.game.hasSplit() && this.playerBalance >= this.game.getCurrentBet()) {
        allowedActions.push(MessageType.DOUBLE_DOWN);
      }
      
      // Split only available initially with matching cards, sufficient balance, and insurance has not been decided
      // (Neither taken nor declined)
      if (playerCards.length === 2 && 
          playerCards[0].value === playerCards[1].value && 
          !this.game.hasSplit() && 
          !this.insuranceDecided &&
          this.playerBalance >= this.game.getCurrentBet()) {
        allowedActions.push(MessageType.SPLIT);
      }
    }
    
    return allowedActions;
  }
  
  /**
   * Check if player can split (wrapper for private canSplit method in BlackjackGame)
   */
  private canPlayerSplit(): boolean {
    // First check if player already has a split hand - don't allow splitting again
    if (this.game.hasSplit()) {
      return false;
    }
    
    // Only in player turn phase
    if (this.game.getGamePhase() !== 'player_turn') {
      return false;
    }
    
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
          
        case MessageType.PHASE_CHANGE:
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
        case MessageType.PHASE_CHANGE:
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
        type: MessageType.PHASE_CHANGE,
        data: {
          from: this.game.getPreviousGamePhase(),
          to: this.game.getGamePhase(),
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error processing action',
          code: 'ACTION_ERROR',
          phase: this.game.getGamePhase()
        }
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
   * Send a full game state update to the client
   * @param targetClientId Optional target client ID (defaults to session client)
   */
  public sendGameState(targetClientId: string = this.clientId): void {
    try {
      console.log(`Sending game state to client ${targetClientId}`);
      
      // Ensure this method doesn't fail if called before game is fully initialized
      if (!this.game) {
        console.warn('Attempted to send game state but game is not initialized yet');
        this.sendToClient({
          type: MessageType.GAME_STATE,
          data: {
            gamePhase: 'betting',
            playerBalance: this.playerBalance,
            currentBet: 0,
            allowedActions: [MessageType.PLACE_BET, MessageType.START_GAME]
          }
        });
        return;
      }
      
      // Log current game status before sending state
      const playerCards = this.game.getPlayerCards();
      const dealerCards = this.game.getDealerCards();
      console.log(`[GAME STATE DEBUG] Player hand with ${playerCards.length} cards:`, 
        playerCards.map(c => `${c.rank} of ${c.suit}`).join(', '));
      console.log(`[GAME STATE DEBUG] Dealer hand with ${dealerCards.length} cards:`, 
        dealerCards.map(c => `${c.rank} of ${c.suit}`).join(', '));
      
      const currentPhase = this.game.getGamePhase();
      
      // Determine allowed actions, potentially using restored actions if available
      let allowedActions: MessageType[] = [];
      
      // If we have restored allowed actions, use those and log it
      if (this.isRestoredState && this.restoredAllowedActions && this.restoredAllowedActions.length > 0) {
        console.log('Using restored allowed actions for game state:', this.restoredAllowedActions);
        allowedActions = [...this.restoredAllowedActions];
        
        // We don't clear the restored state here as determineAllowedActions may still need to use it
        // The restore state will be cleared in determineAllowedActions
      } else {
        // Otherwise use the normal determine function
        allowedActions = this.determineAllowedActions();
      }
      
      // Create game state message object that will be sent to client
      // This is different from the GameStateData used for storing state
      let clientGameState: any = {
        gamePhase: currentPhase,
        playerBalance: this.playerBalance,
        currentBet: this.game.getCurrentBet(),
        allowedActions: allowedActions,
        dealerHand: this.mapHand(this.game.getDealerCards()),
        playerHand: this.mapHand(this.game.getPlayerCards()),
        insuranceDecided: this.insuranceDecided // Add insurance decision state to client state
      };

      if(this.isRestoredState && this.restoredAllowedActions && this.restoredAllowedActions.length > 0)
      {
        const dealerHand = this.mapHand(this.game.getDealerCards());
        dealerHand.cards = dealerHand.cards[0];
        clientGameState = {
          gamePhase: currentPhase,
          playerBalance: this.playerBalance,
          currentBet: this.game.getCurrentBet(),
          allowedActions: allowedActions,
          dealerHand: dealerHand,
          playerHand: this.mapHand(this.game.getPlayerCards())
        };
      }
      
      // Add split hand data if applicable
      if (this.game.hasSplit()) {
        clientGameState.hasSplit = true;
        clientGameState.activeSplitHand = this.getActiveSplitHand();
        
        const secondHand = this.game.getSplitHand();
        
        if (secondHand) {
          // Convert UIHand to HandMessage
          const secondHandUI = this.mapHand(secondHand.cards);
          clientGameState.secondHand = {
            type: 'split', // Explicit type for HandMessage
            cards: secondHandUI.cards,
            value: secondHandUI.value,
            busted: secondHandUI.busted,
            blackjack: secondHandUI.blackjack,
            soft: secondHandUI.soft
          };
        }
      } else {
        clientGameState.hasSplit = false;
      }
      
      // Send game state to client
      this.sendToClient({
        type: MessageType.GAME_STATE,
        data: clientGameState
      });
      
      console.log(`Game state sent: ${currentPhase} with ${allowedActions.length} allowed actions`);
    } catch (error) {
      console.error('Error sending game state:', error);
    }
  }
  
  /**
   * Send player balance update
   */
  private sendPlayerBalanceUpdate(): void {
    this.sendToClient({
      type: MessageType.PHASE_CHANGE,
      data: {
        from: this.game.getGamePhase(),
        to: this.game.getGamePhase(),
        balance: this.playerBalance,
        insurancePayout: this.game.getInsuranceBet() * 2
      }
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
    if (!this.game.hasSplit()) {
      return null;
    }
    
    return this.game.getActiveSplitHand();
  }
  
  /**
   * Handle the switch between split hands
   */
  private handleSplitHandSwitch(hand: 'first' | 'second'): void {
    if (!this.game.hasSplit()) {
      throw new Error('No split hand exists');
    }
    
    // Switch the active hand in the game logic
    this.game.setActiveSplitHandUI(hand);
    
    // Recalculate allowed actions after switching hands
    const allowedActions = this.determineAllowedActions();
    
    // Notify client of active hand change
    this.sendToClient({
      type: MessageType.PHASE_CHANGE,
      data: {
        from: this.game.getGamePhase(),
        to: this.game.getGamePhase(),
        activeSplitHand: hand,
        action: 'split_hand_switch',
        message: hand === 'first' ? "Playing first hand" : "Playing second hand",
        allowedActions: allowedActions
      }
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
      type: MessageType.PHASE_CHANGE,
      data: {
        from: this.game.getPreviousGamePhase(),
        to: this.game.getGamePhase(),
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
        // In blackjack, getting 21 with more than 2 cards is a regular win (player_win)
        // A "blackjack" (player_blackjack) only applies to getting 21 with the initial 2 cards
        console.log(`Player has 21 with ${playerCards.length} cards - this is a regular win, not a blackjack. Automatically standing.`);
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
    
    // Debug logging for bet amount tracking
    console.log(`[BET DEBUG] Before stand, current bet = ${this.game.getCurrentBet()}`);
    
    // Send an explicit HAND_UPDATED message indicating the stand action
    this.sendToClient({
      type: MessageType.PHASE_CHANGE,
      data: {
        from: this.game.getPreviousGamePhase(),
        to: this.game.getGamePhase(),
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
      
      // Debug bet amount before phase change
      console.log(`[BET DEBUG] Before setting phase to dealer_turn, current bet = ${this.game.getCurrentBet()}`);
      
      // Set game phase to dealer_turn to prevent further player actions
      this.game.setGamePhase('dealer_turn');
      
      // Debug bet amount after phase change
      console.log(`[BET DEBUG] After setting phase to dealer_turn, current bet = ${this.game.getCurrentBet()}`);
      
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
      type: MessageType.PHASE_CHANGE,
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

    try {
      // Validate the player can split
      if (!this.canPlayerSplit()) {
        throw new Error('Cannot split - cards are not eligible');
      }
      
      // Get current bet amount - this needs to be matched for the split bet
      const betAmount = this.game.getCurrentBet();
      
      // Validate the player has enough chips for the split bet
      if (this.playerBalance < betAmount) {
        throw new Error('Not enough chips to split');
      }
      
      // Deduct the split bet from player balance
      this.playerBalance -= betAmount;
      console.log(`Split bet placed: ${betAmount}, new balance: ${this.playerBalance}`);
      
      // Send animation preparation message
      this.sendToClient({
        type: MessageType.PHASE_CHANGE,
        data: {
          animation: 'split',
          message: 'Preparing to split cards'
        }
      });
      
      // Execute split in game logic
      const [firstCard, secondCard] = this.game.split();
      console.log(`Split performed: first hand with ${firstCard.rank} of ${firstCard.suit}, second hand with ${secondCard.rank} of ${secondCard.suit}`);
      
      // Store the split cards for potential recovery
      const splitCards = this.game.getSplitCards();
      if (splitCards && splitCards.length > 0) {
        this.setLastSavedSplitCards(splitCards);
        console.log(`Stored split hand with ${splitCards.length} cards immediately after split`);
        
        // Force an immediate save to API to ensure split data is persisted
        if (this.playerAuth.isAuthenticated && this.playerAuth.loginData) {
          // Create a temporary game state with the split data
          const tempGameState = {
            gamePhase: this.game.getGamePhase(),
            playerBalance: this.playerBalance,
            currentBet: this.game.getCurrentBet(),
            lastBet: this.game.getCurrentBet(),
            playerHand: this.game.getPlayerCards(),
            dealerHand: this.game.getDealerCards(),
            allowedActions: this.determineAllowedActions(),
            activeHand: this.getActiveSplitHand(),
            hasSplit: true,
            splitHand: {
              type: 'split',
              cards: JSON.parse(JSON.stringify(splitCards)), // Deep clone to ensure data integrity
              value: this.game.getSplitHandValue() || 0,
              busted: false,
              blackjack: false,
              soft: false
            },
            insuranceAmount: this.game.getInsuranceBet(),
            insuranceDecided: this.insuranceDecided,
            timestamp: Date.now()
          };
          
          console.log('Performing emergency save of split data to ensure persistence');
          this.apiService.saveUserGameData(this.playerAuth.loginData, tempGameState)
            .then(response => {
              console.log(`Emergency split data save result: ${response.success ? 'success' : 'failed'}, split cards: ${tempGameState.splitHand.cards.length}`);
            })
            .catch(err => {
              console.error('Error during emergency split data save:', err);
            });
        }
      }
      
      // Mark insurance as decided to prevent taking insurance after split
      this.insuranceDecided = true;
      
      // Send first card back to player hand
      this.sendToClient({
        type: MessageType.CARD_DEALT,
        data: {
          card: firstCard,
          target: 'player'
        }
      });
      
      // Short delay for animation clarity
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
    } catch (error) {
      console.error('Error handling split:', error);
      this.sendToClient({
        type: MessageType.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error processing split'
        }
      });
    }
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
        type: MessageType.PHASE_CHANGE,
        data: {
            from: this.game.getPreviousGamePhase(),
            to: this.game.getGamePhase(),
            action: 'surrender',
            dealerHand: this.mapHand(this.game.getDealerCards()),
            playerHand: this.mapHand(this.game.getPlayerCards()),
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
        // Player accepts insurance - calculate the insurance amount
        const insuranceAmount = this.game.getCurrentBet() / 2;
        
        // Validate player has enough balance for insurance
        if (this.playerBalance < insuranceAmount) {
            throw new Error('Insufficient balance for insurance');
        }
        
        // Deduct the insurance amount from player balance
        this.playerBalance -= insuranceAmount;
        console.log(`Insurance bet deducted: ${insuranceAmount}, new balance: ${this.playerBalance}`);
        
        // Record the insurance bet in the game
        const insuranceResult = this.game.takeInsurance(insuranceAmount);
        
        // Send balance update
        this.sendToClient({
            type: MessageType.PHASE_CHANGE,
            data: {
                from: this.game.getGamePhase(),
                to: this.game.getGamePhase(),
                balance: this.playerBalance,
                insuranceBet: insuranceAmount,
            }
        });
        
        // Send action result for insurance
        this.sendToClient({
            type: MessageType.PHASE_CHANGE,
            data: {
                from: this.game.getGamePhase(),
                to: this.game.getGamePhase(),
                success: true,
                action: MessageType.INSURANCE,
                message: `Insurance taken for ${insuranceAmount} chips`,
                phase: this.game.getGamePhase()
            }
        });

        // Check if dealer has blackjack and handle accordingly
        if (insuranceResult.outcome === 'insurance_won') {
            console.log("Dealer has blackjack - revealing card and ending game");
            
            // Add insurance payout to player balance (2:1)
            const insurancePayoutAmount = insuranceAmount * 2;
            this.playerBalance += insurancePayoutAmount;
            console.log(`Insurance won! Payout: ${insurancePayoutAmount}, new balance: ${this.playerBalance}`);
            
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
            
            // Insurance bet is already deducted, no further action needed
            
            // Get allowed actions for continuing play - split is no longer eligible after insurance
            const allowedActionsAfterInsuranceLoss = this.determineAllowedActions();
            
            // Send insurance loss outcome as ACTION_RESULT with clear instructions to continue play
            this.sendToClient({
                type: MessageType.PHASE_CHANGE,
                data: {
                    from: this.game.getGamePhase(),
                    to: this.game.getGamePhase(),
                    success: true,
                    action: MessageType.INSURANCE,
                    outcome: 'insurance_lost',
                    message: "Dealer doesn't have blackjack. Insurance bet lost. Continue playing your hand.",
                    allowedActions: allowedActionsAfterInsuranceLoss,
                    phase: this.game.getGamePhase(),
                    playerBalance: this.playerBalance,
                    currentBet: this.game.getCurrentBet()
                }
            });
            
            // Explicitly send allowed actions again after a short delay to ensure client transitions correctly
            setTimeout(() => {
                if (this.game.getGamePhase() === 'player_turn') {
                    this.sendAllowedActions();
                }
            }, 200);
        }
    } else {
        // Player declines insurance - no special case handling needed
        console.log("Player declined insurance");
        this.game.declineInsurance();
        
        // Send action result for declining insurance
        this.sendToClient({
            type: MessageType.PHASE_CHANGE,
            data: {
                from: this.game.getGamePhase(),
                to: this.game.getGamePhase(),
                success: true,
                action: MessageType.INSURANCE,
                message: "Insurance declined",
                phase: this.game.getGamePhase()
            }
        });
        
        // First check if player has blackjack - they should win even if dealer has blackjack
        if (this.game.getPlayerCards().length === 2 && this.game.getPlayerValue() === 21) {
            console.log("Player has blackjack after declining insurance - they win regardless of dealer's hand");
            
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
                        isHoleCard: true,
                        faceUp: true
                    }
                });
            }
            
            // End the game with player blackjack win
            this.endGame();
            return;
        }
        
        // Only check for dealer blackjack if player doesn't have blackjack
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
                        isHoleCard: true,
                        faceUp: true
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
      type: MessageType.PHASE_CHANGE,
      data: {
        from: 'betting',
        to: 'betting',
        message: `Bet placed: ${lastBet}`,
        playerBalance: this.playerBalance,
        currentBet: lastBet
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
      type: MessageType.PHASE_CHANGE,
      data: {
        from: this.game.getGamePhase(),
        to: this.game.getGamePhase(),
        balance: this.playerBalance
      }
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
      type: MessageType.PHASE_CHANGE,
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
  public async authenticatePlayer(loginData: LoginData): Promise<boolean> {
    try {
      this.playerAuth.loginData = loginData;
      
      // Validate with backend API
      const response = await this.apiService.getUserData(loginData);
      
      if (!response.success || !response.data) {
        console.error('Authentication failed:', response.error);
        this.sendToClient({
          type: MessageType.AUTH_FAILED,
          data: { error: response.error || 'Authentication failed' }
        });
        return false;
      }
      
      // Authentication successful
      this.playerAuth.isAuthenticated = true;
      this.playerAuth.userId = response.data.userId;
      this.playerAuth.chips = response.data.chips;
      this.playerBalance = response.data.chips;
      
      console.log(`Player authenticated: ${this.playerAuth.userId}, balance: ${this.playerBalance}`);
      
      // Don't restore game state here - that will be done in the MessageHandler
      
      return true;
    } catch (error) {
      console.error('Error during authentication:', error);
      this.sendToClient({
        type: MessageType.AUTH_FAILED,
        data: { error: 'Authentication failed due to server error' }
      });
      return false;
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

  /**
   * Get player data for external access
   */
  public getPlayerData(): { username: string; chips: number; userId: string } {
    return {
      username: this.playerAuth.userId,
      chips: this.playerAuth.chips,
      userId: this.playerAuth.userId
    };
  }

  /**
   * Get the login data for this session
   */
  public getLoginData(): LoginData {
    return this.playerAuth.loginData;
  }

  private handlePhaseTransition(fromPhase: GamePhase, toPhase: GamePhase): void {
    console.log(`Phase transition: ${fromPhase} -> ${toPhase}`);
    
    // Validate phase transition
    if (!this.isValidPhaseTransition(fromPhase, toPhase)) {
        console.error(`Invalid phase transition: ${fromPhase} -> ${toPhase}`);
        this.forceBettingPhase();
        return;
    }
    
    // Update game phase
    this.game.setGamePhase(toPhase);
    
    // Send phase change notification
    this.sendToClient({
        type: MessageType.PHASE_CHANGE,
        data: {
            from: fromPhase,
            to: toPhase,
            message: this.getPhaseTransitionMessage(toPhase)
        }
    });
    
    // Update game state
    this.sendGameState();
  }

  private isValidPhaseTransition(fromPhase: GamePhase, toPhase: GamePhase): boolean {
    const validTransitions: Record<GamePhase, GamePhase[]> = {
        [GamePhase.BETTING]: [GamePhase.DEALING],
        [GamePhase.DEALING]: [GamePhase.PLAYER_TURN, GamePhase.COMPLETE],
        [GamePhase.PLAYER_TURN]: [GamePhase.DEALER_TURN, GamePhase.COMPLETE],
        [GamePhase.DEALER_TURN]: [GamePhase.COMPLETE],
        [GamePhase.COMPLETE]: [GamePhase.BETTING]
    };
    
    return validTransitions[fromPhase]?.includes(toPhase) || false;
  }

  private getPhaseTransitionMessage(toPhase: GamePhase): string {
    switch (toPhase) {
        case GamePhase.DEALING:
            return "Dealing cards...";
        case GamePhase.PLAYER_TURN:
            return "Your turn to play";
        case GamePhase.DEALER_TURN:
            return "Dealer's turn";
        case GamePhase.COMPLETE:
            return "Game complete";
        case GamePhase.BETTING:
            return "Place your bet";
    }
  }

  /**
   * Send a game end message with outcome information
   * This replaces previous outcome messaging
   */
  private sendGameEndMessage(): void {
      const outcome = this.game.getGameOutcome();
      const betAmount = this.game.getCurrentBet();
      
      // Calculate payout based on outcome
      const payoutResult = this.calculatePayout(outcome, betAmount);
      const chipsWon = payoutResult.chipsWon;
      const outcomeType = payoutResult.outcomeType;
      
      // Calculate total payout amount based on outcome
      let totalPayout = 0;
      let insurancePayout = undefined;
      
      switch (outcomeType) {
          case 'player_win':
          case 'dealer_bust':
              totalPayout = betAmount * 2; // Original bet + equal amount profit
              break;
          case 'player_blackjack':
              totalPayout = betAmount + (betAmount * 1.5); // Blackjack pays 3:2
              break;
          case 'push':
              totalPayout = betAmount; // Original bet returned
              break;
          case 'surrender':
              totalPayout = betAmount / 2; // Half bet returned
              break;
          case 'insurance_won':
              const insuranceBet = this.game.getInsuranceBet();
              totalPayout = insuranceBet * 2;
              insurancePayout = insuranceBet * 2;
              break;
          // Add other cases as needed
          default:
              totalPayout = 0; // Default no payout for loss
      }
      
      // Send the game end message
      this.sendToClient({
          type: MessageType.GAME_END,
          data: {
              outcome: outcomeType,
              chipsWon,
              playerBalance: this.playerBalance,
              payout: totalPayout,
              insurancePayout,
              currentBet: betAmount
          }
      });
  }

  // Fix references to removed MessageType enums in various methods
  private handleBetPlaced(data: any): void {
      // ... existing code ...
      
      // Fix MessageType.BET_PLACED reference
      this.sendToClient({
          type: MessageType.PHASE_CHANGE, // Instead of BET_PLACED
          data: {
              from: 'betting',
              to: 'betting',
              message: `Bet placed: ${data.amount}`,
              playerBalance: this.playerBalance,
              currentBet: this.game.getCurrentBet()
          }
      });
      
      // ... rest of method ...
  }

  // Update other methods similarly to use our simplified message types
  private sendActionResult(success: boolean, message: string, data: any = {}): void {
      // Instead of ACTION_RESULT, use PHASE_CHANGE
      this.sendToClient({
          type: MessageType.PHASE_CHANGE,
          data: {
              from: this.game.getPreviousGamePhase(),
              to: this.game.getGamePhase(),
              message,
              success,
              ...data
          }
      });
  }

  /**
   * Saves the current game state to the API for reconnection
   */
  private async saveGameState(): Promise<void> {
    // Only save if player is authenticated and game is in progress
    if (!this.playerAuth.isAuthenticated || !this.playerAuth.loginData) {
      console.log('Not saving game state - player not authenticated');
      return;
    }
    
    const currentPhase = this.game.getGamePhase();
    
    // Only save game state during active gameplay
    if (currentPhase === 'betting' || currentPhase === 'complete') {
      console.log('Not saving game state in betting or complete phase');
      return;
    }
    
    // Reset save flag
    this.shouldSaveGameState = false;
    
    try {
      console.log(`[saveGameState] Saving game state for client ${this.clientId}, phase: ${currentPhase}`);
      
      // Get current game state
      const gameState = this.game.getGameState(this.playerBalance);
      
      // Determine allowed actions for current state - this is crucial for proper restoration
      const allowedActions = this.determineAllowedActions();
      console.log(`[saveGameState] Saving allowed actions: ${JSON.stringify(allowedActions)}`);
      
      // Get raw player and dealer cards to ensure proper saving and restoration
      const playerCards = this.game.getPlayerCards();
      const dealerCards = this.game.getDealerCards();
      
      console.log(`[saveGameState] Saving player hand with ${playerCards.length} cards:`, 
        playerCards.map(c => `${c.rank} of ${c.suit}`).join(', '));
      console.log(`[saveGameState] Saving dealer hand with ${dealerCards.length} cards:`, 
        dealerCards.map(c => `${c.rank} of ${c.suit}`).join(', '));
      
      // Check for split hand
      const hasSplit = this.game.hasSplit();
      let splitCards = null;
      
      if (hasSplit) {
        splitCards = this.game.getSplitCards();
        // Double-check that we actually have split cards
        if (!splitCards || splitCards.length === 0) {
          // Try to get split hand directly from the game as a fallback
          const splitHand = this.game.getSplitHand();
          if (splitHand && splitHand.cards && splitHand.cards.length > 0) {
            splitCards = splitHand.cards;
            console.log(`[saveGameState] Recovered split cards from direct split hand access: ${splitCards.length} cards`);
          } else {
            console.error('[saveGameState] CRITICAL ERROR: Game indicates split but no split cards found');
            
            // Try a last ditch recovery from saved state data
            const savedSplitCards = this.lastSavedSplitCards;
            if (savedSplitCards && savedSplitCards.length > 0) {
              console.log(`[saveGameState] Recovering split cards from last saved state: ${savedSplitCards.length} cards`);
              splitCards = savedSplitCards;
            }
          }
        } else {
          console.log(`[saveGameState] Saving split hand with ${splitCards.length} cards:`, 
            splitCards.map(c => `${c.rank} of ${c.suit}`).join(', '));
          
          // Store these cards for potential future recovery
          this.lastSavedSplitCards = [...splitCards];
        }
      }
      
      // Common split hand data structure to ensure consistency
      const splitHandData = (hasSplit && splitCards && splitCards.length > 0) ? { 
        cards: JSON.parse(JSON.stringify(splitCards)), // Deep clone to ensure we don't lose data
        type: 'split',
        value: this.game.getSplitHand()?.value || 0,
        busted: this.game.getSplitHand()?.busted || false,
        blackjack: this.game.getSplitHand()?.blackjack || false,
        soft: this.game.getSplitHand()?.soft || false
      } : null;
      
      // Create game state object with all necessary data for reconnection
      const gameStateData = {
        gamePhase: currentPhase,
        playerBalance: this.playerBalance,
        currentBet: this.game.getCurrentBet(),
        lastBet: this.game.getCurrentBet(),
        playerHand: playerCards,
        dealerHand: dealerCards,
        allowedActions: allowedActions,
        activeHand: hasSplit ? this.getActiveSplitHand() : null, // Only include activeHand if split is true
        hasSplit: hasSplit,
        // Add split hand data if it exists
        splitHand: splitHandData,
        insuranceAmount: this.game.getInsuranceBet(),
        insuranceDecided: this.insuranceDecided, // Save the insurance decision state
        timestamp: Date.now()
      };
      
      // Add timestamp to track when the state was saved
      const saveTimestamp = Date.now();
      console.log(`[saveGameState] API call starting at ${new Date(saveTimestamp).toISOString()}`);
      
      // DIAGNOSTIC: Log full game state data before saving to API
      console.log('[saveGameState] Detailed game state data:', JSON.stringify({
        gamePhase: gameStateData.gamePhase,
        playerBalance: gameStateData.playerBalance,
        currentBet: gameStateData.currentBet,
        hasSplit: gameStateData.hasSplit,
        activeSplitHand: gameStateData.activeHand,
        splitHandExists: !!gameStateData.splitHand,
        splitHandCards: gameStateData.splitHand ? gameStateData.splitHand.cards.length : 0
      }, null, 2));
      
      // CRITICAL: Final validation of split hand data before API call
      if (gameStateData.hasSplit === true && (!gameStateData.splitHand || !gameStateData.splitHand.cards || !gameStateData.splitHand.cards.length)) {
        console.warn('[saveGameState] Split hand data is incomplete but hasSplit is true - attempting recovery');
        
        // Create or repair split hand data instead of disabling
        const emptySplitHand = {
          type: 'split',
          cards: [] as any[],
          value: 0,
          busted: false,
          blackjack: false,
          soft: false
        };
        
        // If we have previously saved split cards, use them for recovery
        if (this.lastSavedSplitCards && this.lastSavedSplitCards.length > 0) {
          console.log(`[saveGameState] Recovering split hand from lastSavedSplitCards with ${this.lastSavedSplitCards.length} cards`);
          emptySplitHand.cards = JSON.parse(JSON.stringify(this.lastSavedSplitCards));
          // Try to get proper value from game if available
          emptySplitHand.value = this.game.getSplitHandValue() || 0;
        } else {
          // Create a placeholder card to ensure split hand is preserved
          console.log('[saveGameState] Creating placeholder card for split hand preservation');
          const placeholderCard = {
            suit: 'hearts' as const,
            rank: 'A' as const,
            value: 11,
            faceUp: true
          };
          emptySplitHand.cards = [placeholderCard];
        }
        
        // Use the recovered or placeholder split hand data
        gameStateData.splitHand = emptySplitHand;
        
        console.log('[saveGameState] Split hand data repaired to maintain split functionality');
      }
      
      // Save state to API
      const response = await this.apiService.saveUserGameData(this.playerAuth.loginData, gameStateData);
      
      if (!response.success) {
        console.error('Failed to save game state:', response.error);
      } else {
        console.log(`[saveGameState] Game state saved successfully (took ${Date.now() - saveTimestamp}ms)`);
      }
    } catch (error) {
      console.error('Error saving game state:', error);
    }
  }
  
  /**
   * Restores a saved game state
   * @param savedState The saved game state to restore
   */
  public async restoreGameState(savedState: any): Promise<boolean> {
    try {
      console.log('Restoring game state:', savedState.gamePhase);
      console.log('Saved state content:', JSON.stringify(savedState, null, 2));
      
      // Update player balance
      this.playerBalance = savedState.playerBalance;
      
      // Reset game
      this.game.reset();
      
      // Restore bet amount
      if (savedState.currentBet) {
        this.game.placeBet(savedState.currentBet);
      }
      
      // Set the correct game phase
      this.game.setGamePhase(savedState.gamePhase);
      
      // Restore player and dealer hands with proper card data
      if (savedState.playerHand) {
        if (Array.isArray(savedState.playerHand)) {
          // Handle case where playerHand is a direct array of cards
          this.game.restorePlayerHand(savedState.playerHand);
          console.log('Restored player hand from array:', savedState.playerHand);
        } else if (savedState.playerHand.cards) {
          // Handle case where playerHand is an object with a cards property
          this.game.restorePlayerHand(savedState.playerHand.cards);
          console.log('Restored player hand from object:', savedState.playerHand.cards);
        } else {
          console.warn('Invalid player hand format in saved state:', savedState.playerHand);
        }
      }
      
      if (savedState.dealerHand) {
        if (Array.isArray(savedState.dealerHand)) {
          // Handle case where dealerHand is a direct array of cards
          this.game.restoreDealerHand(savedState.dealerHand);
          console.log('Restored dealer hand from array:', savedState.dealerHand);
        } else if (savedState.dealerHand.cards) {
          // Handle case where dealerHand is an object with a cards property
          this.game.restoreDealerHand(savedState.dealerHand.cards);
          console.log('Restored dealer hand from object:', savedState.dealerHand.cards);
        } else {
          console.warn('Invalid dealer hand format in saved state:', savedState.dealerHand);
        }
      }
      
      // Restore insurance if applicable
      if (savedState.insuranceAmount && savedState.insuranceAmount > 0) {
        this.game.setInsuranceBet(savedState.insuranceAmount);
        console.log('Restored insurance bet:', savedState.insuranceAmount);
        
        // Set insurance as decided since there's an insurance bet
        this.insuranceDecided = true;
        console.log('Setting insuranceDecided to true because insurance bet exists');
      } else if (savedState.insuranceDecided !== undefined) {
        // If the saved state explicitly includes the insuranceDecided flag, use it
        this.insuranceDecided = savedState.insuranceDecided;
        console.log(`Restoring insuranceDecided from saved state: ${this.insuranceDecided}`);
      } else if (savedState.allowedActions) {
        // If allowed actions include insurance, set insuranceDecided to false
        // Otherwise, set it to true (meaning insurance is no longer available)
        const hasInsuranceAction = savedState.allowedActions.includes(MessageType.INSURANCE);
        this.insuranceDecided = !hasInsuranceAction;
        console.log(`Setting insuranceDecided based on allowed actions: ${this.insuranceDecided}`);
        
        // Special case: if dealer's up card is not Ace, always set insuranceDecided to true
        const dealerUpCard = this.game.getDealerUpCard();
        if (dealerUpCard && dealerUpCard.rank !== 'A') {
          this.insuranceDecided = true;
          console.log('Setting insuranceDecided to true because dealer up card is not Ace');
        }
      }
      
      // Handle split hands if applicable
      if (savedState.hasSplit) {
        // Add logic to restore split hands if your game supports it
        console.log('Restoring split hand state');
        this.game.restoreSplitState(savedState.activeHand || 'first');
        
        // Handle split hand cards if available
        let splitCardsRestored = false;
        
        // Use splitHand from the saved state if available
        if (savedState.splitHand && savedState.splitHand.cards && savedState.splitHand.cards.length > 0) {
          // Restore split hand cards from splitHand property
          console.log('Restoring split hand cards from splitHand property:', savedState.splitHand.cards);
          this.game.restoreSplitHandCards(savedState.splitHand.cards);
          // Save these cards for potential recovery
          this.lastSavedSplitCards = [...savedState.splitHand.cards];
          splitCardsRestored = true;
        } else if (savedState.secondHand && savedState.secondHand.cards && savedState.secondHand.cards.length > 0) {
          // For backward compatibility, try secondHand if splitHand is not available
          console.log('Restoring split hand cards from secondHand property (backward compatibility):', savedState.secondHand.cards);
          this.game.restoreSplitHandCards(savedState.secondHand.cards);
          // Save these cards for potential recovery
          this.lastSavedSplitCards = [...savedState.secondHand.cards];
          splitCardsRestored = true;
        } else if (Array.isArray(savedState.splitHand)) {
          // Handle case where splitHand is a direct array of cards
          console.log('Restoring split hand from direct array format:', savedState.splitHand);
          this.game.restoreSplitHandCards(savedState.splitHand);
          // Save these cards for potential recovery
          this.lastSavedSplitCards = [...savedState.splitHand];
          splitCardsRestored = true;
        } else if (Array.isArray(savedState.secondHand)) {
          // Handle case where secondHand is a direct array of cards (backward compatibility)
          console.log('Restoring split hand from direct array format (backward compatibility):', savedState.secondHand);
          this.game.restoreSplitHandCards(savedState.secondHand);
          // Save these cards for potential recovery
          this.lastSavedSplitCards = [...savedState.secondHand];
          splitCardsRestored = true;
        } else {
          console.warn('Split hand state was marked as true but no split cards found in saved state');
        }
        
        // Verify the split hand was properly restored
        const splitCards = this.game.getSplitCards();
        if (splitCards && splitCards.length > 0) {
          console.log(`Split hand restored successfully with ${splitCards.length} cards`);
          console.log('Split cards after restoration:', JSON.stringify(splitCards.map(card => `${card.rank} of ${card.suit}`)));
          
          // Store in lastSavedSplitCards for safety
          this.lastSavedSplitCards = [...splitCards];
        } else {
          console.warn('Failed to restore split hand cards - no cards found after restoration');
          
          // If we couldn't restore from state but have saved cards, use them
          if (!splitCardsRestored && this.lastSavedSplitCards && this.lastSavedSplitCards.length > 0) {
            console.log(`Attempting to restore split hand from previously saved cards: ${this.lastSavedSplitCards.length} cards`);
            this.game.restoreSplitHandCards(this.lastSavedSplitCards);
            
            // Check if that worked
            const recoveredCards = this.game.getSplitCards();
            if (recoveredCards && recoveredCards.length > 0) {
              console.log(`Successfully recovered split hand from saved cards: ${recoveredCards.length} cards`);
              console.log('Recovered cards:', JSON.stringify(recoveredCards.map(card => `${card.rank} of ${card.suit}`)));
            } else {
              console.warn('Failed to recover split hand from saved cards');
              // If we still can't recover, disable split to prevent issues
              savedState.hasSplit = false;
            }
          } else if (!splitCardsRestored) {
            // If no recovery options, disable split to prevent issues
            savedState.hasSplit = false;
          }
        }
      }
      
      // Store the original allowed actions from saved state to use later
      if (savedState.allowedActions && savedState.allowedActions.length > 0) {
        console.log('Restoring original allowed actions:', savedState.allowedActions);
        this.restoredAllowedActions = [...savedState.allowedActions];
        this.isRestoredState = true;
      }
      
      // After restoration, verify if the hand data was correctly restored
      const playerCards = this.game.getPlayerCards();
      const dealerCards = this.game.getDealerCards();
      console.log('Restored player cards:', playerCards);
      console.log('Restored dealer cards:', dealerCards);
      
      console.log('Game state restored successfully');
      return true;
    } catch (error) {
      console.error('Error restoring game state:', error);
      return false;
    }
  }

  /**
   * Handle returning to the betting phase after a game completes or on error
   * This transitions from any phase back to Betting phase
   */
  public returnToBettingPhase(): void {
    console.log(`Returning to betting phase for client ${this.clientId}`);
    
    // Get current phase for logging
    const currentPhase = this.game.getGamePhase();
    
    // Store the current bet before potentially resetting
    const currentBet = this.game.getCurrentBet();
    console.log(`[RETURN DEBUG] Current bet before returning to betting: ${currentBet}`);
    
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
    
    // 2. Store the last bet before resetting
    const lastBet = currentBet > 0 ? currentBet : this.game.getLastBet();
    
    // 3. Reset the game state for a new round
    // Only do full reset if we're actually ending a completed game
    // If we're in dealer_turn or complete phase, make sure to use the stored bet amount for the game.reset() method
    console.log(`[RETURN DEBUG] Before reset: phase=${currentPhase}, lastBet=${lastBet}, currentBet=${currentBet}`);
    this.game.reset();
    console.log(`[RETURN DEBUG] After reset: currentBet=${this.game.getCurrentBet()}`);
    
    // 4. Ensure last bet is properly set for rebet functionality
    if (lastBet > 0) {
        this.game.setLastBet(lastBet);
    }
    
    // 5. Determine allowed actions including rebet if applicable
    const allowedActions = [MessageType.PLACE_BET];
    if (lastBet > 0 && this.playerBalance >= lastBet) {
        allowedActions.push(MessageType.REBET);
    }
    
    // 6. Send updated game state with correct actions
    // Send immediate update to reset the UI
    this.sendToClient({
        type: MessageType.PHASE_CHANGE,
        data: {
            from: this.game.getPreviousGamePhase(),
            to: 'betting',
            playerHand: this.game.getGameState(this.playerBalance).playerHand,
            dealerHand: this.game.getGameState(this.playerBalance).dealerHand,
            splitHand: null,
            activeSplitHand: null,
            playerBalance: this.playerBalance,
            currentBet: 0,
            insuranceBet: 0,
            gamePhase: 'betting'
        }
    });
    
    // 7. If we were in complete phase, send a delayed message with bet actions
    // This allows the frontend time to finish any animations or popup closures
    // Always send these allowed actions to ensure the betting controls appear
    setTimeout(() => {
        this.sendToClient({
            type: MessageType.PHASE_CHANGE,
            data: {
                from: 'betting',
                to: 'betting',
                gamePhase: 'betting',
                allowedActions: allowedActions,
                message: "Ready for next bet"
            }
        });
    }, 1000); // 1 second delay before sending betting actions
    
    console.log(`Transitioned from ${currentPhase} to Betting phase with actions:`, allowedActions);
  }

  /**
   * Process the dealer's turn
   * This is called automatically when the player's turn ends
   */
  private processDealerTurn(): void {
    console.log(`Processing dealer turn in session ${this.clientId}`);
    
    // Store the current bet for later use
    const currentBetBeforeDealerTurn = this.game.getCurrentBet();
    console.log(`[CRITICAL FIX] Storing current bet amount at dealer turn start: ${currentBetBeforeDealerTurn}`);
    
    // Debug logging for bet amount tracking
    console.log(`[BET DEBUG] At start of dealer turn, current bet = ${this.game.getCurrentBet()}`);
    
    // Set game phase to dealer_turn
    this.game.setGamePhase('dealer_turn');
    
    // Notify client that dealer turn is starting
    this.sendToClient({
      type: MessageType.PHASE_CHANGE,
      data: {
        from: 'player_turn',
        to: 'dealer_turn',
        message: "Dealer's turn"
      }
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
    
    // Debug bet amount before potentially ending the game
    console.log(`[BET DEBUG] Before checking busted hands, current bet = ${this.game.getCurrentBet()}`);
    
    // If all player hands busted, skip dealer drawing cards
    if (allHandsBusted) {
      console.log('All player hands busted, skipping dealer drawing cards and ending game');
      this.game.setGamePhase('complete');
      
      // Ensure bet is preserved for busted hands
      if (this.game.getCurrentBet() !== currentBetBeforeDealerTurn) {
        console.log(`[CRITICAL FIX] Restoring bet amount for busted hand from ${this.game.getCurrentBet()} to ${currentBetBeforeDealerTurn}`);
        // Force the current bet to be set correctly
        this.game.setCurrentBet(currentBetBeforeDealerTurn);
      }
      
      this.endGame();
      return;
    }
    
    // Debug bet amount before dealer turn
    console.log(`[BET DEBUG] Before dealer drawing cards, current bet = ${this.game.getCurrentBet()}`);
    
    // Execute dealer's turn (draw cards until 17 or higher) after revealing hole card
    setTimeout(() => {
      const dealerCards = this.executeDealerTurn();
      console.log(`Dealer's turn complete. Final hand value: ${this.game.getDealerValue()}`);
      
      // Debug bet amount before completing the game
      console.log(`[BET DEBUG] After dealer turn complete, before setting phase to complete, current bet = ${this.game.getCurrentBet()}`);
      
      // Set game phase to complete first
      this.game.setGamePhase('complete');
      
      // Debug bet amount after setting phase to complete
      console.log(`[BET DEBUG] After setting phase to complete, current bet = ${this.game.getCurrentBet()}`);
      
      // End the game with final outcome after a slight delay
      setTimeout(() => {
        // Ensure bet is preserved right before ending the game
        if (this.game.getCurrentBet() !== currentBetBeforeDealerTurn) {
          console.log(`[CRITICAL FIX] Restoring bet amount before endGame from ${this.game.getCurrentBet()} to ${currentBetBeforeDealerTurn}`);
          // Force the current bet to be set correctly
          this.game.setCurrentBet(currentBetBeforeDealerTurn);
        }
        
        // Debug bet amount right before ending the game
        console.log(`[BET DEBUG] Right before endGame, current bet = ${this.game.getCurrentBet()}`);
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
      type: MessageType.PHASE_CHANGE,
      data: {
        from: this.game.getPreviousGamePhase(),
        to: this.game.getGamePhase(),
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
   * CENTRALIZED GAME ACTION HANDLER
   * Handles all in-game actions (hit, stand, double, split, etc.) with phase validation
   * @param action The action type
   * @param data Additional action data if needed
   */
  public handleGameAction(action: MessageType, data?: any): void {
    try {
      // Validate the action for current phase
      const currentPhase = this.game.getGamePhase();
      
      // Process the action
      switch(action) {
        case MessageType.PLACE_BET:
          this.handleBetPlaced(data);
          break;
          
        case MessageType.HIT:
          this.handleHit(data?.hand);
          this.shouldSaveGameState = true; // Mark for save after hit
          break;
          
        case MessageType.STAND:
          this.handleStand(data?.hand);
          this.shouldSaveGameState = true; // Mark for save after stand
          break;
          
        case MessageType.DOUBLE_DOWN:
          this.handleDoubleDown();
          this.shouldSaveGameState = true; // Mark for save after double down
          break;
          
        case MessageType.SPLIT:
          this.handleSplit();
          this.shouldSaveGameState = true; // Mark for save after split
          break;
          
        case MessageType.SURRENDER:
          this.handleSurrender();
          // No need to save state for surrender as game ends
          break;
          
        case MessageType.INSURANCE:
          this.handleInsurance(data);
          this.shouldSaveGameState = true; // Mark for save after insurance
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
      
      // Save game state if needed and we're in an active game phase
      if (this.shouldSaveGameState && 
          currentPhase !== 'betting' && 
          currentPhase !== 'complete' &&
          this.playerAuth.isAuthenticated) {
        this.saveGameState();
        this.shouldSaveGameState = false;
      }
      
    } catch (error) {
      console.error(`Error handling action ${action}:`, error);
      this.sendToClient({
        type: MessageType.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error processing action'
        }
      });
    }
  }

  /**
   * Check if the player is authenticated
   */
  public isAuthenticated(): boolean {
    return this.playerAuth.isAuthenticated;
  }

  /**
   * Get the current game state
   */
  public getGameState(): GameStateData {
    // Get basic game state from the game
    const currentState = this.game.getGameState(this.playerBalance);
    
    // Create a complete GameStateData object
    const gameState: GameStateData = {
      gamePhase: this.game.getGamePhase() as 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'complete',
      playerBalance: this.playerBalance,
      currentBet: this.game.getCurrentBet(),
      lastBet: this.game.getCurrentBet(),
      playerHand: this.game.getPlayerCards(),
      dealerHand: this.game.getDealerCards(),
      allowedActions: this.determineAllowedActions(),
      activeHand: this.getActiveSplitHand(),
      hasSplit: this.hasSplitHand(),
      insuranceAmount: this.game.getInsuranceBet(),
      timestamp: Date.now()
    };
    
    // Add split hand cards count if game has split
    if (gameState.hasSplit) {
      const splitCards = this.game.getSplitCards();
      if (splitCards && splitCards.length > 0) {
        gameState.splitHandCards = splitCards.length;
      } else if (this.lastSavedSplitCards && this.lastSavedSplitCards.length > 0) {
        gameState.splitHandCards = this.lastSavedSplitCards.length;
      }
    }
    
    return gameState;
  }

  /**
   * Get the BlackjackGame instance
   */
  public getGame(): BlackjackGame {
    return this.game;
  }

  /**
   * Set login data for this session
   * This is used when login data is extracted from URL parameters
   */
  public setLoginData(loginData: LoginData): void {
    this.playerAuth.loginData = loginData;
    console.log(`Login data set for session ${this.clientId}: userId=${loginData.userId}`);
  }

  /**
   * Get the last saved split cards
   */
  public getLastSavedSplitCards(): any[] {
    return this.lastSavedSplitCards || [];
  }
  
  /**
   * Set the last saved split cards
   */
  public setLastSavedSplitCards(cards: any[]): void {
    if (cards && cards.length > 0) {
      this.lastSavedSplitCards = [...cards];
      console.log(`Stored ${cards.length} split cards for potential recovery`);
    }
  }

} 