import { Hand } from "./hand";
import { Globals } from "./globals";

export enum GameOutcome {
    PLAYER_BLACKJACK = 'player_blackjack',
    PLAYER_WIN = 'player_win', 
    DEALER_WIN = 'dealer_win',
    PUSH = 'push',
    PLAYER_BUST = 'player_bust',
    DEALER_BUST = 'dealer_bust',
    SURRENDER = 'surrender',
    INSURANCE_AVAILABLE = 'insurance_available',
    SPLIT_AVAILABLE = 'split_available',
    INSURANCE_WON = 'insurance_won',
    INSURANCE_LOST = 'insurance_lost',
    SPLIT_WIN = 'split_win',
    SPLIT_LOSE = 'split_lose',
    SPLIT_PUSH = 'split_push',
    SPLIT_WIN_LOSE = 'split_win_lose',
    SPLIT_WIN_PUSH = 'split_win_push',
    SPLIT_LOSE_PUSH = 'split_lose_push'
}

export class Result {
    /**
     * Determine the outcome of the game based on player and dealer hand values
     * @param playerHandValue - The value of the player's hand
     * @param dealerHandValue - The value of the dealer's hand
     * @returns The game outcome
     */
    public static determineOutcome(playerHandValue: number, dealerHandValue: number): GameOutcome {
        const playerValue = playerHandValue;
        const dealerValue = dealerHandValue;

        if (dealerValue > 21) {
            return GameOutcome.DEALER_BUST;
        } else if (playerValue > 21) {
            return GameOutcome.PLAYER_BUST;
        } else if (playerValue > dealerValue) {
            return GameOutcome.PLAYER_WIN;
        } else if (dealerValue > playerValue) {
            return GameOutcome.DEALER_WIN;
        } else {
            return GameOutcome.PUSH;
        }
    }
    
    /**
     * Determine outcome with more detailed logic for split games and blackjack
     * @param playerHand - The player's main hand
     * @param dealerHand - The dealer's hand
     * @param playerSplitHand - The player's split hand (if any)
     * @returns An object containing the game outcome and whether the game has ended
     */
    public static determineDetailedOutcome(
        playerHand: Hand, 
        dealerHand: Hand, 
        playerSplitHand: Hand | null = null,
        playerInsuranceBet: number = 0
    ): { outcome: GameOutcome, gameEnded: boolean, message: string, payout: number } {
        // Default values
        let outcome: GameOutcome = GameOutcome.PLAYER_WIN;
        let gameEnded: boolean = true;
        let message: string = "";
        let payout: number = 0;
        
        // Get hand values (ensure we're considering all cards including face-down ones)
        const playerValue = playerHand.getTotalValue ? playerHand.getTotalValue() : playerHand.calculateValue(true);
        const dealerValue = dealerHand.getTotalValue ? dealerHand.getTotalValue() : dealerHand.calculateValue(true);
        
        // Check for special surrender flag on the hand (set by playerSurrender method)
        if (playerHand.surrendered) {
            outcome = GameOutcome.SURRENDER;
            message = "You surrendered.";
            payout = Globals.currentBet / 2; // Return half the bet
            return { outcome, gameEnded, message, payout };
        }
        
        // Check for special conditions first
        if (playerHand.blackjack && !dealerHand.blackjack) {
            // Player has blackjack, dealer doesn't
            outcome = GameOutcome.PLAYER_BLACKJACK;
            message = "Blackjack! You win!";
            payout = this.calculatePayout(outcome, Globals.currentBet, true);
        } 
        else if (dealerHand.blackjack && !playerHand.blackjack) {
            // Dealer has blackjack, player doesn't
            outcome = GameOutcome.DEALER_WIN;
            message = "Dealer has Blackjack. You lose.";
            
            // Handle insurance if applicable
            if (playerInsuranceBet > 0) {
                outcome = GameOutcome.INSURANCE_WON;
                message = "Dealer has Blackjack. Insurance pays 2:1.";
                payout = playerInsuranceBet * 2; // Insurance pays 2:1
            } else {
                payout = 0; // Player loses their bet
            }
        }
        else if (playerHand.blackjack && dealerHand.blackjack) {
            // Both have blackjack
            outcome = GameOutcome.PUSH;
            message = "Both have Blackjack. Push.";
            payout = Globals.currentBet; // Return the bet
            
            // Handle insurance if applicable
            if (playerInsuranceBet > 0) {
                outcome = GameOutcome.INSURANCE_WON;
                message = "Both have Blackjack. Insurance pays 2:1.";
                payout += playerInsuranceBet * 2; // Insurance pays 2:1
            }
        }
        // Handle split hands if present
        else if (playerSplitHand) {
            const splitValue = playerSplitHand.getTotalValue ? playerSplitHand.getTotalValue() : playerSplitHand.calculateValue(true);
            
            // Evaluate each hand independently
            let firstHandResult = this.evaluateSingleHand(playerHand, dealerHand);
            let secondHandResult = this.evaluateSingleHand(playerSplitHand, dealerHand);
            
            // Calculate payouts for each hand individually - split bet is half the total on each hand
            const betPerHand = Globals.currentBet / 2;
            const firstHandPayout = this.calculatePayout(firstHandResult.outcome, betPerHand);
            const secondHandPayout = this.calculatePayout(secondHandResult.outcome, betPerHand);
            
            // Total payout is the sum of both hands
            payout = firstHandPayout + secondHandPayout;
            
            // Determine the overall outcome based on individual hand results
            if (firstHandResult.isWin && secondHandResult.isWin) {
                outcome = GameOutcome.SPLIT_WIN;
                message = "Both split hands win!";
            } 
            else if (!firstHandResult.isWin && !secondHandResult.isWin) {
                outcome = GameOutcome.SPLIT_LOSE;
                message = "Both split hands lose.";
            }
            else if (firstHandResult.isPush && secondHandResult.isPush) {
                outcome = GameOutcome.SPLIT_PUSH;
                message = "Both split hands push.";
            }
            else if ((firstHandResult.isWin && !secondHandResult.isWin && !secondHandResult.isPush) || 
                    (!firstHandResult.isWin && !firstHandResult.isPush && secondHandResult.isWin)) {
                outcome = GameOutcome.SPLIT_WIN_LOSE;
                message = "One hand wins, one hand loses.";
            }
            else if ((firstHandResult.isWin && secondHandResult.isPush) || 
                    (firstHandResult.isPush && secondHandResult.isWin)) {
                outcome = GameOutcome.SPLIT_WIN_PUSH;
                message = "One hand wins, one hand pushes.";
            }
            else if (((!firstHandResult.isWin && !firstHandResult.isPush) && secondHandResult.isPush) || 
                    (firstHandResult.isPush && !secondHandResult.isWin && !secondHandResult.isPush)) {
                outcome = GameOutcome.SPLIT_LOSE_PUSH;
                message = "One hand loses, one hand pushes.";
            }
            else {
                // Default in case we missed a combination
                outcome = GameOutcome.SPLIT_WIN;
                message = "Split hand result.";
            }
            
            // Log the detailed results for debugging
            console.log(`Split hand results: 
                First hand (${playerValue}): ${firstHandResult.outcome} - ${firstHandPayout} chips
                Second hand (${splitValue}): ${secondHandResult.outcome} - ${secondHandPayout} chips
                Total payout: ${payout} chips`);
        }
        // Normal game flow
        else if (playerHand.busted) {
            outcome = GameOutcome.PLAYER_BUST;
            message = "Bust! You lose.";
            payout = 0; // Player loses their bet
            
            // Handle insurance if dealer has blackjack
            if (playerInsuranceBet > 0 && dealerHand.blackjack) {
                outcome = GameOutcome.INSURANCE_WON;
                message = "You busted but insurance pays 2:1.";
                payout = playerInsuranceBet * 2; // Insurance pays 2:1
            }
        }
        else if (dealerHand.busted) {
            outcome = GameOutcome.DEALER_BUST;
            message = "Dealer busts! You win!";
            payout = this.calculatePayout(outcome, Globals.currentBet);
            
            // Handle insurance if applicable (always lost if dealer busts)
            if (playerInsuranceBet > 0) {
                message += " Insurance lost.";
                // Payout already includes the win, insurance is lost
            }
        }
        else {
            // Compare hand values
            outcome = this.determineOutcome(playerValue, dealerValue);
            
            switch (outcome) {
                case GameOutcome.PLAYER_WIN:
                    message = "You win!";
                    payout = this.calculatePayout(outcome, Globals.currentBet);
                    break;
                case GameOutcome.DEALER_WIN:
                    message = "Dealer wins.";
                    payout = 0; // Player loses their bet
                    break;
                case GameOutcome.PUSH:
                    message = "Push.";
                    payout = Globals.currentBet; // Return the bet
                    break;
                default:
                    message = "Game over.";
                    payout = 0;
            }
            
            // Handle insurance if applicable
            if (playerInsuranceBet > 0) {
                if (dealerHand.blackjack) {
                    outcome = GameOutcome.INSURANCE_WON;
                    message = "Insurance pays 2:1.";
                    payout = playerInsuranceBet * 2; // Insurance pays 2:1
                } else {
                    message += " Insurance lost.";
                    // No additional payout for lost insurance
                }
            }
        }
        
        return { outcome, gameEnded, message, payout };
    }
    
    /**
     * Evaluate a single hand against the dealer's hand
     * @param playerHand - The player's hand to evaluate
     * @param dealerHand - The dealer's hand
     * @returns Hand result with outcome and win/push flags
     */
    private static evaluateSingleHand(playerHand: Hand, dealerHand: Hand): {
        outcome: GameOutcome, 
        isWin: boolean, 
        isPush: boolean
    } {
        let outcome: GameOutcome;
        let isWin = false;
        let isPush = false;
        
        if (playerHand.busted) {
            outcome = GameOutcome.PLAYER_BUST;
        } else if (dealerHand.busted) {
            outcome = GameOutcome.DEALER_BUST;
            isWin = true;
        } else if (playerHand.blackjack && !dealerHand.blackjack) {
            outcome = GameOutcome.PLAYER_BLACKJACK;
            isWin = true;
        } else if (dealerHand.blackjack && !playerHand.blackjack) {
            outcome = GameOutcome.DEALER_WIN;
        } else if (playerHand.blackjack && dealerHand.blackjack) {
            outcome = GameOutcome.PUSH;
            isPush = true;
        } else if (playerHand.value > dealerHand.value) {
            outcome = GameOutcome.PLAYER_WIN;
            isWin = true;
        } else if (dealerHand.value > playerHand.value) {
            outcome = GameOutcome.DEALER_WIN;
        } else {
            outcome = GameOutcome.PUSH;
            isPush = true;
        }
        
        return { outcome, isWin, isPush };
    }
    
    /**
     * Determine if the player's hand is eligible for splitting
     * @param hand - The player's hand
     * @param alreadySplit - Whether a split has already occurred
     * @returns Whether the hand can be split
     */
    public static canSplit(hand: Hand, alreadySplit: boolean = false): boolean {
        // Prevent re-splitting - if a split has already occurred, don't allow another split
        if (alreadySplit) {
            return false;
        }
        
        // Need exactly 2 cards of the same rank to split
        return hand.cards.length === 2 && hand.cards[0].value === hand.cards[1].value;
    }
    
    /**
     * Check if insurance is available based on dealer's up card
     * @param dealerHand - The dealer's hand
     * @returns True if insurance is available (dealer shows an Ace)
     */
    public static isInsuranceAvailable(dealerHand: Hand): boolean {
        // Insurance is only available when dealer's face-up card is an Ace
        if (!dealerHand || dealerHand.cards.length === 0) {
            return false;
        }
        
        const dealerUpCard = dealerHand.cards[0];
        return dealerUpCard.rank === 'A';
    }
    
    /**
     * Handle the outcome of an insurance bet
     * @param playerInsuranceBet - The amount of the insurance bet
     * @param dealerHasBlackjack - Whether the dealer has blackjack
     * @returns The game outcome for the insurance
     */
    public static handleInsuranceOutcome(playerInsuranceBet: number, dealerHasBlackjack: boolean): GameOutcome {
        if (playerInsuranceBet <= 0) {
            return GameOutcome.DEALER_WIN; // No insurance bet
        }
        
        if (dealerHasBlackjack) {
            return GameOutcome.INSURANCE_WON;
        } else {
            return GameOutcome.INSURANCE_LOST;
        }
    }
    
    /**
     * Calculate the payout for a given outcome and wager
     * @param outcome - The game outcome
     * @param wager - The wager amount
     * @param isBlackjack - Whether the player has blackjack
     * @returns The payout amount
     */
    public static calculatePayout(outcome: GameOutcome, wager: number, isBlackjack: boolean = false): number {
        switch (outcome) {
            case GameOutcome.PLAYER_BLACKJACK:
                return wager * 2.5; // Blackjack pays 3:2 (return original bet + 1.5x)
            case GameOutcome.PLAYER_WIN:
            case GameOutcome.DEALER_BUST:
                return wager * 2; // Regular win pays 1:1 (return original bet + 1x)
            case GameOutcome.PUSH:
                return wager; // Push returns the original bet
            case GameOutcome.INSURANCE_WON:
                return wager * 2; // Insurance pays 2:1
            case GameOutcome.SURRENDER:
                return wager * 0.5; // Surrender returns half the bet
            case GameOutcome.PLAYER_BUST:
            case GameOutcome.DEALER_WIN:
            case GameOutcome.INSURANCE_LOST:
                return 0; // Player loses bet
            default:
                console.error("Unknown outcome type:", outcome);
                return 0;
        }
    }
    
    /**
     * Check if the dealer should hit based on standard blackjack rules
     * @param dealerHandValue - The value of the dealer's hand
     * @param playerHandValue - The value of the player's hand
     * @returns Whether the dealer should hit
     */
    public static shouldDealerHit(dealerHandValue: number, playerHandValue: number): boolean {
        // Dealer hits on 16 or less, stands on 17 or more
        return dealerHandValue < 17;
    }
    
    /**
     * Check if a hand has a soft ace (ace counted as 11)
     * @param hand - The hand to check
     * @returns Whether the hand has a soft ace
     */
    public static hasSoftAce(hand: Hand): boolean {
        for (const card of hand.cards) {
            if (card.rank === 'A' && card.value === 11) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Convert a soft ace to a hard ace (11 to 1) if bust
     * @param hand - The hand to adjust
     * @returns Whether an ace was converted
     */
    public static convertSoftAceIfBust(hand: Hand): boolean {
        if (hand.value <= 21) {
            return false;
        }
        
        for (const card of hand.cards) {
            if (card.rank === 'A' && card.value === 11) {
                card.value = 1;
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Determine if player turn is over based on hand value
     * @param handValue - The value of the hand
     * @returns Whether the player's turn is over
     */
    public static isPlayerTurnOver(handValue: number): boolean {
        return handValue >= 21; // Player done if 21 or bust
    }
    
    /**
     * Get display message based on game outcome
     * @param outcome - The game outcome
     * @returns A message describing the outcome
     */
    public static getOutcomeMessage(outcome: GameOutcome): string {
        switch (outcome) {
            case GameOutcome.PLAYER_BLACKJACK:
                return "Blackjack! You won";
            case GameOutcome.PLAYER_WIN:
                return "You won";
            case GameOutcome.DEALER_BUST:
                return "Dealer bust! You won";
            case GameOutcome.PUSH:
                return "Push - it's a tie";
            case GameOutcome.PLAYER_BUST:
                return "Bust! You lose";
            case GameOutcome.DEALER_WIN:
                return "Dealer won";
            case GameOutcome.SURRENDER:
                return "You surrendered";
            case GameOutcome.INSURANCE_WON:
                return "Insurance paid";
            case GameOutcome.INSURANCE_LOST:
                return "Insurance lost";
            default:
                return "Game over";
        }
    }

    /**
     * Display win amount animation
     * @param amount - The amount won
     */
    public showWin(amount: number): void {
        console.log(`Win amount: ${amount}`);
        // Animation logic can be implemented here
        // For example, showing a floating text animation
    }
}

// const result = Result.determineDetailedOutcome(playerHand, dealerHand, playerSplitHand);

// if (result.gameEnded) {
//   // Show result to player and update balance
//   popupManager.showPopup(result.message);
  
//   // Update balance based on outcome
//   const payout = Result.calculatePayout(result.outcome, currentBet);
//   Globals.balance += payout;
// } else {
//   // Game continues - either dealer needs to hit or player can still act
//   if (dealerHand.cards[1].faceUp) {
//     // Dealer's turn continues
//     dealerPlay();
//   } else {
//     // Player's turn continues
//     showPlayerOptions();
//   }
// }