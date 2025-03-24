import { Card, Hand } from "./hand";
import { Container } from "pixi.js";
import { Globals } from "./globals";

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
    
    // Add tracking for current positions to prevent teleporting
    private _playerHandLastX: number = 0;
    private _splitHandLastX: number = 0;
    private _positionsInitialized: boolean = false;

    /**
     * Create a new blackjack dealer
     */
    constructor() {
        super();
        this.initializeHands();

        // Add hand containers to the card container
        this.cardContainer.addChild(this.playerHand);
        this.cardContainer.addChild(this.dealerHand);

        // Add card container to this container
        this.addChild(this.cardContainer);
        
        // Initialize position tracking
        this._playerHandLastX = 0;
        this._splitHandLastX = 0;
        
        this.resize();
    }

    /**
     * Initialize split hand for UI with smooth animation
     * @returns Whether a new hand was created
     */
    initializeSplitHand(): boolean {
        // Check if split hand already exists
        if (this.splitHand) {
            console.log("Split hand already exists, reusing existing hand");
            return false;
        }

        console.log("Initializing new split hand with animation");
        
        // Get current player hand position for animation reference
        const originalX = this.playerHand.x;
        const originalY = this.playerHand.y;
        console.log(`Original player hand position: (${originalX}, ${originalY})`);
        
        try {
            // Import Tween and Easing if not available globally
            const { Tween, Easing } = require("@tweenjs/tween.js");
            
            // Calculate target positions based on window size
            const windowWidth = window.innerWidth;
            const targetPlayerX = this.FINAL_PLAYER_X;
            const targetSplitX = this.FINAL_SPLIT_X;
            
            // Store current positions for state tracking
            this._playerHandLastX = originalX;
            
            // Create a tween for the player hand moving right
            new Tween(this.playerHand)
                .to({ x: targetPlayerX }, 400) // 400ms animation
                .easing(Easing.Cubic.Out) // Smooth deceleration
                .onUpdate(() => {
                    // Update position tracking during animation
                    this._playerHandLastX = this.playerHand.x;
                })
                .onComplete(() => {
                    console.log("Player hand animation complete, creating split hand");
                    
                    // Update position tracking
                    this._playerHandLastX = targetPlayerX;
                    
                    // Create the split hand after the animation completes
                    if (!this.splitHand) {
                        this.splitHand = new Hand('split');
                        this.cardContainer.addChild(this.splitHand);
                        
                        // Set initial position and scale for the split hand
                        this.splitHand.x = originalX; // Start at player's original position
                        this.splitHand.y = originalY;
                        this.splitHand.alpha = 0; // Start transparent
                        
                        // Initialize tracking for split hand
                        this._splitHandLastX = originalX;
                        
                        console.log(`Created split hand at (${this.splitHand.x}, ${this.splitHand.y})`);
                        
                        // Create a local reference to splitHand to avoid null checks in the closure
                        const splitHand = this.splitHand;
                        
                        // Animate the split hand appearing
                        new Tween(splitHand)
                            .to({ 
                                x: targetSplitX, // Final left position
                                alpha: 1 
                            }, 400)
                            .easing(Easing.Cubic.Out)
                            .onUpdate(() => {
                                // Only update tracking if we still have a reference to the split hand
                                if (this.splitHand === splitHand) {
                                    this._splitHandLastX = splitHand.x;
                                }
                            })
                            .onComplete(() => {
                                // Only update positions if the split hand is still the same instance
                                if (this.splitHand === splitHand) {
                                    // Ensure final positions are exact (no rounding errors)
                                    this.playerHand.x = targetPlayerX;
                                    this.splitHand.x = targetSplitX;
                                    this._splitHandLastX = targetSplitX;
                                    
                                    // Mark positions as initialized
                                    this._positionsInitialized = true;
                                    
                                    console.log("Split hand animation complete with final positions:", 
                                        `player (${this.playerHand.x}), split (${this.splitHand.x})`);
                                }
                            })
                            .start();
                    }
                })
                .start();
            
            // We need to ensure the tween updates are processed
            if (Globals.sceneManager && Globals.sceneManager.tweenGroup) {
                // If using a scene manager with tween group
                Globals.sceneManager.tweenGroup.add(new Tween({}));
            }
        } catch (error) {
            console.error("Error during split animation:", error);
            // Fallback to immediate creation without animation
            if (!this.splitHand) {
                this.splitHand = new Hand('split');
                this.cardContainer.addChild(this.splitHand);
                
                // Set positions directly using the same constants
                this.splitHand.x = this.FINAL_SPLIT_X;
                this.playerHand.x = this.FINAL_PLAYER_X;
                
                // Update position tracking
                this._playerHandLastX = this.FINAL_PLAYER_X;
                this._splitHandLastX = this.FINAL_SPLIT_X;
                
                // Mark positions as initialized
                this._positionsInitialized = true;
                
                // Ensure resize is called
                this.resize();
            }
        }
        
        return true;
    }
    
    /**
     * Set final positions for both hands after split
     * This ensures consistent positioning regardless of screen size
     */
    positionSplitHands(): void {
        if (!this.splitHand) return;
        
        // Calculate target positions based on window width
        const targetPlayerX = this.FINAL_PLAYER_X;
        const targetSplitX = this.FINAL_SPLIT_X;
        
        // Check if positions already match targets
        const playerPosMatches = Math.abs(this.playerHand.x - targetPlayerX) < 1;
        const splitPosMatches = Math.abs(this.splitHand.x - targetSplitX) < 1;
        
        // Only log if positions are changing
        if (!playerPosMatches || !splitPosMatches) {
            console.log(`Repositioning split hands from: player (${this.playerHand.x}), split (${this.splitHand.x})`);
        }
        
        // If positions match and have been initialized, no need to reposition
        if (this._positionsInitialized && playerPosMatches && splitPosMatches) {
            return;
        }
        
        // Use smooth transitions if positions have moved significantly
        if (this._positionsInitialized && 
            (Math.abs(this.playerHand.x - this._playerHandLastX) > 5 || 
             Math.abs(this.splitHand.x - this._splitHandLastX) > 5)) {
            
            try {
                const { Tween, Easing } = require("@tweenjs/tween.js");
                
                // Create smooth tween transitions
                new Tween(this.playerHand)
                    .to({ x: targetPlayerX }, 200)
                    .easing(Easing.Cubic.Out)
                    .onUpdate(() => {
                        this._playerHandLastX = this.playerHand.x;
                    })
                    .start();
                    
                const splitHand = this.splitHand;
                
                new Tween(splitHand)
                    .to({ x: targetSplitX }, 200)
                    .easing(Easing.Cubic.Out)
                    .onUpdate(() => {
                        if (this.splitHand === splitHand) {
                            this._splitHandLastX = splitHand.x;
                        }
                    })
                    .onComplete(() => {
                        if (this.splitHand === splitHand) {
                            console.log(`Split hand smooth repositioning complete: player (${this.playerHand.x}), split (${this.splitHand.x})`);
                        }
                    })
                    .start();
                
                if (Globals.sceneManager?.tweenGroup) {
                    Globals.sceneManager.tweenGroup.add(new Tween({}));
                }
                
                return;
            } catch (error) {
                console.error("Error during position tweening:", error);
            }
        }
        
        // Set positions directly if needed
        this.playerHand.x = targetPlayerX;
        this.splitHand.x = targetSplitX;
        
        // Update position tracking
        this._playerHandLastX = targetPlayerX;
        this._splitHandLastX = targetSplitX;
        
        // Mark positions as initialized
        this._positionsInitialized = true;
        
        // Log final positions
        console.log(`Final split hand positions: player (${this.playerHand.x}), split (${this.splitHand.x})`);
    }

    /**
     * Deal cards from backend data with animation
     * @param playerHand The player hand data from backend
     * @param dealerHand The dealer hand data from backend 
     * @returns Promise that resolves when all cards are dealt
     */
    dealCards(playerHand: any, dealerHand: any): Promise<void> {
        console.log("Dealing initial cards from backend data");
        
        // Print detailed card information for debugging
        console.log("Player hand data:", JSON.stringify(playerHand.cards));
        console.log("Dealer hand data:", JSON.stringify(dealerHand.cards));
        
        // Set flag to prevent premature button display
        this.isCardDealInProgress = true;
        
        // Reset hands first
        this.playerHand.reset();
        this.dealerHand.reset();
        
        // Make sure hands are visible
        this.playerHand.visible = true;
        this.dealerHand.visible = true;
        
        // Return a promise that resolves when all cards are dealt
        return new Promise<void>(async (resolve) => {
            // Make sure we have valid data
            if (!playerHand || !playerHand.cards || !dealerHand || !dealerHand.cards) {
                console.error("Invalid hand data received from backend");
                this.isCardDealInProgress = false;
                resolve();
                return;
            }
            
            try {
                // Deal player's first card
                if (playerHand.cards.length > 0) {
                    await this.playerHand.dealCards(playerHand.cards[0]);
                    console.log("Player's first card dealt");
                }
                
                // Deal dealer's first card
                if (dealerHand.cards.length > 0) {
                    await this.dealerHand.dealCards(dealerHand.cards[0]);
                    console.log("Dealer's first card dealt");
                }
                
                // Deal player's second card
                if (playerHand.cards.length > 1) {
                    await this.playerHand.dealCards(playerHand.cards[1]);
                    console.log("Player's second card dealt");
                }
                
                // Deal dealer's second card (face down if not specified)
                if (dealerHand.cards.length > 1) {
                    const secondCard = dealerHand.cards[1];
                    // Check if the card is already face down in the data
                    if (secondCard.faceUp === false) {
                        // It's already face down, just deal it
                        await this.dealerHand.dealCards(secondCard);
                        console.log("Dealer's second card dealt (face down)");
                    } else {
                        // Create a face-down version of the card
                        const faceDownCard = {
                            ...secondCard,
                            faceUp: false,
                            // Save original card data to use when revealing
                            originalCard: secondCard
                        };
                        await this.dealerHand.dealCards(faceDownCard);
                        console.log("Dealer's second card dealt (converted to face down)");
                    }
                }
                
                // Update display of hand values
                console.log("Updating points displays");
                this.playerHand.updatePointsDisplay?.(true);
                this.dealerHand.updatePointsDisplay?.(true);
                
                // Check for blackjack visibility
                if (playerHand.blackjack) {
                    // Ensure blackjack status is visible if needed
                    console.log("Player has blackjack - showing status");
                    this.playerHand.blackjack = true;
                }
                
                console.log("All initial cards have been dealt");
                
                // Release the card dealing lock
                this.isCardDealInProgress = false;
                
                // Resolve the promise to signal completion
                resolve();
            } catch (error) {
                console.error("Error dealing cards:", error);
                this.isCardDealInProgress = false;
                resolve(); // Resolve anyway to prevent blocking the game
            }
        });
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
        // Set card container in center of screen
        this.cardContainer.position.set(window.innerWidth / 2, window.innerHeight / 2);

        const hasSplit = this.splitHand !== null;

        // Resize all hands
        this.dealerHand.resize(hasSplit);
        this.playerHand.resize(hasSplit);

        if (hasSplit) {
            this.splitHand?.resize(true);
            
            // Use the dedicated function for positioning split hands
            this.positionSplitHands();
        } else {
            // Reset player hand position if no split
            this.playerHand.x = 0;
            this.playerHand.scale.set(1.0);
            this._playerHandLastX = 0;
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
        if (!this.playerHand || !this.splitHand) {
            console.error("Cannot set active split hand - missing hands");
            return;
        }

        // Update visual state for both hands
        if (hand === 'first') {
            this.playerHand.highlightActive(true);
            this.splitHand.highlightActive(false);
            
            // Ensure proper opacity and scale
            if (this.playerHand.pointsDisplay) {
                this.playerHand.pointsDisplay.alpha = 1.0;
                this.playerHand.pointsDisplay.scale.set(1.2);
            }
            if (this.splitHand.pointsDisplay) {
                this.splitHand.pointsDisplay.alpha = 0.5;
                this.splitHand.pointsDisplay.scale.set(1.0);
            }
        } else {
            this.playerHand.highlightActive(false);
            this.splitHand.highlightActive(true);
            
            // Ensure proper opacity and scale
            if (this.playerHand.pointsDisplay) {
                this.playerHand.pointsDisplay.alpha = 0.5;
                this.playerHand.pointsDisplay.scale.set(1.0);
            }
            if (this.splitHand.pointsDisplay) {
                this.splitHand.pointsDisplay.alpha = 1.0;
                this.splitHand.pointsDisplay.scale.set(1.2);
            }
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
            
            // Update card opacity for busted hand
            this.playerHand.cards.forEach(card => {
                if (card.sprite) {
                    card.sprite.alpha = playerBusted ? 0.7 : 1.0;
                }
            });
        }

        // Update split hand
        if (this.splitHand && this.splitHand.pointsDisplay) {
            const splitBusted = this.isHandBusted(this.splitHand);
            this.splitHand.pointsDisplay.tint = splitBusted ? 0xFF5555 : 0xFFFFFF;
            this.splitHand.pointsDisplay.visible = true;
            
            // Update card opacity for busted hand
            this.splitHand.cards.forEach(card => {
                if (card.sprite) {
                    card.sprite.alpha = splitBusted ? 0.7 : 1.0;
                }
            });
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
}