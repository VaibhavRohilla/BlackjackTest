import { Card, Hand } from "./hand";
import { Container } from "pixi.js";
import { Globals } from "./globals";
import { Tween,Easing } from "@tweenjs/tween.js";
import { log } from "node:console";

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
    private readonly PLAYER_X_OFFSET = 0.25; // 25% from center for player hand in split mode
    private readonly SPLIT_X_OFFSET = -0.25; // -25% from center for split hand
    private readonly PLAYER_Y_OFFSET = 0.40; // Player hands at 40% from top
    private readonly DEALER_Y_OFFSET = -0.25; // Dealer hand at 25% from top
    public readonly SPLIT_ANIMATION_DURATION = 400; // Duration for split animations
    public readonly CARD_DEAL_DELAY = 1500; // Delay between dealing cards
    private readonly MIN_SPLIT_SPACING = 200; // Minimum spacing between split hands in pixels

    // Add lockHandPositions property
    public lockHandPositions: boolean = false;
    // Add a flag to lock player hand position specifically during split
    public lockPlayerHandPosition: boolean = false;

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

    public initializeSplitHand(): boolean {
        if (this.splitHand) return false;

        // Reset the player hand first
        this.playerHand.reset();
        
        console.log("Initializing new split hand with animation.");
        this.splitHand = new Hand('split');
        this.splitHand.setBlackjackDealer(this);
        
        // Lock player hand position to prevent it from being reset
        this.lockPlayerHandPosition = true;
        this.lockHandPositions = true;
        
        // Calculate positions using class constants
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const playerY = screenHeight * this.PLAYER_Y_OFFSET;
        const playerX = screenWidth * this.PLAYER_X_OFFSET;
        const splitX = screenWidth * this.SPLIT_X_OFFSET;
        
        // Set initial positions without animation
        this.playerHand.position.set(0, playerY); // Start from center
        this.splitHand.position.set(0, playerY); // Start from center
        
        // Add to container
        this.cardContainer.addChild(this.splitHand);
        
        // Animate to final positions
        new Tween(this.playerHand.position, Globals.sceneManager?.tweenGroup)
            .to({ x: playerX, y: playerY }, this.SPLIT_ANIMATION_DURATION)
            .easing(Easing.Cubic.Out)
            .start();
            
        new Tween(this.splitHand.position, Globals.sceneManager?.tweenGroup)
            .to({ x: splitX, y: playerY }, this.SPLIT_ANIMATION_DURATION)
            .easing(Easing.Cubic.Out)
            .onComplete(() => {
                // Force final positions after animation
                this.positionSplitHands();
                this.playerHand.updatePointsDisplay(true);
                this.splitHand?.updatePointsDisplay(true);
            })
            .start();
        
        return true;
    }
    
    positionSplitHands(): void {
        if (!this.splitHand) return;
        
        console.log("Positioning split hands");
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const playerY = screenHeight * this.PLAYER_Y_OFFSET;
        
        // Calculate minimum required spacing based on card widths
        const cardWidth = this.playerHand.cards[0]?.sprite?.width || 0;
        const minSpacing = Math.max(this.MIN_SPLIT_SPACING, cardWidth * 1.5); // At least 1.5 card widths
        
        // Calculate positions based on screen width using constants
        let playerX = screenWidth * this.PLAYER_X_OFFSET;
        let splitX = screenWidth * this.SPLIT_X_OFFSET;
        
        // Ensure minimum spacing between hands
        const currentSpacing = Math.abs(playerX - splitX);
        if (currentSpacing < minSpacing) {
            // Adjust positions to maintain minimum spacing
            const adjustment = (minSpacing - currentSpacing) / 2;
            playerX += adjustment;
            splitX -= adjustment;
        }
        
        // Only animate if positions are significantly different and not locked
        const playerDiff = Math.abs(this.playerHand.position.x - playerX);
        const splitDiff = Math.abs(this.splitHand.position.x - splitX);
        
        if (!this.lockHandPositions && (playerDiff > 1 || splitDiff > 1)) {
            console.log(`Animating split positions - player: (${playerX}, ${playerY}), split: (${splitX}, ${playerY})`);
            
            // Animate player hand position
            if (!this.lockPlayerHandPosition) {
                new Tween(this.playerHand.position, Globals.sceneManager?.tweenGroup)
                    .to({ x: playerX, y: playerY }, this.SPLIT_ANIMATION_DURATION)
                    .easing(Easing.Cubic.Out)
                    .start();
            }
            
            // Always animate split hand
            new Tween(this.splitHand.position, Globals.sceneManager?.tweenGroup)
                .to({ x: splitX, y: playerY }, this.SPLIT_ANIMATION_DURATION)
                .easing(Easing.Cubic.Out)
                .start();
        } else {
            // Set positions immediately if difference is small or positions are locked
            if (!this.lockPlayerHandPosition) {
                this.playerHand.position.set(playerX, playerY);
            }
            this.splitHand.position.set(splitX, playerY);
        }
        
        // Lock positions after setting them
        this.lockHandPositions = true;
        this.lockPlayerHandPosition = true;
        
        // Update displays
        this.playerHand.updatePointsDisplay(true);
        this.splitHand.updatePointsDisplay(true);
        
        // Ensure dealer hand stays in position
        this.dealerHand.position.set(0, screenHeight * this.DEALER_Y_OFFSET);
    }
    
    
    
    /**
     * Deal initial cards based on hand data from backend
     */
    async dealInitialCards(playerHand: any, dealerHand: any): Promise<void> {
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

        // Force repositioning with split hands if they exist
        if (this.splitHand) {
            this.forcePlayerHandPosition();
            this.playerHand.resize(true); // Pass true to indicate split is active
            this.positionSplitHands();
        } else {
            this.positionSplitHands();
        }
    }

    /**
     * Deal cards to a hand
     * @param hand The hand to deal to
     * @param card The card to deal
     * @param reposition Whether to reposition the hand after dealing (default: true)
     */
    public async dealCards(hand: Hand, card: Card, reposition: boolean = true): Promise<void> {
        // If dealing to player hand in split mode, force position first
        if (hand === this.playerHand && this.splitHand) {
            this.forcePlayerHandPosition();
        }
        
        await hand.dealCards(card);
        
        // Re-apply position after dealing
        if (hand === this.playerHand && this.splitHand) {
            setTimeout(() => this.forcePlayerHandPosition(), 10);
        }
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
        // Adjust container position
        this.cardContainer.position.set(window.innerWidth / 2, window.innerHeight / 2);
        
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const playerY = screenHeight * this.PLAYER_Y_OFFSET;
        const dealerY = screenHeight * this.DEALER_Y_OFFSET;
        
        // Position dealer hand
        this.dealerHand.x = 0;
        this.dealerHand.y = dealerY;

        if (this.splitHand) {
            // Calculate minimum required spacing based on card widths
            const cardWidth = this.playerHand.cards[0]?.sprite?.width || 0;
            const minSpacing = Math.max(this.MIN_SPLIT_SPACING, cardWidth * 1.5);
            
            // Calculate positions with minimum spacing
            let playerX = screenWidth * this.PLAYER_X_OFFSET;
            let splitX = screenWidth * this.SPLIT_X_OFFSET;
            
            // Ensure minimum spacing between hands
            const currentSpacing = Math.abs(playerX - splitX);
            if (currentSpacing < minSpacing) {
                const adjustment = (minSpacing - currentSpacing) / 2;
                playerX += adjustment;
                splitX -= adjustment;
            }
            
            console.log(`Forcing split positions in resize - player: (${playerX}, ${playerY}), split: (${splitX}, ${playerY})`);
            this.playerHand.position.set(playerX, playerY);
            this.splitHand.position.set(splitX, playerY);
            
            // Lock positions to prevent further resets
            this.lockPlayerHandPosition = true;
            this.lockHandPositions = true;
        } else if (!this.lockPlayerHandPosition) {
            // When no split and not locked, keep player hand centered
            console.log(`Centering player hand in resize to (0, ${playerY})`);
            this.playerHand.position.set(0, playerY);
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

        // Only resize if not during a hit
        if (!this.isCardDealInProgress) {
            this.resize();
        }
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
        if (!this.splitHand) return;
        
        // Get references to both hands
        const firstHand = this.playerHand;
        const secondHand = this.splitHand;
        
        // Determine target hand to highlight
        const targetHand = toHand === 'first' ? firstHand : secondHand;
        const otherHand = toHand === 'first' ? secondHand : firstHand;
        
        // Store references to active tweens
        let activeTweens: Tween<any>[] = [];
        
        // Get all active tweens
        const tweens = Globals.sceneManager?.tweenGroup.getAll() || [];
        tweens.forEach(tween => {
            // Stop any tweens that are animating our hands
            tween.stop();
        });
        
        // Reset scales first
        targetHand.scale.set(1);
        otherHand.scale.set(1);
        
        // Set visual states
        if (targetHand.pointsDisplay) {
            targetHand.pointsDisplay.tint = 0xFFFFFF;
            targetHand.pointsDisplay.alpha = 1.0;
        }
        
        if (otherHand.pointsDisplay) {
            otherHand.pointsDisplay.tint = 0xDDDDDD;
            otherHand.pointsDisplay.alpha = 0.7;
        }
        
        // Animate target hand with scale
        const targetTween = new Tween(targetHand.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 1.1, y: 1.1 }, 200)
            .easing(Easing.Back.Out)
            .yoyo(true)
            .repeat(1)
            .start();
        activeTweens.push(targetTween);
        
        // Animate other hand with scale
        const otherTween = new Tween(otherHand.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 0.95, y: 0.95 }, 200)
            .easing(Easing.Cubic.Out)
            .start();
        activeTweens.push(otherTween);
        
        // Clean up tweens after animation completes
        setTimeout(() => {
            activeTweens.forEach(tween => {
                if (tween.isPlaying()) {
                    tween.stop();
                }
            });
            activeTweens = [];
        }, 400); // After animations complete
    }

    /**
     * Force the player hand position in split mode
     * This ensures it doesn't get reset during card dealing
     */
    public forcePlayerHandPosition(): void {
        if (!this.splitHand) return;
        
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const playerY = screenHeight * this.PLAYER_Y_OFFSET;
        
        // Calculate minimum required spacing based on card widths
        const cardWidth = this.playerHand.cards[0]?.sprite?.width || 0;
        const minSpacing = Math.max(this.MIN_SPLIT_SPACING, cardWidth * 1.5);
        
        // Calculate position with minimum spacing
        let playerX = screenWidth * this.PLAYER_X_OFFSET;
        const splitX = screenWidth * this.SPLIT_X_OFFSET;
        
        // Ensure minimum spacing between hands
        const currentSpacing = Math.abs(playerX - splitX);
        if (currentSpacing < minSpacing) {
            playerX = splitX + minSpacing;
        }
        
        console.log(`Forcing player hand position to (${playerX}, ${playerY})`);
        this.playerHand.position.set(playerX, playerY);
        
        // Lock the position
        this.lockPlayerHandPosition = true;
    }
}