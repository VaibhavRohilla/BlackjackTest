import { Container, Text } from "pixi.js";
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
    SPLIT_LOSE_PUSH = 'split_lose_push',
    PENDING = 'pending'
}

/**
 * This class handles the visualization of game results.
 * All game outcome determination is now done on the backend.
 */
export class Result extends Container {
    private resultText: Text;
    private winAmountText: Text;
    
    constructor() {
        super();
        
        // Set up result display elements
        this.resultText = new Text('', {
            fontFamily: 'Arial',
            fontSize: 24,
            fill: 0xFFFFFF,
            align: 'center'
        });
        this.resultText.anchor.set(0.5);
        this.resultText.position.set(0, -30);
        
        this.winAmountText = new Text('', {
            fontFamily: 'Arial',
            fontSize: 32,
            fill: 0xFFD700, // Gold color
            align: 'center'
        });
        this.winAmountText.anchor.set(0.5);
        this.winAmountText.position.set(0, 10);
        
        // Add text elements to container
        this.addChild(this.resultText);
        this.addChild(this.winAmountText);
        
        // Hide initially
        this.visible = false;
    }
    
    /**
     * Display win amount animation
     * @param amount - The amount won
     */
    public showWin(amount: number): void {
        console.log(`Win amount: ${amount}`);
        
        // Set text content
        this.winAmountText.text = `+${amount}`;
        
        // Make container visible
        this.visible = true;
        
        // Animate the win amount text (simple pulse animation)
        this.animateWinAmount();
    }
    
    /**
     * Display game result with message and payout
     * @param outcome - The game outcome
     * @param message - Message describing the outcome
     * @param payout - The payout amount
     */
    public showResult(outcome: GameOutcome, message: string, payout: number): void {
        console.log(`Game result: ${outcome}, Message: ${message}, Payout: ${payout}`);
        
        // Set text content
        this.resultText.text = message;
        
        // Show win amount if there's a payout
        if (payout > 0) {
            this.showWin(payout);
        } else {
            this.winAmountText.text = '';
            this.visible = true;
        }
    }
    
    /**
     * Animate the win amount text
     */
    private animateWinAmount(): void {
        // Simple animation: scale up and down
        const originalScale = this.winAmountText.scale.x;
        
        // Scale up
        this.winAmountText.scale.set(originalScale * 1.5);
        
        // Then scale back down
        setTimeout(() => {
            this.winAmountText.scale.set(originalScale);
        }, 200);
    }
    
    /**
     * Hide the result display
     */
    public hideResult(): void {
        this.visible = false;
    }
    
    /**
     * Get a user-friendly message for a game outcome
     * Used for display purposes only
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
}