import { Card, Hand } from "./hand";
import { Container } from "pixi.js";
import { Globals } from "./globals";
import { Tween,Easing } from "@tweenjs/tween.js";

/**
 * Handles card distribution and visual representation for blackjack
 * Simplified to focus on UI/visual aspects rather than game logic
 */
export class BlackjackDealer extends Container {
    // Card hands for visual representation
    dealerHand: Hand = new Hand('dealer');
    playerHand: Hand = new Hand('player');
    splitHand: Hand | null = null;

    // Container for all cards
    cardContainer: Container = new Container();

    // Game state flags
    isInsuranceAvailable: boolean = false;
    isSplitAvailable: boolean = false;
    isCardDealInProgress: boolean = false;

    // Payout amount for display
    payout: number = 0;

    // Define constants for split hand positions - must be accessible to both methods
    private readonly FINAL_PLAYER_X = 220; // Right position - first hand
    private readonly FINAL_SPLIT_X = -220; // Left position - second hand
    private readonly PLAYER_Y_OFFSET = 0.40; // Player hands at 40% from top
    private readonly DEALER_Y_OFFSET = -0.25; // Dealer hand at 25% from top
    public readonly SPLIT_ANIMATION_DURATION = 400; // Duration for split animations
    public readonly CARD_DEAL_DELAY = 1500; // Delay between dealing cards
    private readonly SPLIT_HAND_SPACING = 220; // Total space between split hands

    /**
     * Create a new blackjack dealer
     */
    constructor() {
        super();
        this.initializeHands();

        // Add hand containers to the card container
        this.cardContainer.addChild(this.playerHand);
        this.cardContainer.addChild(this.dealerHand);

        // Ensure the card container is visible and properly positioned
        this.cardContainer.visible = true;
        this.cardContainer.sortableChildren = true;
        
        // Add card container to this container
        this.addChild(this.cardContainer);
        this.resize();
        
        // Log the card container properties for debugging
        console.log("Card container initialized:", {
            visible: this.cardContainer.visible,
            position: `(${this.cardContainer.x}, ${this.cardContainer.y})`,
            zIndex: this.cardContainer.zIndex,
            childCount: this.cardContainer.children.length
        });
    }

    initializeSplitHand(): boolean {
        // Check if the split hand already exists
        if (this.splitHand) {
            console.log("Split hand already exists, reusing existing hand.");
            return false;
        }
    
        console.log("Initializing new split hand with animation.");
        const screenHeight = window.innerHeight;
        const playerY = screenHeight * this.PLAYER_Y_OFFSET;
    
        try {
            // Create split hand object
            this.splitHand = new Hand('split');
            this.cardContainer.addChild(this.splitHand);
            this.splitHand.y = playerY;
            
            // Set initial alpha to 0
            this.splitHand.alpha = 0;
            
            // Fade in the split hand smoothly
            new Tween(this.splitHand, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 1 }, 300)
                .easing(Easing.Cubic.Out)
                .start();
    
        } catch (error) {
            console.error("Error during split animation:", error);
        }
    
        return true;
    }
    
    
    
    
    positionSplitHands(): void {
        if (!this.splitHand) return;
    
        const screenHeight = window.innerHeight;
        const playerY = screenHeight * this.PLAYER_Y_OFFSET;
        console.log("Positioning split hands with animation");
        
        // Calculate final positions based on screen width
        const finalPlayerX = this.SPLIT_HAND_SPACING / 2;
        const finalSplitX = -this.SPLIT_HAND_SPACING / 2;
        
        // Create a smooth transition for both hands
        new Tween(this.playerHand.position, Globals.sceneManager?.tweenGroup)
            .to({ x: finalPlayerX, y: playerY }, this.SPLIT_ANIMATION_DURATION)
            .easing(Easing.Cubic.Out)
            .start();
    
        new Tween(this.splitHand.position, Globals.sceneManager?.tweenGroup)
            .to({ x: finalSplitX, y: playerY }, this.SPLIT_ANIMATION_DURATION)
            .easing(Easing.Cubic.Out)
            .start();
    
        // Ensure bust status is updated after animation
        setTimeout(() => {
            this.updateBustStatus();
        }, this.SPLIT_ANIMATION_DURATION);
    }
    
    
    
    /**
     * Deal initial cards based on hand data from backend
     */
    async dealCards(playerHand: any, dealerHand: any): Promise<void> {
        console.log("Dealing initial cards from backend data");

        // Deal the cards in the proper sequence with animations
        // This creates the initial dealing animation when starting a game
        await this.playerHand.dealCards(playerHand.cards[0]);
        await new Promise(resolve => setTimeout(resolve, this.CARD_DEAL_DELAY));
        await this.dealerHand.dealCards(dealerHand.cards[0]);
        await new Promise(resolve => setTimeout(resolve, this.CARD_DEAL_DELAY));
        await this.playerHand.dealCards(playerHand.cards[1]);
        await new Promise(resolve => setTimeout(resolve, this.CARD_DEAL_DELAY));
        await this.dealerHand.dealCards(dealerHand.cards[1]);

        // Update card values display after all cards are dealt
        this.playerHand.updatePointsDisplay?.(true);
        this.dealerHand.updatePointsDisplay?.(true);
    }

    /**
     * Reset player and dealer hands
     */
    resetHands(): void {
        this.dealerHand.reset();
        this.playerHand.reset();

        // Reset visual states
        if (this.playerHand.pointsDisplay) {
            this.playerHand.pointsDisplay.tint = 0xFFFFFF;
        }
        this.playerHand.scale.set(1.0);

        // Clear split hand if it exists
        if (this.splitHand) {
            if (this.splitHand.pointsDisplay) {
                this.splitHand.pointsDisplay.tint = 0xFFFFFF;
            }
            this.splitHand.scale.set(1.0);
            this.splitHand.destroy();
            this.splitHand = null;
        }
        this.playerHand.alpha = 1.0;
        this.dealerHand.alpha = 1.0;
        // Reset flags
        this.isCardDealInProgress = false;
        this.isInsuranceAvailable = false;
        this.isSplitAvailable = false;
        this.payout = 0;

        // Make sure any visual indicators for split are cleared
        // Call setSplitAvailableVisual with false to clear any visual effects on cards
        this.setSplitAvailableVisual(false);

        this.resize();
    }

    /**
     * Update layout based on window size and game state
     */
    resize(): void {
        this.cardContainer.position.set(window.innerWidth / 2, window.innerHeight / 2);
        
        const screenHeight = window.innerHeight;
        const playerY = screenHeight * this.PLAYER_Y_OFFSET;
        const dealerY = screenHeight * this.DEALER_Y_OFFSET;
        
        this.dealerHand.x = 0;
        this.dealerHand.y = dealerY;
    
        if (this.splitHand) {
            // If split hand exists, position both hands
            this.playerHand.y = playerY;
            this.splitHand.y = playerY;
            
            // Calculate final positions based on screen width
            const finalPlayerX = this.SPLIT_HAND_SPACING / 2;
            const finalSplitX = -this.SPLIT_HAND_SPACING / 2;
            
            // Set positions directly without animation for resize
            this.playerHand.x = finalPlayerX;
            this.splitHand.x = finalSplitX;
        } else {
            this.playerHand.x = 0;  // Default position if no split
            this.playerHand.y = playerY;
        }
    }
    

    /**
     * Initialize hands for a new game
     */
    private initializeHands(): void {
        this.dealerHand.reset();
        this.playerHand.reset();
        if (this.splitHand) {
            this.splitHand.destroy();
            this.splitHand = null;
        }
    }

    /**
     * Highlight the active split hand in the UI
     */
    setActiveSplitHand(hand: 'first' | 'second'): void {
        // Make sure we have both hands
        if (!this.playerHand || !this.splitHand) {
            console.error("Cannot set active split hand - missing hands");
            return;
        }

        if (hand === 'first') {
            // First hand is active (original player hand)
            this.playerHand.highlightActive(true);
            this.splitHand.highlightActive(false);

            // Use opacity for visual differentiation
            if (this.playerHand.pointsDisplay) this.playerHand.pointsDisplay.alpha = 1.0;
            if (this.splitHand.pointsDisplay) this.splitHand.pointsDisplay.alpha = 0.5;
        } else {
            // Second hand is active (split hand)
            this.playerHand.highlightActive(false);
            this.splitHand.highlightActive(true);

            // Use opacity for visual differentiation
            if (this.playerHand.pointsDisplay) this.playerHand.pointsDisplay.alpha = 0.5;
            if (this.splitHand.pointsDisplay) this.splitHand.pointsDisplay.alpha = 1.0;
        }

        // Force card repositioning
        this.resize();
    }

    /**
     * Calculate the value of a hand
     * @returns The hand value
     */
    calculateHandValue(hand: Hand): number {
        if (!hand || !hand.cards || hand.cards.length === 0) return 0;

        let total = 0;
        let aces = 0;

        // First sum non-ace cards
        for (const card of hand.cards) {
            if (card.rank === 'A') {
                aces++;
            } else {
                total += card.value;
            }
        }

        // Then add aces optimally
        for (let i = 0; i < aces; i++) {
            if (total + 11 <= 21) {
                total += 11;
            } else {
                total += 1;
            }
        }

        return total;
    }

    /**
     * Check if a hand is busted (over 21)
     */
    isHandBusted(hand: Hand): boolean {
        return this.calculateHandValue(hand) > 21;
    }

    /**
     * Update visual indicators for busted hands
     */
    updateBustStatus(): void {
        // Update player hand
        if (this.playerHand && this.playerHand.pointsDisplay) {
            const playerBusted = this.isHandBusted(this.playerHand);
            this.playerHand.pointsDisplay.tint = playerBusted ? 0xFF5555 : 0xFFFFFF;
            this.playerHand.pointsDisplay.visible = true;
        }

        // Update split hand
        if (this.splitHand && this.splitHand.pointsDisplay) {
            const splitBusted = this.isHandBusted(this.splitHand);
            this.splitHand.pointsDisplay.tint = splitBusted ? 0xFF5555 : 0xFFFFFF;
            this.splitHand.pointsDisplay.visible = true;
        }

        // Update dealer hand
        if (this.dealerHand && this.dealerHand.pointsDisplay) {
            const dealerBusted = this.isHandBusted(this.dealerHand);
            this.dealerHand.pointsDisplay.tint = dealerBusted ? 0xFF5555 : 0xFFFFFF;
            this.dealerHand.pointsDisplay.visible = true;
        }
    }

    /**
     * Log information about split hands for debugging
     */
    logSplitHandInfo(): void {
        console.log("==== Split Hand Info ====");
        console.log("Active hand:", Globals.activeHand);

        if (this.playerHand) {
            const value = this.calculateHandValue(this.playerHand);
            console.log("Player hand (first):", {
                cards: this.playerHand.cards.map(c => `${c.rank}${c.suit[0]}`),
                value: value,
                busted: value > 21
            });
        }

        if (this.splitHand) {
            const value = this.calculateHandValue(this.splitHand);
            console.log("Split hand (second):", {
                cards: this.splitHand.cards.map(c => `${c.rank}${c.suit[0]}`),
                value: value,
                busted: value > 21
            });
        }

        if (this.dealerHand) {
            const value = this.calculateHandValue(this.dealerHand);
            console.log("Dealer hand:", {
                cards: this.dealerHand.cards.map(c => `${c.rank}${c.suit[0]}`),
                value: value,
                busted: value > 21
            });
        }
        console.log("========================");
    }

    /**
     * Set the visual indicator for when split is available
     * This is a simplified version that just adds a glow or highlight to the cards
     * @param isSplitAvailable Whether split is available
     */
    setSplitAvailableVisual(isSplitAvailable: boolean): void {
        // Set the flag
        this.isSplitAvailable = isSplitAvailable;

        // Early return if we don't have exactly 2 player cards
        if (!this.playerHand || this.playerHand.cards.length !== 2) {
            return;
        }

        // Get the card sprites
        const card1 = this.playerHand.cards[0]?.sprite;
        const card2 = this.playerHand.cards[1]?.sprite;

        if (card1 && card2) {
            if (isSplitAvailable) {
                // Add a subtle highlight or glow
                card1.alpha = 1.0;
                card2.alpha = 1.0;

                // You could add a filter for glow effect if desired
                // card1.filters = [new PIXI.filters.GlowFilter(...)];
                // card2.filters = [new PIXI.filters.GlowFilter(...)];
            } else {
                // Remove the highlight
                card1.alpha = 0.9;
                card2.alpha = 0.9;

                // Remove any filters
                // card1.filters = null;
                // card2.filters = null;
            }
        }
    }

    /**
     * Create a visual transition effect when switching between split hands
     * @param toHand Which hand to highlight as active ('first' or 'second')
     */
    showHandTransition(toHand: 'first' | 'second'): void {
        // Ensure we have both hands
        if (!this.splitHand) return;
        
        // Get references to both hands
        const firstHand = this.playerHand;
        const secondHand = this.splitHand;
        
        // Determine target hand to highlight
        const targetHand = toHand === 'first' ? firstHand : secondHand;
        const otherHand = toHand === 'first' ? secondHand : firstHand;
        
        // Store original scales
        const targetOriginalScale = targetHand.scale.x;
        const otherOriginalScale = otherHand.scale.x;
        
        // Set a visual tint on the points display for active hand
        if (targetHand.pointsDisplay) {
            targetHand.pointsDisplay.tint = 0xFFFFFF;
            targetHand.pointsDisplay.alpha = 1.0;
        }
        
        if (otherHand.pointsDisplay) {
            otherHand.pointsDisplay.tint = 0xDDDDDD;
            otherHand.pointsDisplay.alpha = 0.7;
        }
        
        // Create a pulse animation for the active hand
        new Tween(targetHand.scale,Globals.sceneManager?.tweenGroup)
            .to({ x: targetOriginalScale * 1.1, y: targetOriginalScale * 1.1 }, 300)
            .easing(Easing.Quadratic.Out)
            .onComplete(() => {
                // Return to original scale after pulse
                new Tween(targetHand.scale,Globals.sceneManager?.tweenGroup)
                    .to({ x: targetOriginalScale, y: targetOriginalScale }, 200)
                    .easing(Easing.Quadratic.In)
                    .start();
            })
            .start();
        
        // Slightly shrink the inactive hand
        new Tween(otherHand.scale,Globals.sceneManager?.tweenGroup)
            .to({ x: otherOriginalScale * 0.95, y: otherOriginalScale * 0.95 }, 300)
            .easing(Easing.Quadratic.Out)
            .start();
        
     
    }
}