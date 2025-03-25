import { Container, Sprite, Texture } from "pixi.js";
import { TextLabel } from "./textlabel";
import { config } from "./appconfig";
import { getSuitPrefix, Globals } from "./globals";
import { Easing, Tween } from "@tweenjs/tween.js";
import { log } from "node:console";
import { promises } from "node:dns";

export class Hand extends Container {

    
    /** Dealer points text */
    pointsText: TextLabel = new TextLabel(0,0,0.5,"",20,0x000000);
    
    /** Split hand points display */
    pointsDisplay: Sprite  = new Sprite(Globals.resources.PointsHolder);

     points : number = 0;
     
    /** Animation speed for dealing cards (ms) */
    dealAnimationSpeed: number = 1200;

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
async revealDealerCard(newTexture: Texture): Promise<void> {
    // Check if dealer has at least 2 cards
    if (this.type != 'dealer' || !this.cards || this.cards.length < 2) {
        console.error("Cannot reveal dealer card: dealer doesn't have enough cards");
        return;
    }
    
    // Use the new revealCardAtIndex method to reveal the hole card (index 1)
    this.revealCardAtIndex(1, newTexture);
    
   
}
     /**
     * Animate a card flipping over
     * @param sprite - The card sprite to flip
     * @param newTexture - The texture to show after flipping
     */
     animateCardFlip(sprite: Sprite, newTexture: Texture): Promise<void> {
        return new Promise((resolve) => {
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
                        resolve();
                        // Call the completion callback if provided
                        if (this.onCardRevealComplete) {
                            this.onCardRevealComplete();
                        }
                    })
                    .start();
                })
            .start();
        });
    }
   
   
    /**
     * Deal a card with error handling
     * @param faceUp - Whether the card should be face up
     * @returns A promise that resolves with the dealt card
     */
    dealCards(CardData : Card): Promise<Card | null> {
        return new Promise((resolve) => {
            try {
                this.setContainerPosition();
                let placeholderCard: Card;
                if(CardData)
                {
                    placeholderCard = {
                        rank:  CardData.rank,  // Placeholder value, will be updated with actual card from backend
                        suit: CardData.suit,             // Placeholder value, will be updated with actual card from backend
                        value: CardData.value,                   // Placeholder value, will be updated with actual card from backend
                        faceUp: CardData.faceUp,
                        sprite: undefined,
                        spriteKey: `${getSuitPrefix(CardData.suit)}${CardData.rank}`  // Use cardBack for face down cards
                    };
                }
                else
                {
                    placeholderCard = {
                        rank:  '0',  // Placeholder value, will be updated with actual card from backend
                        suit: '0',             // Placeholder value, will be updated with actual card from backend
                        value: 0,                   // Placeholder value, will be updated with actual card from backend
                        faceUp: false,
                        sprite: undefined,
                        spriteKey: 'cardBack'  // Use cardBack for face down cards
                    };
                }
                console.log("Dealing card", placeholderCard);
                
                // Ensure texture is available by adding a fallback method
                this.ensureTextureAvailable(placeholderCard);
                
                this.cards.push(placeholderCard);
                // Create sprite for the card
                this.createCardSprite(placeholderCard);
                
                console.log("Card sprite created successfully for ", placeholderCard.sprite?._texture);
                
                // Add sprite to hand container
                if (placeholderCard.sprite) {
                    // Force the sprite to be visible before adding
                    placeholderCard.sprite.visible = true;

                    this.addChild(placeholderCard.sprite);
                    
                    // Position the card
                    this.positionCardsInHand(this);
                    
                    // Animate the card with the enhanced animation
                    this.animateCardToHand(placeholderCard, this)
                    
                    // Add a longer delay to ensure animation completes including rotation and bounce
                    setTimeout(() => {
                        // Resolve with the card
                        resolve(placeholderCard);
                    }, this.dealAnimationSpeed); // Increased delay for enhanced animation
                } else {
                    // If sprite creation failed, try a direct approach as fallback
                    console.log("Fallback sprite creation for card:", placeholderCard);
                    
                    // Create a basic card using cardBack texture
                    const fallbackSprite = new Sprite(Globals.resources.cardBack);
                    fallbackSprite.anchor.set(0.5);
                    fallbackSprite.scale.set(this.calculateCardScale());
                    fallbackSprite.visible = true;
                    fallbackSprite.alpha = 1;
                    
                    // Store the fallback sprite
                    placeholderCard.sprite = fallbackSprite;
                    
                    // Add to the container
                    this.addChild(fallbackSprite);
                    
                    // Position cards immediately
                    this.positionCardsInHand(this);
                    
                    resolve(placeholderCard);
                }
            } catch (error) {
                console.error("Error creating placeholder card:", error);
                resolve(null);
            }
        });
    }
    
    /**
     * Ensure the texture for a card is available
     * @param card - The card to ensure texture is available for
     */
    private ensureTextureAvailable(card: Card): void {
        // Determine which texture to use based on whether the card is face up
        let textureKey = card.faceUp ? card.spriteKey : 'cardBack';
        
        // Check if the texture exists
        if (!Globals.resources[textureKey]) {
            console.warn(`Texture ${textureKey} not found, checking alternatives`);
            
            // Try lowercase version
            const lowercaseKey = textureKey.toLowerCase();
            if (Globals.resources[lowercaseKey]) {
                console.log(`Found texture with lowercase key: ${lowercaseKey}`);
                card.spriteKey = lowercaseKey;
                return;
            }
            
            // Try with different suit prefix formats
            if (card.faceUp) {
                const suit = card.suit.toLowerCase();
                const rank = card.rank.toUpperCase();
                
                // Try various formats that might exist
                const keyVariants = [
                    `${suit}_${rank}`,
                    `${suit}${rank}`,
                    `${suit.charAt(0)}${rank}`,
                    `card_${suit}_${rank}`
                ];
                
                for (const variant of keyVariants) {
                    if (Globals.resources[variant]) {
                        console.log(`Found texture with variant key: ${variant}`);
                        card.spriteKey = variant;
                        return;
                    }
                }
            }
            
            // If all else fails, use cardBack
            console.error(`No matching texture found for ${card.rank} of ${card.suit}, using cardBack`);
            card.spriteKey = 'cardBack';
        }
    }

    /**
     * Create a card sprite
     * @param card - The card to create a sprite for
     */
    createCardSprite(card: Card): void {
        // Log detailed card information for debugging
        console.log(`Creating card sprite for ${card.rank} of ${card.suit} (faceUp: ${card.faceUp})`);
        console.log(`Card spriteKey: ${card.spriteKey}`);
        
        // Use cardBack for face down cards
        let textureKey = card.faceUp ? card.spriteKey : 'cardBack';
        
        // Verify the texture exists
        if (!Globals.resources[textureKey]) {
            console.warn(`Texture ${textureKey} not found, falling back to cardBack`);
            textureKey = 'cardBack';
        }
        
        console.log(`Final texture key: ${textureKey}`);
        console.log(`Texture exists: ${!!Globals.resources[textureKey]}`);
        
        try {
            // Create sprite
            const sprite = new Sprite(Globals.resources[textureKey]);
            
            // Force visibility
            sprite.visible = true;
            
            // Set anchor to center
            sprite.anchor.set(0.5);
            
            // Calculate card scale based on current screen dimensions
            const cardScale = this.calculateCardScale();
            console.log(`Card scale: ${cardScale}`);
            
            // Scale card with the calculated scale
            sprite.scale.set(cardScale);
            
            // Store sprite in card
            card.sprite = sprite;
            
            // Initial properties for animation
            // We'll set the actual position in animateCardToHand
            // Start slightly transparent but still visible
            sprite.alpha = 1;
            
            // Log sprite properties for debugging
            console.log(`Created sprite: visible=${sprite.visible}, alpha=${sprite.alpha}, width=${sprite.width}, height=${sprite.height}`);
            
            // Fade in quickly
            try {
                new Tween(sprite)
                    .to({ alpha: 1 }, 100)
                    .start();
            } catch (error) {
                console.error("Error animating card fade-in:", error);
                // Set alpha directly as fallback
                sprite.alpha = 1;
            }
            
            // Log success
            console.log(`Card sprite created successfully for ${card.rank} of ${card.suit}`);
        } catch (error) {
            console.error("Error creating card sprite:", error);
            console.error("Texture:", Globals.resources[textureKey]);
            card.sprite = undefined;
        }
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

    resize(hasSplit : boolean ) {
        this.setContainerPosition(hasSplit);
        this.positionCardsInHand(this);
        // const playerY = screenHeight * 0.35; // Player hand at 25% from bottom
        // const dealerY = -screenHeight * 0.25; // Dealer hand at 25% from top
        
    }
    /**
     * Get the consistent overlap factor for cards
     * @returns The overlap factor to use for card positioning
     */
    getCardOverlapFactor(): number {
        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isPortrait = screenHeight > screenWidth;
        
        // Base overlap factor
        let baseOverlap = 0.7; // 70% overlap for standard view
        
        // Adjust overlap based on screen size and orientation
        if (isPortrait) {
            // For portrait mode (mobile), use slightly less overlap
            baseOverlap = 0.65;
        } else {
            // For landscape mode, use slightly more overlap
            baseOverlap = 0.75;
        }
        
        // Adjust for very small screens
        if (screenWidth < 600) {
            baseOverlap = 0.6; // Less overlap on very small screens
        }
        
        // Adjust for very large screens
        if (screenWidth > 1920) {
            baseOverlap = 0.8; // More overlap on very large screens
        }
        
        // Ensure overlap stays within reasonable bounds
        return Math.max(0.5, Math.min(0.85, baseOverlap));
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
        
        // Log the calculation details for debugging
        console.log(`Card overlap calculation:
            Screen width: ${window.innerWidth}
            Available width: ${availableWidth}
            Card width: ${cardWidth}
            Overlap factor: ${overlapFactor}
            Effective card width: ${effectiveCardWidth}
            Max visible cards: ${maxCards}`);
        
        return maxCards;
    }
    

    /**
     * Position cards in a hand with smooth animation
     * @param hand - The hand to position cards in
     */
    positionCardsInHand(hand: Hand): void {
        const cardCount = hand.cards.length;
        if (cardCount === 0) return;
        
        // Use the consistent card scale calculation
        const cardScale = this.calculateCardScale();
        
        // Get the overlap factor
        const overlapFactor = this.getCardOverlapFactor();
        
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
                
                // Animate to the new position
                new Tween(card.sprite.position)
                    .to({ x, y }, 300)
                    .easing(Easing.Cubic.Out)
                    .start();
                
                // Set z-index based on card position
                card.sprite.zIndex = index;
                
                // Apply a slight rotation for a more natural look
                if (cardCount > 1) {
                    const rotationOffset = (index - (cardCount - 1) / 2) * 0.5;
                    new Tween(card.sprite)
                        .to({ rotation: rotationOffset * (Math.PI / 180) }, 300)
                        .easing(Easing.Cubic.Out)
                        .start();
                }
            }
        });
        
        // Position the points display after cards are positioned
        this.positionPointsDisplay();
        
        // After positioning the points display, adjust card positions to ensure
        // the points display is centered relative to the cards
        this.adjustCardsForCenteredPointsDisplay(cardWidth);
    }

    /**
     * Set container position with smooth animation
     */
    setContainerPosition(hasSplit: boolean = false) {
        const playerY = window.innerHeight * 0.40; // Player hand at 40% from top
        const dealerY = -window.innerHeight * 0.25; // Dealer hand at 25% from top
        const { Tween, Easing } = require("@tweenjs/tween.js");

        let targetX = 0;
        let targetY = 0;

        if(this.type === 'player') {
            targetY = playerY;
            if(hasSplit) {
                targetX = window.innerWidth * 0.2;
            }
        } else if(this.type === 'dealer') {
            targetY = dealerY;
        } else if(this.type === 'split') {
            targetY = playerY;
            targetX = -window.innerWidth * 0.2;
        }

        // Animate to new position
        new Tween(this.position)
            .to({ x: targetX, y: targetY }, 300)
            .easing(Easing.Cubic.Out)
            .start();
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
     * Position the points display relative to the cards
     */
    private positionPointsDisplay(): void {
        if (this.cards.length === 0) return;
        
        // Calculate the center position of all cards
        let totalX = 0;
        let cardCount = 0;
        this.cards.forEach(card => {
            if (card.sprite) {
                totalX += card.sprite.position.x;
                cardCount++;
            }
        });
        
        if (cardCount === 0) return;
        
        // Find the center of the cards on the X axis
        const centerX = totalX / cardCount;
        
        // Get the first and last card for Y positioning reference
        const firstCard = this.cards[0].sprite;
        const lastCard = this.cards[this.cards.length - 1].sprite;
        
        if (!firstCard || !lastCard) return;
        
        if (this.type === 'dealer') {
            // Position points display below the cards for dealer
            this.pointsDisplay.position.set(
                centerX, // Center on X axis
                lastCard.position.y + lastCard.height * 0.5 + this.pointsDisplay.height * 0.6 // Below cards
            );
        } else {
            // Position points display above the cards for player and split
            this.pointsDisplay.position.set(
                centerX, // Center on X axis
                firstCard.position.y - firstCard.height * 0.5 - this.pointsDisplay.height * 0.6 // Above cards
            );
        }
        
        console.log(`Positioned points display at (${this.pointsDisplay.position.x}, ${this.pointsDisplay.position.y}) for ${this.type} hand`);
    }

    /**
     * Adjust cards to ensure the points display is centered
     * @param cardWidth - Width of a card
     */
    private adjustCardsForCenteredPointsDisplay(cardWidth: number): void {
        if (this.cards.length === 0 || !this.pointsDisplay.visible) return;
        
        // Get the center point of our points display
        const pointsCenter = this.pointsDisplay.position.x;
        
        // Calculate the current center of the cards
        let minX = Number.MAX_VALUE;
        let maxX = -Number.MAX_VALUE;
        
        this.cards.forEach(card => {
            if (card.sprite) {
                const leftEdge = card.sprite.position.x - (cardWidth * 0.5);
                const rightEdge = card.sprite.position.x + (cardWidth * 0.5);
                
                minX = Math.min(minX, leftEdge);
                maxX = Math.max(maxX, rightEdge);
            }
        });
        
        const cardsCenter = (minX + maxX) / 2;
        
        // Calculate how much to shift cards so the points display is centered
        const shiftAmount = pointsCenter - cardsCenter;
        
        // Only apply adjustment if it's significant
        if (Math.abs(shiftAmount) > 2) {
            console.log(`Adjusting cards by ${shiftAmount}px to center points display`);
            
            // Shift all cards
            this.cards.forEach(card => {
                if (card.sprite) {
                    card.sprite.position.x += shiftAmount;
                    
                    // Update the target position for reference
                    if (card.targetPosition) {
                        card.targetPosition.x += shiftAmount;
                    }
                }
            });
        }
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
        
        // Set z-index based on card position
        card.sprite.zIndex = cardIndex;
        
        // Start position from left corner of the screen
        const startX = -screenWidth / 2 + cardWidth / 2;
        const startY = screenHeight / 2 - cardHeight / 2;
        
        // Set initial position and rotation
        card.sprite.position.set(startX, startY);
        card.sprite.rotation = -Math.PI / 4;
        
        // Calculate a curved path from left corner to the target position
        const controlPoint = {
            x: (startX + targetX) / 2 - 50,
            y: Math.min(startY, targetY) - 100
        };
        
        // Create a progress tween from 0 to 1
        const progress = { value: 0 };
        const { Tween, Easing } = require("@tweenjs/tween.js");
        
        new Tween(progress, Globals.sceneManager?.tweenGroup)
            .to({ value: 1 }, this.dealAnimationSpeed)
            .easing(Easing.Cubic.Out)
            .onUpdate(() => {
                if (!card.sprite) return;
                
                const t = progress.value;
                
                // Quadratic Bezier curve formula
                const x = Math.pow(1-t, 2) * startX + 
                         2 * (1-t) * t * controlPoint.x + 
                         Math.pow(t, 2) * targetX;
                
                const y = Math.pow(1-t, 2) * startY + 
                         2 * (1-t) * t * controlPoint.y + 
                         Math.pow(t, 2) * targetY;
                
                card.sprite.position.set(x, y);
                
                // Smooth rotation during flight
                card.sprite.rotation = -Math.PI / 4 * (1 - t) + (Math.PI * 2 * t);
            })
            .start();
            
        // Add a bounce effect at the end
        new Tween({}, Globals.sceneManager?.tweenGroup)
            .to({}, this.dealAnimationSpeed)
            .onComplete(() => {
                if (!card.sprite) return;
                
                new Tween(card.sprite.scale)
                    .to({ 
                        x: cardScale * 1.1,
                        y: cardScale * 1.1
                    }, 100)
                    .easing(Easing.Cubic.Out)
                    .yoyo(true)
                    .repeat(1)
                    .onComplete(() => {
                        this.updatePointsDisplay(true);
                        
                        // Ensure points display appears smoothly
                        if (this.pointsDisplay) {
                            this.pointsDisplay.alpha = 0;
                            this.pointsDisplay.visible = true;
                            
                            new Tween(this.pointsDisplay)
                                .to({ alpha: 1 }, 300)
                                .easing(Easing.Cubic.Out)
                                .start();
                        }
                    })
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
        
        // Update points text to show hand value
        let points = 0;
        
     
        points = this.calculateValue();
        
        
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

   
    /**
     * Reveal a specific card in the hand
     * @param index - The index of the card to reveal
     * @param cardData - Optional updated card data from the backend
     */
    public revealCardAtIndex(index: number, cardData?: Card): void {
        if (index < 0 || index >= this.cards.length) {
            console.error("Cannot reveal card: invalid index");
            return;
        }
        
        const card = this.cards[index];
        
        // If card data is provided from backend, update the card's properties
        if (cardData) {
            card.rank = cardData.rank;
            card.suit = cardData.suit;
            card.value = cardData.value;
            
        }
        
        // Only flip if the card is face down
        if (!card.faceUp && card.sprite && cardData) {
            // Mark as face up
            card.faceUp = true;
            console.log("cardData", cardData);
            // Update sprite key for the face-up card
            card.spriteKey = `${getSuitPrefix(cardData.suit as "hearts" | "diamonds" | "clubs" | "spades")}${cardData.rank}`;
            
            // Get the face-up texture
            const faceUpTexture = Globals.resources[card.spriteKey];
            console.log("faceUpTexture", faceUpTexture);
            // Animate card flip
            this.animateCardFlip(card.sprite, faceUpTexture);
            
            // Update value after card is revealed
            setTimeout(() => {
                this.calculateValue();
                this.updatePointsDisplay(true);
            }, 300); // After flip animation
        }
    }

    /**
     * Apply a visual highlight effect to show this hand is active
     * @param isActive Whether this hand is active
     */
    public highlightActive(isActive: boolean): void {
        // Calculate hand value to check for bust
        const cards = this.cards;
        let value = 0;
        let aces = 0;
        
        // Calculate hand value
        for (const card of cards) {
            if (card.rank === 'A') {
                aces++;
            } else {
                value += card.value;
            }
        }
        
        // Add aces optimally
        for (let i = 0; i < aces; i++) {
            if (value + 11 <= 21) {
                value += 11;
            } else {
                value += 1;
            }
        }
        
        const isBusted = value > 21;
        
        // Apply a different tint and brightness to show which hand is active
        if (isActive) {
            // Bright white for active hand
            if (this.pointsDisplay) {
                this.pointsDisplay.alpha = 1.0;
                // Use red tint for busted hands
                this.pointsDisplay.tint = isBusted ? 0xFF0000 : 0xFFFFFF;
                
                // Make the text larger for the active hand
                this.pointsDisplay.scale.set(1.2);
            }
            
            // Make cards brighter
            this.cards.forEach(card => {
                if (card.sprite) {
                    card.sprite.alpha = 1.0;
                    // If busted, apply a subtle red tint to cards
                    if (isBusted) {
                        card.sprite.tint = 0xFFDDDD;
                    } else {
                        card.sprite.tint = 0xFFFFFF;
                    }
                }
            });
        } else {
            // Dimmed for inactive hand
            if (this.pointsDisplay) {
                this.pointsDisplay.alpha = 0.7;
                // Dim gray for inactive hand
                this.pointsDisplay.tint = 0xBBBBBB;
                // Reset scale for inactive hand
                this.pointsDisplay.scale.set(1.0);
            }
            
            // Dim the cards too
            this.cards.forEach(card => {
                if (card.sprite) {
                    card.sprite.alpha = 0.6;
                    card.sprite.tint = 0xDDDDDD;
                }
            });
        }
        
        // Force update of the points display
        this.updatePointsDisplay(true);
    }

    /**
     * Calculate the value of the hand
     * This method handles ace values optimally (as 11 or 1)
     * @returns The calculated value of the hand
     */
    calculateValue(): number {
        let value = 0;
        let aces = 0;
        
        // First sum up all non-ace cards
        for (const card of this.cards) {
            if (card.rank === 'A') {
                aces++;
            } else {
                value += card.value;
            }
        }
        
        // Then add aces with optimal values
        for (let i = 0; i < aces; i++) {
            // Count ace as 11 if it doesn't cause a bust, otherwise as 1
            if (value + 11 <= 21) {
                value += 11;
                this.soft = true; // Mark as soft hand (contains an ace counted as 11)
            } else {
                value += 1;
            }
        }
        
        // Update hand state based on calculated value
        this.value = value;
        this.busted = value > 21;
        
        // Check for blackjack (21 with exactly 2 cards)
        if (this.cards.length === 2 && value === 21) {
            this.blackjack = true;
        }
        
        return value;
    }
    
    /**
     * Get the visible value of the hand (for dealer's hand when hole card is hidden)
     * Only counts face-up cards
     * @returns The visible value of the hand
     */
    getVisibleValue(): number {
        let value = 0;
        let aces = 0;
        
        // Only count face-up cards
        for (const card of this.cards) {
            if (!card.faceUp) continue;
            
            if (card.rank === 'A') {
                aces++;
            } else {
                value += card.value;
            }
        }
        
        // Handle aces optimally
        for (let i = 0; i < aces; i++) {
            if (value + 11 <= 21) {
                value += 11;
            } else {
                value += 1;
            }
        }
        
        return value;
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
     * Update the hand with a card from the backend
     * @param cardData - The card data received from the backend
     * @param index - Optional index where the card should be placed
     * @returns The updated card
     */
  
    revealCardAtIndex(index: number, cardData?: any): void;
    
   
}
/**
 * Represents a playing card with suit, rank, and value
 */
export interface Card {
    /** Card's suit (hearts, diamonds, clubs, spades) */
    suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | '0';
    
    /** Card's rank (A, 2-10, J, Q, K) */
    rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | '0';
    
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
    


