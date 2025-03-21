import { Container, Sprite, Texture } from "pixi.js";
import { TextLabel } from "./textlabel";
import { config } from "./appconfig";
import { Globals } from "./globals";
import { Easing, Tween } from "@tweenjs/tween.js";

export class Hand extends Container {

    
    /** Dealer points text */
    pointsText: TextLabel = new TextLabel(0,0,0.5,"",20,0x000000);
    
    /** Split hand points display */
    pointsDisplay: Sprite  = new Sprite(Globals.resources.PointsHolder);

     points : number = 0;
     
    /** Animation speed for dealing cards (ms) */
    dealAnimationSpeed: number = 1000;

     cards: Card[] = [];

     value: number = 0;
     blackjack: boolean = false;
     busted: boolean = false;
     soft: boolean = false;
     /** Indicates if the hand was surrendered */
     surrendered: boolean = false;
     
    /** Callback for when card reveal animation completes */
    onCardRevealComplete?: () => void;

    constructor(public type: 'player' | 'dealer' | 'split') {
        super();
        this.initializePointsDisplay();
    }

    initializePointsDisplay() {
        this.pointsText.style.fontWeight = "bold";
        this.addChild(this.pointsDisplay);
        this.pointsDisplay.addChild(this.pointsText);
        this.pointsDisplay.visible = false;
        this.pointsDisplay.anchor.set(0.5);
    }
  
/**
     * Reveal dealer's hole card
     * @param holeCardValue Optional explicit value for the hole card
     */
revealDealerCard(holeCardValue?: number): void {
    // Check if dealer has at least 2 cards
    if (this.type != 'dealer' || !this.cards || this.cards.length < 2) {
        console.error("Cannot reveal dealer card: dealer doesn't have enough cards");
        return;
    }
    
    const holeCard = this.cards[1];
    
    // Check if hole card exists and has required properties
    if (!holeCard) {
        console.error("Cannot reveal dealer card: hole card is undefined");
        return;
    }
    
    // Only flip the card if it's face down and has a sprite
    if (!holeCard.faceUp && holeCard.sprite) {
        console.log("Revealing dealer's hole card");
        
        // Mark the card as face up
        holeCard.faceUp = true;
        
        // If explicit hole card value provided (from stored dealer hole card), use it
        if (holeCardValue !== undefined) {
            console.log(`Setting hole card value to ${holeCardValue}`);
            holeCard.value = holeCardValue;
            // Recalculate hand value with the now valued card
            this.calculateValue();
        }
        
        // Get the face-up texture
        const faceUpTexture = Globals.resources[holeCard.spriteKey];
        
        // Animate card flip
        this.animateCardFlip(holeCard.sprite, faceUpTexture);
        
        // Update points display after the card flip animation completes
        setTimeout(() => {
            console.log("Updating points display after dealer card reveal");
            this.updatePointsDisplay(true);
            
            // Reposition points displays to ensure they're in the right place
            this.positionPointsDisplay();
        }, 100); // Delay to match the card flip animation duration
    } else {
        console.log("Dealer's hole card is already face up or has no sprite");
        
        // Update points display immediately if the card is already face up
        this.updatePointsDisplay(true);
    }
}
     /**
     * Animate a card flipping over
     * @param sprite - The card sprite to flip
     * @param newTexture - The texture to show after flipping
     */
     animateCardFlip(sprite: Sprite, newTexture: Texture): void {
        // Store original position and scale
        const originalScale = { x: sprite.scale.x, y: sprite.scale.y };
        const originalPosition = { x: sprite.position.x, y: sprite.position.y };
        const originalRotation = sprite.rotation;
        
        // Make sure the sprite is visible
        sprite.visible = true;
        
        // Add a slight "pop up" effect during flip
        new Tween(sprite.position, Globals.sceneManager?.tweenGroup)
            .to({ 
                y: originalPosition.y - 20 // Move up slightly
            }, 150)
            .easing(Easing.Cubic.Out)
            .start();
            
        // Add a slight rotation during flip for more dynamic feel
        new Tween(sprite, Globals.sceneManager?.tweenGroup)
            .to({ 
                rotation: originalRotation + Math.PI * 0.05 // Slight tilt
            }, 150)
            .easing(Easing.Cubic.Out)
            .start();
        
        // First half of flip - scale x to 0
        new Tween(sprite.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 0 }, 150)
            .easing(Easing.Cubic.In)
            .onComplete(() => {
                // Change texture at the middle of the flip
                sprite.texture = newTexture;
                
                // Second half of flip - scale x back to original
                new Tween(sprite.scale, Globals.sceneManager?.tweenGroup)
                    .to({ x: originalScale.x }, 150)
                    .easing(Easing.Cubic.Out)
                    .start();
                    
                // Return to original position and rotation
                new Tween(sprite.position, Globals.sceneManager?.tweenGroup)
                    .to({ 
                        y: originalPosition.y
                    }, 150)
                    .easing(Easing.Back.Out) // Add a slight bounce
                    .start();
                    
                new Tween(sprite, Globals.sceneManager?.tweenGroup)
                    .to({ 
                        rotation: originalRotation
                    }, 150)
                    .easing(Easing.Back.Out)
                    .start();
            })
            .start();
            
        // Add a slight scale pulse at the end of the flip
        const pulseDuration = 100;
        const totalDuration = 300 + pulseDuration; // 300ms for flip, 100ms for pulse
        
        // Create a new tween for the final pulse and callback
        new Tween({}, Globals.sceneManager?.tweenGroup)
            .to({}, totalDuration)
            .onComplete(() => {
                // Create pulse effect
                new Tween(sprite.scale, Globals.sceneManager?.tweenGroup)
                    .to({ 
                        x: originalScale.x * 1.1,
                        y: originalScale.y * 1.1
                    }, pulseDuration)
                    .easing(Easing.Cubic.Out)
                    .yoyo(true)
                    .repeat(1)
                    .onComplete(() => {
                        // Ensure points display is updated after all animations complete
                        this.updatePointsDisplay(true);
                        
                        // Call the completion callback if provided
                        if (this.onCardRevealComplete) {
                            this.onCardRevealComplete();
                        }
                    })
                    .start();
            })
            .start();
    }
    /**
     * Add a card to the hand
     * @param card - The card to add
     */
    public addCard(card: Card): void {
        this.cards.push(card);
        this.calculateValue();
        
        // Ensure points display is visible and positioned correctly
        this.pointsDisplay.visible = true;
        this.updatePointsDisplay(true);
    }
   
    /**
     * Deal a card with error handling
     * @param hand - The hand to deal to
     * @param faceUp - Whether the card should be face up
     * @returns A promise that resolves with the dealt card
     */
    dealCardWithErrorHandling(faceUp: boolean): Promise<Card | null> {
        return new Promise((resolve) => {
            try {
                if (!Globals.deck) {
                    console.error("Deck is not initialized");
                    resolve(null);
                    return;
                }
                
            // Get a card from the deck
            const card = Globals.deck.dealCard();
            card.faceUp = faceUp;
            
            // Create sprite for the card
                this.createCardSprite(card);
            
            // Add card to hand
            this.addCard(card);
            
            // Add sprite to hand container
            if (card.sprite) {
                this.addChild(card.sprite);
                
                // Position the card
                    this.positionCardsInHand(this);
                
                // Animate the card with the enhanced animation
                    this.animateCardToHand(card, this);
                    
                    // Add a longer delay to ensure animation completes including rotation and bounce
                setTimeout(() => {
                        // Update points display
                        this.updatePointsDisplay(true);
                        
                        // Resolve with the card
                    resolve(card);
                    }, this.dealAnimationSpeed + 150); // Increased delay for enhanced animation
            } else {
                resolve(card);
                }
            } catch (error) {
                console.error("Error dealing card:", error);
                resolve(null);
            }
        });
    }
    /**
     * Calculate the value of the hand
     * @param includeHidden - Whether to include face-down cards in calculation (default: false)
     * @returns The calculated value of the hand
     */
    public calculateValue(includeHidden: boolean = false): number {
        let sum = 0;
        let aces = 0;
        this.soft = false;
        
        // Go through each card
        for (const card of this.cards) {
            // Skip face-down cards unless includeHidden is true
            if (!card.faceUp && !includeHidden) {
                continue;
            }
            
            // Add card value to sum
            sum += card.value;
            
            // Count aces
            if (card.rank === 'A') {
                aces++;
            }
        }
        
        // Convert aces from 11 to 1 if necessary to avoid busting
        while (sum > 21 && aces > 0) {
            sum -= 10; // Convert one ace from 11 to 1
            aces--;
        }
        
        // Mark hand as soft if at least one ace is counted as 11
        if (aces > 0 && sum <= 21) {
            this.soft = true;
        }
        
        // Check if hand is busted
        this.busted = sum > 21;
        
        // Update hand value
        this.value = sum;
        
        // Check for blackjack
        if (this.cards.length === 2 && sum === 21) {
            this.blackjack = true;
        }
        
        // Return calculated value
        return sum;
    }
    
    /**
     * Get the total value of the hand including face-down cards
     * @returns The total value of all cards in the hand
     */
    public getTotalValue(): number {
        return this.calculateValue(true);
    }
    
    /**
     * Get the visible value of the hand (only face-up cards)
     * @returns The visible value of the hand
     */
    getVisibleValue(): number {
        return this.calculateValue(false);
    }

      /**
     * Create a card sprite
     * @param card - The card to create a sprite for
     */
      createCardSprite(card: Card): void {
        // Determine which texture to use based on whether the card is face up
        const textureKey = card.faceUp ? card.spriteKey : 'cardBack';
        
        // Create sprite
        const sprite = new Sprite(Globals.resources[textureKey]);
        
        // Set anchor to center
        sprite.anchor.set(0.5);
        
        // Calculate card scale based on current screen dimensions
        const cardScale = this.calculateCardScale();
        
        // Scale card with the calculated scale
        sprite.scale.set(cardScale);
        
        // Store sprite in card
        card.sprite = sprite;
        
        // Initial properties for animation
        // We'll set the actual position in animateCardToHand
        sprite.alpha = 0; // Start invisible
        
        // Fade in quickly
        new Tween(sprite, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 1 }, 100)
            .start();
    }

    

     /**
     * Calculate the appropriate scale for cards based on screen dimensions
     * @returns The scale factor to apply to cards
     */
     calculateCardScale(): number {
        // Base card size on screen dimensions for consistency
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isPortrait = screenHeight > screenWidth;
        
        // Use different scaling factors for mobile vs desktop
        // For mobile (portrait), we want relatively larger cards
        let baseScale;
        if (isPortrait) {
            // In portrait mode (mobile), make cards larger relative to screen width
            baseScale = screenWidth * 0.22; // Increased from 0.18 to 0.22 for mobile
        } else {
            // In landscape mode, use the smaller dimension but with a larger factor
            baseScale = Math.min(screenWidth, screenHeight) * 0.20; // Increased from 0.18 to 0.20
        }
        
        // Apply global scale factor
        const cardScale = baseScale / 225; // Assuming the card texture is roughly 225px wide
        
        // Add minimum scale to prevent cards from being too small on any device
        const minScale = 0.7; // Minimum scale factor
        
        // Return the larger of the calculated scale and minimum scale
        return Math.max(cardScale * config.scaleFactor, minScale);
    }

    resize() {
        this.positionCardsInHand(this);
        // const playerY = screenHeight * 0.35; // Player hand at 25% from bottom
        // const dealerY = -screenHeight * 0.25; // Dealer hand at 25% from top
        
    }
    /**
     * Get the consistent overlap factor for cards
     * @returns The overlap factor to use for card positioning
     */
    getCardOverlapFactor(): number {
        // Increase overlap factor for a tighter, more professional look
        return 0.4; // 50% overlap for all devices (changed from 0.7 which is 70% overlap)
    }
    
    /**
     * Calculate the maximum number of cards that can fit in the available width
     * @param availableWidth - The available width for cards
     * @param cardWidth - The width of a single card
     * @param overlapFactor - The overlap factor to use
     * @returns The maximum number of cards that can fit
     */
     calculateMaxVisibleCards(availableWidth: number, cardWidth: number, overlapFactor: number): number {
        // Calculate the effective width of each card after overlap
        const effectiveCardWidth = cardWidth * (1 - overlapFactor);
        
        // Calculate how many cards can fit in the available width
        // We need at least one full card visible plus partial cards
        const maxCards = Math.max(3, Math.floor((availableWidth - cardWidth) / effectiveCardWidth) + 1);
        
        console.log(`Max visible cards: ${maxCards} (availableWidth: ${availableWidth}, cardWidth: ${cardWidth}, effectiveWidth: ${effectiveCardWidth})`);
        
        return maxCards;
    }
    
    /**
     * Calculate card positions for a hand
     * This is a helper method to ensure consistent positioning across all methods
     * @param hand - The hand to calculate positions for
     * @param cardScale - The scale to use for cards
     * @returns An array of positions for each card
     */
     calculateCardPositions(hand: Hand, cardScale: number): { positions: {x: number, y: number}[], cardWidth: number, cardHeight: number } {
        const cardCount = hand.cards.length;
        if (cardCount === 0) return { positions: [], cardWidth: 0, cardHeight: 0 };
        
        // Calculate card dimensions based on scale
        const cardWidth = 225 * cardScale; // Assuming card texture width is 225px
        const cardHeight = cardWidth * 1.4; // Standard card ratio
        
        // Use the consistent overlap factor
        const overlapFactor = this.getCardOverlapFactor();
        
        // Get screen dimensions
        const screenWidth = window.innerWidth;
      
        
        // Calculate available width for cards (consistent percentage of screen width)
        const availableWidth = screenWidth * 0.85; // Use 85% of screen width for all orientations
        
       
        // Calculate the effective width of each card after overlap
        const effectiveCardWidth = cardWidth/2 * (1 - overlapFactor) ;
        
        // Calculate the total width needed for all cards with overlap
        const totalWidth = cardCount > 1 ? effectiveCardWidth * (cardCount - 1) + cardWidth : cardWidth;
        
        // Calculate starting X position (centered)
        const startX = -totalWidth / 2 + cardWidth / 2;
        
        // Calculate positions for each card
        const positions: {x: number, y: number}[] = [];
        
        for (let index = 0; index < cardCount; index++) {
            // Calculate position with overlap - always centered
            const x = startX + index * effectiveCardWidth;
            const y = 0; // Flat layout
            
            positions.push({ x, y });
        }
        
        console.log(`Calculated ${positions.length} card positions with cardWidth: ${cardWidth}, overlap: ${overlapFactor}, totalWidth: ${totalWidth}`);
        
        return { positions, cardWidth, cardHeight };
    }


    /**
     * Position cards in a hand
     * @param hand - The hand to position cards in
     */
    positionCardsInHand(hand: Hand): void {
        const cardCount = hand.cards.length;
        if (cardCount === 0) return;
        
        // Use the consistent card scale calculation
        const cardScale = this.calculateCardScale();
        
        // Calculate positions using the shared helper method
        const { positions, cardWidth, cardHeight } = this.calculateCardPositions(hand, cardScale);
        
        // Position each card with animation
        hand.cards.forEach((card, index) => {
            if (card.sprite && index < positions.length) {
                // Ensure the card has the correct scale
                card.sprite.scale.set(cardScale);
                
                // Get the calculated position
                const { x, y } = positions[index];
                
                // Update card's target position
                card.targetPosition = {
                    x: x,
                    y: y,
                    index: index
                };
                
                // Set z-index based on card position
                card.sprite.zIndex = index;
            }
        });
        
        // Position the points display after cards are positioned
        this.positionPointsDisplay();
    }
    
    /**
     * Animate a card from the deck position to its position in the hand
     * @param card - The card to animate
     * @param hand - The hand the card is being dealt to
     */
     animateCardToHand(card: Card, hand: Hand): void {
        if (!card.sprite) return;
        
        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Use the consistent card scale calculation
        const cardScale = this.calculateCardScale();
        
        // Ensure the card has the correct scale
        card.sprite.scale.set(cardScale);
        
        // Calculate positions using the shared helper method
        const { positions, cardWidth, cardHeight } = this.calculateCardPositions(hand, cardScale);
        
        // Calculate the index of this card (it's the last card in the hand)
        const cardIndex = hand.cards.length - 1;
        
        // Get the target position for this card
        const targetPosition = positions[cardIndex] || { x: 0, y: 0 };
        const targetX = targetPosition.x;
        const targetY = targetPosition.y;
        
        // Store target position in the card object for future reference
        card.targetPosition = {
            x: targetX,
            y: targetY,
            index: cardIndex
        };
        
        // Set z-index (render order) based on card position
        // Later cards should appear on top of earlier cards
        card.sprite.zIndex = cardIndex;
        
        // New: Start position from left corner of the screen
        const startX = -screenWidth / 2 + cardWidth / 2; // Left edge of screen
        const startY = screenHeight / 2 - cardHeight / 2; // Bottom edge of screen
        
        // Set initial position (left corner)
        card.sprite.position.set(startX, startY);
        
        // Set initial rotation (a bit tilted)
        card.sprite.rotation = -Math.PI / 4; // -45 degrees
        
        // Calculate a curved path from left corner to the target position
        const controlPoint = {
            x: (startX + targetX) / 2 - 50, // Control point slightly offset to create curve
            y: Math.min(startY, targetY) - 100 // Control point above the path for an arc
        };
        
        // Animation duration
        const duration = this.dealAnimationSpeed;
        
        // Create a progress tween from 0 to 1
        const progress = { value: 0 };
        
        // Store sprite reference for use in tweens to avoid null checks inside callbacks
        const sprite = card.sprite;
        
        new Tween(progress, Globals.sceneManager?.tweenGroup)
            .to({ value: 1 }, duration)
            .easing(Easing.Cubic.Out) // Smoother deceleration
            .onUpdate(() => {
                // Calculate position using quadratic Bezier curve
                const t = progress.value;
                
                // Quadratic Bezier curve formula: P = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
                const x = Math.pow(1-t, 2) * startX + 
                          2 * (1-t) * t * controlPoint.x + 
                          Math.pow(t, 2) * targetX;
                
                const y = Math.pow(1-t, 2) * startY + 
                          2 * (1-t) * t * controlPoint.y + 
                          Math.pow(t, 2) * targetY;
                
                // Update sprite position
                sprite.position.set(x, y);
                
                // Rotate from starting rotation to 0 (upright)
                sprite.rotation = -Math.PI / 4 * (1 - t) + (Math.PI * 2 * t); // Rotate a full 360° + ending at 0
            })
            .start();
            
        // Add a slight scale bounce at the end
        new Tween({}, Globals.sceneManager?.tweenGroup)
            .to({}, duration)
            .onComplete(() => {
                // Create bounce effect
                new Tween(sprite.scale, Globals.sceneManager?.tweenGroup)
                    .to({ 
                        x: cardScale * 1.1,
                        y: cardScale * 1.1
                    }, 100)
                    .easing(Easing.Cubic.Out)
                    .yoyo(true)
                    .repeat(1)
                    .start();
            })
            .start();
    }
    
    /**
     * Update the value of a hand
     * This is redundant with calculateValue and is kept for backward compatibility
     * @param hand - The hand to update
     */
    updateHandValue(hand: Hand): void {
        // Just call calculateValue for consistency
        hand.calculateValue();
    }
    updatePointsDisplay(animate: boolean = true): void {
        // Make sure points display is visible
        this.pointsDisplay.visible = true;
        
        // Update points text to show hand value
        let points = 0;
        
        // If the game is in progress and the second card is face down, only show the value of the first card
        if (this.cards.length > 1 && !this.cards[1].faceUp) {
            points = this.cards[0].value;
        } else {
            points = this.calculateValue();
        }
        
        this.points = points;
        this.pointsText.updateLabelText(points.toString());
        
        if (animate) {
            this.animatePointsDisplay();
        }
    }
    animatePointsDisplay(): void {
        // Store original scale
        const originalScale = { x: this.pointsDisplay.scale.x, y: this.pointsDisplay.scale.y };
        
        // First, scale up slightly
        new Tween(this.pointsDisplay.scale, Globals.sceneManager?.tweenGroup)
            .to({ 
                x: originalScale.x * 1.2, 
                y: originalScale.y * 1.2 
            }, 150)
            .easing(Easing.Back.Out)
            .onComplete(() => {
                // Then scale back to original size
                new Tween(this.pointsDisplay.scale, Globals.sceneManager?.tweenGroup)
                    .to({ 
                        x: originalScale.x, 
                        y: originalScale.y 
                    }, 150)
                    .easing(Easing.Back.Out)
                    .start();
            })
            .start();
    }

    
    public reset(): void {
        // Clear all sprites and reset display
        this.clearSprites();
        
        // Reset hand state
        this.cards = [];
        this.value = 0;
        this.blackjack = false;
        this.busted = false;
        this.soft = false;
        this.surrendered = false;
    }

    /**
     * Position the points display relative to the cards
     */
    private positionPointsDisplay(): void {
        if (this.cards.length === 0) return;
        
        // Get the last card's position
        const lastCard = this.cards[this.cards.length - 1];
        if (!lastCard.sprite) return;
        
        this.pointsDisplay.position.set(
            lastCard.sprite.position.x,
            lastCard.sprite.position.y - lastCard.sprite.height/2  - this.pointsDisplay.height/2// Adjust this value as needed
        );

        if(this.type === 'dealer'){
        // Position points display above the last card
        this.pointsDisplay.position.set(
            0,
            lastCard.sprite.position.y + lastCard.sprite.height/2 + this.pointsDisplay.height/2 // Adjust this value as needed
        );
    }
}

    /**
     * Clear all sprites and reset the hand display
     */
    public clearSprites(): void {
        // Remove all card sprites
        this.cards.forEach(card => {
            if (card.sprite) {
                this.removeChild(card.sprite);
                card.sprite = undefined;
            }
        });
        
        // Reset points display
        this.pointsDisplay.visible = false;
        this.pointsText.updateLabelText("");
        this.points = 0;
    }
} 
/**
 * Represents a hand of cards
 */
export interface Hand {
    /** Cards in the hand */
    cards: Card[];
    
    /** Total value of the hand */
    value: number;
    
    /** Whether the hand has an ace that can be counted as 11 */
    soft: boolean;
    
    /** Whether the hand is busted (value > 21) */
    busted: boolean;
    
    /** Whether the hand is a blackjack (21 with 2 cards) */
    blackjack: boolean;
    
    
    /** Type of hand - player, dealer, or split */
    type: 'player' | 'dealer' | 'split';
    
    /** Callback for when card reveal animation completes */
    onCardRevealComplete?: () => void;
    
    /**
     * Add a card to the hand
     * @param card - The card to add
     */
    addCard(card: Card): void;
    
    /**
     * Calculate the value of the hand
     * @returns The calculated value
     */
    calculateValue(): number;
    
    /**
     * Get the visible value of the hand (for dealer's hand when hole card is hidden)
     * @returns The visible value of the hand
     */
    getVisibleValue(): number;
    
    /**
     * Reset the hand to its initial state
     */
    reset(): void;
    
    /**
     * Update points display for the hand
     * @param animate - Whether to animate the update
     */
    updatePointsDisplay(animate?: boolean): void;
    
    /**
     * Reveal the dealer's hole card (for dealer hand only)
     */
    revealDealerCard(): void;
}
/**
 * Represents a playing card with suit, rank, and value
 */
export interface Card {
    /** Card's suit (hearts, diamonds, clubs, spades) */
    suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
    
    /** Card's rank (A, 2-10, J, Q, K) */
    rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
    
    /** Card's value in blackjack (1-11 for A, 10 for face cards, rank value for others) */
    value: number;
    
    /** Card's sprite key in the resources */
    spriteKey: string;
    
    /** Whether the card is face up or face down */
    faceUp: boolean;
    
    /** Card's sprite */
    sprite?: Sprite;
    
    /** Card's target position in the hand (for repositioning during resize) */
    targetPosition?: {
        x: number;
        y: number;
        index: number; // Index in the hand
    };
}
    


