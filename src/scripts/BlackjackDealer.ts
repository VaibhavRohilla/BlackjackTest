import { Container, Sprite, Texture, Text, TextStyle } from "pixi.js";
import { Globals } from "./Globals";
import { Easing, Tween } from "@tweenjs/tween.js";
import { config } from "./appConfig";
import { TextLabel } from "./TextLabel";

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
    
    /** Container for the hand's sprites */
    container: Container;
    
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
}

/**
 * Possible outcomes of a blackjack game
 */
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
    INSURANCE_LOST = 'insurance_lost'
}

/**
 * Handles card distribution and game logic for blackjack
 */
export class BlackjackDealer {
    /** The deck of cards */
    private deck: Card[] = [];
    
    /** The player's hand */
    private playerHand: Hand;
    
    /** The dealer's hand */
    private dealerHand: Hand;
    
    /** The player's split hand (if any) */
    private playerSplitHand: Hand | null = null;
    
    /** Container for all card sprites */
    private cardContainer: Container;
    
    /** Whether a game is in progress */
    gameInProgress: boolean = false;
    
    /** Animation speed for dealing cards (ms) */
    private dealAnimationSpeed: number = 300;
    
    /** Callback for when a card is dealt */
    private onCardDealt?: (hand: 'player' | 'dealer', card: Card) => void;
    
    /** Callback for when the game ends */
    private onGameEnd?: (outcome: GameOutcome, playerValue: number, dealerValue: number) => void;
    
    /** Callback for special game events */
    private onGameEvent?: (eventType: string, data?: any) => void;
    
    /** Points display container */
    private pointsContainer!: Container;
    
    /** Player points display */
    private playerPointsDisplay!: Sprite;
    
    /** Player points text */
    private playerPointsText!: TextLabel;
    
    /** Dealer points display */
    private dealerPointsDisplay!: Sprite;
    
    /** Dealer points text */
    private dealerPointsText!: TextLabel;
    
    /** Split hand points display */
    private splitPointsDisplay: Sprite | null = null;
    
    /** Split hand points text */
    private splitPointsText: TextLabel | null = null;
    
    /** Last bet amount for rebet functionality */
    private lastBetAmount: number = 0;
    
    /** Whether a card deal is currently in progress */
    private dealInProgress: boolean = false;

    /** Whether any player action is currently in progress */
    private actionInProgress: boolean = false;
    private _hitInProgress: boolean = false;
    
    /**
     * Create a new blackjack dealer
     * @param cardContainer - Container to add card sprites to
     * @param onCardDealt - Optional callback for when a card is dealt
     * @param onGameEnd - Optional callback for when the game ends
     * @param onGameEvent - Optional callback for special game events
     */
    constructor(
        cardContainer: Container,
        onCardDealt?: (hand: 'player' | 'dealer', card: Card) => void,
        onGameEnd?: (outcome: GameOutcome, playerValue: number, dealerValue: number) => void,
        onGameEvent?: (eventType: string, data?: any) => void
    ) {
        this.cardContainer = cardContainer;
        this.onCardDealt = onCardDealt;
        this.onGameEnd = onGameEnd;
        this.onGameEvent = onGameEvent;
        
        // Initialize hands
        this.playerHand = this.createHand();
        this.dealerHand = this.createHand();
        
        // Position the hand containers
        this.positionHands();
        
        // Add hand containers to the card container
        this.cardContainer.addChild(this.playerHand.container);
        this.cardContainer.addChild(this.dealerHand.container);
        
        // Initialize points system
        this.initializePointsSystem();
        
        // Initialize the deck
        this.initializeDeck();
        this.shuffleDeck();
    }
    
    /**
     * Create a new hand
     */
    private createHand(): Hand {
        return {
            cards: [],
            value: 0,
            soft: false,
            busted: false,
            blackjack: false,
            container: new Container(),
            addCard(card: Card): void {
                this.cards.push(card);
                this.value = this.calculateValue();
            },
            calculateValue(): number {
                // Implementation of calculateValue
                let value = 0;
                let aceCount = 0;
                
                // Sum up the values of all cards
                for (const card of this.cards) {
                    if (card.rank === 'A') {
                        aceCount++;
                        value += 11; // Initially count Ace as 11
                    } else {
                        value += card.value;
                    }
                }
                
                // Adjust for Aces if needed
                while (value > 21 && aceCount > 0) {
                    value -= 10; // Convert an Ace from 11 to 1
                    aceCount--;
                }
                
                // Update soft status
                this.soft = (aceCount > 0);
                
                // Update busted status
                this.busted = (value > 21);
                
                // Update blackjack status
                this.blackjack = (value === 21 && this.cards.length === 2);
                
                return value;
            },
            getVisibleValue(): number {
                // For dealer's hand with hidden hole card, only count the first card
                if (this.cards.length > 0 && this.cards[0].faceUp) {
                    return this.cards[0].value;
                }
                return 0;
            }
        };
    }
    
    /**
     * Position the hand containers
     */
    private positionHands(): void {
        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Calculate positions
        const playerY = screenHeight * 0.35; // Player hand at 25% from bottom
        const dealerY = -screenHeight * 0.25; // Dealer hand at 25% from top
        
        // If we're in split mode, use the split positioning
        if (this.playerSplitHand) {
            this.positionSplitHand();
        } else {
            // Normal positioning (no split)
            this.playerHand.container.position.set(0, playerY);
            this.playerHand.container.scale.set(1); // Reset scale
        }
        
        // Always position dealer's hand at the top
        this.dealerHand.container.position.set(0, dealerY);
        
        console.log("Positioned hands - Player:", this.playerHand.container.position, "Dealer:", this.dealerHand.container.position);
    }
    
    /**
     * Initialize a new deck of cards
     */
    private initializeDeck(): void {
        this.deck = [];
        
        const suits: Array<'hearts' | 'diamonds' | 'clubs' | 'spades'> = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks: Array<'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'> = 
            ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        
        // Create a card for each suit and rank
        for (const suit of suits) {
            for (const rank of ranks) {
                // Determine card value according to blackjack rules
                let value: number;
                if (rank === 'A') {
                    value = 11; // Ace is initially 11, can be reduced to 1 if needed
                } else if (rank === 'J' || rank === 'Q' || rank === 'K') {
                    value = 10; // Face cards are worth 10
                } else {
                    value = parseInt(rank); // Number cards are worth their face value
                }
                
                // Determine sprite key based on suit and rank
                const suitPrefix = this.getSuitPrefix(suit);
                const spriteKey = `${suitPrefix}${rank}`;
                
                // Add card to deck
                this.deck.push({
                    suit,
                    rank,
                    value,
                    spriteKey,
                    faceUp: true
                });
            }
        }
    }
    
    /**
     * Get the prefix for a suit to use in sprite keys
     * @param suit - The card suit
     * @returns The prefix for the suit
     */
    private getSuitPrefix(suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'): string {
        switch (suit) {
            case 'hearts': return 'h';
            case 'diamonds': return 'd';
            case 'clubs': return 'c';
            case 'spades': return 's';
        }
    }
    
    /**
     * Shuffle the deck
     */
    private shuffleDeck(): void {
        // Fisher-Yates shuffle algorithm
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    
    /**
     * Start a new game
     * @param betAmount - The amount to bet (optional, uses current bet if not provided)
     * @returns Whether the game was started successfully
     */
    public startGame(betAmount?: number): boolean {
        if (this.gameInProgress) {
            console.warn('Game already in progress');
            return false;
        }
        
        // If bet amount is provided, place the bet
        if (betAmount !== undefined) {
            if (!this.placeBet(betAmount)) {
                console.warn('Invalid bet amount');
                return false;
            }
        }
        
        // Check if there's a current bet
        if (Globals.currentBet <= 0) {
            console.warn('No bet placed');
            return false;
        }
        
        // Store the current bet as the last bet amount for rebet functionality
        this.lastBetAmount = Globals.currentBet;
        
        this.gameInProgress = true;
        Globals.gameStarted = true;
        
        // Reset hands
        this.resetHands();
        
        // Initialize and shuffle deck
        this.initializeDeck();
        this.shuffleDeck();
        
        // Show the points display
        console.log("Starting game, showing points display");
        this.showPointsDisplay();
        
        // Force a reposition of the points displays to ensure they're in the right place
        
        // Deal initial cards according to blackjack rules
        this.dealInitialCards();
        this.positionPointsDisplays();
        
        return true;
    }
    
    /**
     * Reset the player and dealer hands
     */
    private resetHands(): void {
        // Remove all card sprites
        this.playerHand.container.removeChildren();
        this.dealerHand.container.removeChildren();
        
        // Reset hand properties
        this.playerHand.cards = [];
        this.playerHand.value = 0;
        this.playerHand.soft = false;
        this.playerHand.busted = false;
        this.playerHand.blackjack = false;
        
        this.dealerHand.cards = [];
        this.dealerHand.value = 0;
        this.dealerHand.soft = false;
        this.dealerHand.busted = false;
        this.dealerHand.blackjack = false;
        
        // Clean up split hand if it exists
        if (this.playerSplitHand) {
            // Remove split hand container from card container
            if (this.playerSplitHand.container.parent) {
                this.playerSplitHand.container.parent.removeChild(this.playerSplitHand.container);
            }
            
            // Remove split points display if it exists
            if (this.splitPointsDisplay && this.splitPointsDisplay.parent) {
                this.splitPointsDisplay.parent.removeChild(this.splitPointsDisplay);
                this.splitPointsDisplay = null;
            }
            
            // Reset split hand
            this.playerSplitHand = null;
        }
    }
    
    /**
     * Deal the initial cards (2 to player, 2 to dealer with one face down)
     */
    private dealInitialCards(): void {
        // Deal first card to player (face up)
        setTimeout(() => {
            this.dealCard(this.playerHand, true);
            
            // Deal first card to dealer (face up)
            setTimeout(() => {
                this.dealCard(this.dealerHand, true);
                
                // Deal second card to player (face up)
                setTimeout(() => {
                    this.dealCard(this.playerHand, true);
                    
                    // Deal second card to dealer (face down)
                    setTimeout(() => {
                        this.dealCard(this.dealerHand, false);
                        
                        // Reposition points displays after all cards are dealt
                        this.positionPointsDisplays();
                        
                        // Check for blackjack
                        this.checkForBlackjack();
                    }, this.dealAnimationSpeed);
                }, this.dealAnimationSpeed);
            }, this.dealAnimationSpeed);
        }, this.dealAnimationSpeed);
    }
    
    /**
     * Deal a card to a hand
     * @param hand - The hand to deal to
     * @param faceUp - Whether the card should be face up
     * @returns The dealt card
     */
    private dealCard(hand: Hand, faceUp: boolean): Card {
        let card = this.deck.pop();
        
        console.log(hand,card);
        
        // Get the top card from the deck
        // const card = this.deck.pop();
        
        if (!card) {
            throw new Error('Deck is empty');
        }
        
        // Set card face up/down
        card.faceUp = faceUp;
        
        // Create card sprite
        this.createCardSprite(card);
        
        // Add card to hand
        hand.cards.push(card);
        
        // Add card sprite to hand container
        if (card.sprite) {
            hand.container.addChild(card.sprite);
        }
        
        // Animate card to hand
        this.animateCardToHand(card, hand);
        
        // Update hand value
        this.updateHandValue(hand);
        
        // Call onCardDealt callback if provided
        if (this.onCardDealt) {
            const handType = hand === this.playerHand ? 'player' : 'dealer';
            this.onCardDealt(handType, card);
        }
        
        // Make sure points display is visible and animate it after card animation
        if (!this.pointsContainer.visible) {
            console.log("Points container not visible, showing it now");
            this.showPointsDisplay();
        } else {
            // Add a slight delay to ensure the card animation has time to progress
            setTimeout(() => {
                // Determine which points display to animate based on the hand
                let pointsDisplay;
                if (hand === this.playerHand) {
                    pointsDisplay = this.playerPointsDisplay;
                } else if (hand === this.dealerHand) {
                    pointsDisplay = this.dealerPointsDisplay;
                } else if (hand === this.playerSplitHand && this.splitPointsDisplay) {
                    pointsDisplay = this.splitPointsDisplay;
                }
                
                // Animate the appropriate points display
                if (pointsDisplay) {
                    this.animateSinglePointsDisplay(pointsDisplay);
                }
                
                // Reposition all cards in the hand to ensure they remain centered
                // Use a longer delay to ensure the card animation completes first
                setTimeout(() => {
                    this.positionCardsInHand(hand);
                    
                    // Reposition points displays after card is dealt
                    this.positionPointsDisplays();
                }, 100);
            }, 300);
        }
        
        return card;
    }
    
    /**
     * Create a card sprite
     * @param card - The card to create a sprite for
     */
    private createCardSprite(card: Card): void {
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
        new Tween(sprite, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 1 }, 100)
            .start();
    }
    
    /**
     * Calculate the appropriate scale for cards based on screen dimensions
     * @returns The scale factor to apply to cards
     */
    private calculateCardScale(): number {
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
    
    /**
     * Get the consistent overlap factor for cards
     * @returns The overlap factor to use for card positioning
     */
    private getCardOverlapFactor(): number {
        // Increase overlap factor for a tighter, more professional look
        return 0.7; // 50% overlap for all devices (changed from 0.7 which is 70% overlap)
    }
    
    /**
     * Calculate the maximum number of cards that can fit in the available width
     * @param availableWidth - The available width for cards
     * @param cardWidth - The width of a single card
     * @param overlapFactor - The overlap factor to use
     * @returns The maximum number of cards that can fit
     */
    private calculateMaxVisibleCards(availableWidth: number, cardWidth: number, overlapFactor: number): number {
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
    private calculateCardPositions(hand: Hand, cardScale: number): { positions: {x: number, y: number}[], cardWidth: number, cardHeight: number } {
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
    private positionCardsInHand(hand: Hand): void {
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
                
                // Animate to the new position with a smoother animation
                this.animateCardToPosition(card.sprite, x, y);
                
                // Log card positions for debugging
                console.log(`Card ${index} positioned at x: ${x}, width: ${cardWidth}`);
            }
        });
        
        // Ensure container's sortableChildren is enabled
        hand.container.sortableChildren = true;
    }
    
    /**
     * Animate a card from the deck position to its position in the hand
     * @param card - The card to animate
     * @param hand - The hand the card is being dealt to
     */
    private animateCardToHand(card: Card, hand: Hand): void {
        if (!card.sprite) return;
        
        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isPortrait = screenHeight > screenWidth;
        
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
        
        // Determine deck position (where the card comes from)
        // Position the deck in the center, between the player and dealer hands
        const deckX = 0; // Deck is centered horizontally
        const deckY = isPortrait ? 0 : 0; // Deck is in the center of the play area
        
        // Set initial position (deck)
        card.sprite.position.set(deckX, deckY);
        
        // Create a smooth path from deck to hand position
        const path = [
            { x: deckX, y: deckY }, // Start at deck
            { x: targetX, y: targetY } // End at hand position
        ];
        
        // Animate along path
        this.animateAlongPath(card.sprite, path, this.dealAnimationSpeed);
        
        // Log card animation details for debugging
        console.log(`Animating card to position x: ${targetX}, width: ${cardWidth}`);
    }
    
    /**
     * Animate a sprite along a path
     * @param sprite - The sprite to animate
     * @param path - Array of points defining the path
     * @param duration - Duration of the animation
     */
    private animateAlongPath(sprite: Sprite, path: {x: number, y: number}[], duration: number): void {
        // Create a progress tween from 0 to 1
        const progress = { value: 0 };
        
        new Tween(progress, Globals.SceneManager?.tweenGroup)
            .to({ value: 1 }, duration)
            .easing(Easing.Cubic.Out) // Smoother deceleration
            .onUpdate(() => {
                // Calculate position along the path based on progress
                if (path.length === 2) {
                    // Linear path for 2 points
                    const t = progress.value;
                    const p0 = path[0];
                    const p1 = path[1];
                    
                    sprite.position.x = p0.x + t * (p1.x - p0.x);
                    sprite.position.y = p0.y + t * (p1.y - p0.y);
                }
            })
            .start();
    }
    
    /**
     * Update the value of a hand
     * @param hand - The hand to update
     */
    private updateHandValue(hand: Hand): void {
        let value = 0;
        let aceCount = 0;
        
        // Sum up card values
        for (const card of hand.cards) {
            value += card.value;
            
            // Count aces
            if (card.rank === 'A') {
                aceCount++;
            }
        }
        
        // Adjust for aces if needed (reduce from 11 to 1)
        hand.soft = aceCount > 0;
        while (value > 21 && aceCount > 0) {
            value -= 10; // Reduce ace value from 11 to 1
            aceCount--;
            
            // If no more aces can be reduced, the hand is no longer soft
            if (aceCount === 0) {
                hand.soft = false;
            }
        }
        
        // Update hand value
        hand.value = value;
        
        // Check if busted
        hand.busted = value > 21;
        
        // Check if blackjack (21 with exactly 2 cards)
        hand.blackjack = value === 21 && hand.cards.length === 2;
        
        // Update points display to reflect new hand values
        this.updatePointsDisplay();
    }
    
    /**
     * Check if dealer has blackjack
     * @returns True if dealer has blackjack
     */
    private checkDealerBlackjack(): boolean {
        // Dealer has blackjack if they have an Ace and a 10-value card
        const upCard = this.dealerHand.cards[0];
        const holeCard = this.dealerHand.cards[1];
        
        return (upCard.value + holeCard.value === 21);
    }
    
    /**
     * Check for blackjack after initial deal
     */
    private checkForBlackjack(): void {
        console.log("Checking for blackjack and special conditions...");
        
        // First check if player's first two cards are a pair (for split)
        if (this.playerHand.cards.length === 2 && 
            this.playerHand.cards[0].rank === this.playerHand.cards[1].rank &&
            Globals.Balance >= Globals.currentBet) {
            console.log("Player has a pair, split is available");
            // Signal to the UI to show the split button
            if (this.onGameEvent) {
                console.log("Triggering splitAvailable event FIRST");
                this.onGameEvent('splitAvailable');
                
                // Add a delay before checking for insurance to allow split UI to be shown
                setTimeout(() => {
                    this.checkForInsurance();
                }, 500);
                return; // Exit early to wait for split decision
            }
        } else {
            // No split available, check for insurance immediately
            this.checkForInsurance();
        }
    }
    
    /**
     * Check if insurance is available
     */
    private checkForInsurance(): void {
        // Check if dealer's up card is an Ace to offer insurance
        const dealerUpCard = this.dealerHand.cards[0];
        if (dealerUpCard.rank === 'A' && Globals.Balance >= Globals.currentBet / 2) {
            console.log("Dealer shows an Ace, insurance is available");
            // Signal to the UI to show the insurance button
            if (this.onGameEvent) {
                console.log("Triggering insuranceAvailable event");
                this.onGameEvent('insuranceAvailable');
                
                // Add a delay to allow the insurance UI to be shown before continuing
                setTimeout(() => {
                    this.continueBlackjackCheck();
                }, 500);
                return; // Exit early to wait for insurance decision
            }
        } else {
            // No insurance available, continue with blackjack check immediately
            this.continueBlackjackCheck();
        }
    }
    
    /**
     * Continue checking for blackjack and other conditions after insurance check
     */
    private continueBlackjackCheck(): void {
        // Check if player has blackjack
        if (this.playerHand.cards.length === 2 && this.playerHand.value === 21) {
            this.playerHand.blackjack = true;
            console.log("Player has blackjack!");
            
            // Check if dealer's up card is an Ace or a 10-value card
            const dealerUpCard = this.dealerHand.cards[0];
            const isAceOrTen = dealerUpCard.rank === 'A' || dealerUpCard.value === 10;
            
            if (isAceOrTen) {
                // Check if dealer also has blackjack
                const dealerHasBlackjack = this.checkDealerBlackjack();
                
                if (dealerHasBlackjack) {
                    // Both have blackjack, it's a push
                    this.revealDealerCard();
                    this.endGame(GameOutcome.PUSH);
                } else {
                    // Player has blackjack, dealer doesn't
                    this.endGame(GameOutcome.PLAYER_BLACKJACK);
                }
            } else {
                // Dealer's up card is not an Ace or 10, player wins with blackjack
                this.endGame(GameOutcome.PLAYER_BLACKJACK);
            }
        }
    }
    
    /**
     * Reveal dealer's hole card
     */
    private revealDealerCard(): void {
        // Check if dealer has at least 2 cards
        if (!this.dealerHand || !this.dealerHand.cards || this.dealerHand.cards.length < 2) {
            console.error("Cannot reveal dealer card: dealer doesn't have enough cards");
            return;
        }
        
        const holeCard = this.dealerHand.cards[1];
        
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
            
            // Get the face-up texture
            const faceUpTexture = Globals.resources[holeCard.spriteKey];
            
            // Animate card flip
            this.animateCardFlip(holeCard.sprite, faceUpTexture);
            
            // Update points display after the card flip animation completes
            setTimeout(() => {
                console.log("Updating points display after dealer card reveal");
                this.updatePointsDisplay(true);
                
                // Reposition points displays to ensure they're in the right place
                this.positionPointsDisplays();
            }, 100); // Delay to match the card flip animation duration
        } 
        // else {
        //     console.log("Dealer's hole card is already face up or has no sprite");
            
        //     // Update points display immediately if the card is already face up
        //     this.updatePointsDisplay(true);
        // }
    }
    
    /**
     * Animate a card flipping over
     * @param sprite - The card sprite to flip
     * @param newTexture - The texture to show after flipping
     */
    private animateCardFlip(sprite: Sprite, newTexture: Texture): void {
        // Store original position and scale
        const originalScale = { x: sprite.scale.x, y: sprite.scale.y };
        const originalPosition = { x: sprite.position.x, y: sprite.position.y };
        const originalRotation = sprite.rotation;
        
        // Make sure the sprite is visible
        sprite.visible = true;
        
        // Add a slight "pop up" effect during flip
        new Tween(sprite.position, Globals.SceneManager?.tweenGroup)
            .to({ 
                y: originalPosition.y - 20 // Move up slightly
            }, 150)
            .easing(Easing.Cubic.Out)
            .start();
            
        // Add a slight rotation during flip for more dynamic feel
        new Tween(sprite, Globals.SceneManager?.tweenGroup)
            .to({ 
                rotation: originalRotation + Math.PI * 0.05 // Slight tilt
            }, 150)
            .easing(Easing.Cubic.Out)
            .start();
        
        // First half of flip - scale x to 0
        new Tween(sprite.scale, Globals.SceneManager?.tweenGroup)
            .to({ x: 0 }, 150)
            .easing(Easing.Cubic.In)
            .onComplete(() => {
                // Change texture at the middle of the flip
                sprite.texture = newTexture;
                
                // Second half of flip - scale x back to original
                new Tween(sprite.scale, Globals.SceneManager?.tweenGroup)
                    .to({ x: originalScale.x }, 150)
                    .easing(Easing.Cubic.Out)
                    .start();
                    
                // Return to original position and rotation
                new Tween(sprite.position, Globals.SceneManager?.tweenGroup)
                    .to({ 
                        y: originalPosition.y
                    }, 150)
                    .easing(Easing.Back.Out) // Add a slight bounce
                    .start();
                    
                new Tween(sprite, Globals.SceneManager?.tweenGroup)
                    .to({ 
                        rotation: originalRotation
                    }, 150)
                    .easing(Easing.Back.Out)
                    .start();
            })
            .start();
            
        // Add a slight scale pulse at the end of the flip
        setTimeout(() => {
            new Tween(sprite.scale, Globals.SceneManager?.tweenGroup)
                .to({ 
                    x: originalScale.x * 1.1,
                    y: originalScale.y * 1.1
                }, 100)
                .easing(Easing.Cubic.Out)
                .yoyo(true)
                .repeat(1)
                .onComplete(() => {
                    // Ensure points display is updated after all animations complete
                    this.updatePointsDisplay(true);
                })
                .start();
        }, 300);
    }
    
    /**
     * Check if an action can be performed
     * @returns Whether an action can be performed
     */
    private canPerformAction(): boolean {
        if (!this.gameInProgress) {
            console.log("No game in progress");
            return false;
        }
        
        if (this.dealInProgress || this.actionInProgress) {
            console.log("Action or deal already in progress");
            return false;
        }
        
        return true;
    }
    
    /**
     * Begin an action
     * @param actionType - The type of action being performed
     * @returns Whether the action was started successfully
     */
    private beginAction(actionType: string): boolean {
        if (!this.canPerformAction()) {
            return false;
        }
        
        this.actionInProgress = true;
        
        // Notify UI that an action is in progress
        if (this.onGameEvent) {
            this.onGameEvent('actionInProgress', { type: actionType, inProgress: true });
        }
        
        return true;
    }
    
    /**
     * End an action
     * @param actionType - The type of action that was performed
     */
    private endAction(actionType: string): void {
        this.actionInProgress = false;
        
        // Notify UI that the action is complete
        if (this.onGameEvent) {
            this.onGameEvent('actionInProgress', { type: actionType, inProgress: false });
        }
    }
    
    /**
     * Deal a card to a hand with proper error handling
     * @param hand - The hand to deal to
     * @param faceUp - Whether the card should be face up
     * @returns A promise that resolves when the deal is complete
     */
    private dealCardWithErrorHandling(hand: Hand, faceUp: boolean): Promise<Card | null> {
        return new Promise((resolve) => {
            try {
                // Check if deck is empty
                if (this.deck.length === 0) {
                    console.error("Deck is empty, reshuffling");
                    this.initializeDeck();
                    this.shuffleDeck();
                    
                    // Notify about the reshuffle
                    if (this.onGameEvent) {
                        this.onGameEvent('deckReshuffled');
                    }
                }
                
                // Set deal in progress flag
                this.dealInProgress = true;
                
                // Deal the card
                const card = this.dealCard(hand, faceUp);
                
                // Reset the deal flag after animation completes
                setTimeout(() => {
                    this.dealInProgress = false;
                    resolve(card);
                }, this.dealAnimationSpeed + 100);
            } catch (error) {
                console.error("Error dealing card:", error);
                this.dealInProgress = false;
                resolve(null);
            }
        });
    }
    
    /**
     * Player action: Hit (take another card)
     */
    public playerHit(): void {
        // Check if player can hit
        if (!this.beginAction('hit')) {
            return;
        }
        
        if (this.playerHand.busted || this.playerHand.blackjack) {
            console.log("Cannot hit: hand is busted or has blackjack");
            this.endAction('hit');
            return;
        }
        
        // IMPORTANT: Set a flag to prevent multiple UI updates during hit
        this._hitInProgress = true;
        
        // Deal a card to the player with error handling
        this.dealCardWithErrorHandling(this.playerHand, true)
            .then((card) => {
                if (!card) {
                    console.error("Failed to deal card");
                    this._hitInProgress = false;
                    this.endAction('hit');
                    return;
                }
        
        // Check if player busted
        if (this.playerHand.busted) {
                    // Only end the game if we're not in a split hand scenario
                    if (!this.playerSplitHand) {
            this.endGame(GameOutcome.PLAYER_BUST);
                    } else {
                        // In split hand scenario, we'll handle this in playerHitSplitHand
                        console.log("Player busted first hand in split scenario - will continue with second hand");
                    }
                } else {
                    // Only trigger UI update if game is still in progress
                    if (this.gameInProgress && !this._hitInProgress) {
                        // Notify UI to update buttons without hiding first
                        if (this.onGameEvent) {
                            this.onGameEvent('updateGameplayButtons', { hideFirst: false });
                        }
                    }
                }
                
                // Clear hit in progress flag
                this._hitInProgress = false;
                
                // End the action
                this.endAction('hit');
            });
    }
    
    /**
     * Player action: Stand (end turn)
     */
    public playerStand(): void {
        if (!this.beginAction('stand')) {
            return;
        }
        
        if (this.playerHand.busted) {
            console.log("Cannot stand: hand is already busted");
            this.endAction('stand');
            return;
        }
        
        console.log("Player stands");
        
        // Reveal dealer's hole card
        this.revealDealerCard();
        
        // Add a delay before starting dealer's turn to ensure card flip animation completes
        setTimeout(() => {
            // Dealer's turn
            this.dealerTurn();
            
            // End the action after dealer's turn is complete
            // Note: dealerTurn will call endGame which resets game state
            this.endAction('stand');
        }, 600);
    }
    
    /**
     * Player action: Double Down (double bet, take one card, then stand)
     */
    public playerDoubleDown(): void {
        if (!this.beginAction('doubleDown')) {
            return;
        }
        
        if (this.playerHand.cards.length !== 2 || this.playerHand.busted) {
            console.log("Cannot double down: invalid hand state");
            this.endAction('doubleDown');
            return;
        }
        
        // Check if player has enough points to double down
        if (Globals.Balance < Globals.currentBet) {
            console.warn("Not enough points to double down");
            this.endAction('doubleDown');
            return;
        }
        
        // Double the bet
        Globals.Balance -= Globals.currentBet;
        Globals.uiContainer?.updateBalance();
        
        this.updatePointsDisplay();
        
        console.log(`Doubled down. New bet: ${Globals.currentBet}. Remaining points: ${Globals.Balance}`);
        
        Globals.emitter?.Call("addDoubleChip", Globals.currentBet);
        // Deal one card to player with error handling
        this.dealCardWithErrorHandling(this.playerHand, true)
            .then((card) => {
                if (!card) {
                    console.error("Failed to deal card for double down");
                    this.endAction('doubleDown');
                    return;
                }
        
        // Check if player busted
        if (this.playerHand.busted) {
            this.endGame(GameOutcome.PLAYER_BUST);
                    this.endAction('doubleDown');
        } else {
            // Player stands after doubling down
                    setTimeout(() => {
                        this.revealDealerCard();
                        
                        // Add a delay before starting dealer's turn
                        setTimeout(() => {
                            this.dealerTurn();
                            this.endAction('doubleDown');
                        }, 600);
                    }, 300);
                }
            });
    }
    
    /**
     * Player action: Surrender (give up half the bet)
     */
    public playerSurrender(): void {
        if (!this.beginAction('surrender')) {
            return;
        }
        
        if (this.playerHand.cards.length !== 2) {
            console.log("Cannot surrender: not initial hand");
            this.endAction('surrender');
            return;
        }
        
        // End game with surrender outcome
        this.endGame(GameOutcome.SURRENDER);
        this.endAction('surrender');
    }
    
    /**
     * Player action: Split (split a pair into two hands)
     */
    public playerSplit(): void {
        if (!this.beginAction('split')) {
            return;
        }
        
        // Check if player can split
        if (!this.canSplit()) {
            console.log("Cannot split: not a pair or already split");
            this.endAction('split');
            return;
        }
        
        console.log("Player splits");
        
        // Create a new hand for the split
        this.playerSplitHand = this.createHand();
        
        // Add the split hand container to the card container
        this.cardContainer.addChild(this.playerSplitHand.container);
        
        // Move the second card to the split hand
        const secondCard = this.playerHand.cards.pop();
        if (secondCard) {
            // Add the card to the split hand
            this.playerSplitHand.addCard(secondCard);
            
            // Move the sprite to the split hand container
        if (secondCard.sprite) {
            this.playerHand.container.removeChild(secondCard.sprite);
            this.playerSplitHand.container.addChild(secondCard.sprite);
        }
        }
        
        // Update hand values
        this.updateHandValue(this.playerHand);
        if (this.playerSplitHand) {
        this.updateHandValue(this.playerSplitHand);
        }
        
        // Create a points display for the split hand
        this.createSplitPointsDisplay();
        
        // Position the split hands
        this.positionSplitHand();
        
        // Explicitly set the first hand as active
        this.setActiveSplitHand('first');
        
        // Deduct the additional bet from the player's balance
        Globals.Balance -= Globals.currentBet;
        Globals.uiContainer?.updateBalance();
        
        console.log("Deducted additional bet. New balance:", Globals.Balance);
        
        // Deal a card to each hand
        this.dealCardWithErrorHandling(this.playerHand, true)
            .then(() => {
                if (this.playerSplitHand) {
                    this.dealCardWithErrorHandling(this.playerSplitHand, true)
                        .then(() => {
                            // Check for blackjack in either hand
                            const firstHandBlackjack = this.playerHand.blackjack;
                            const secondHandBlackjack = this.playerSplitHand?.blackjack || false;
                            
                            if (firstHandBlackjack && secondHandBlackjack) {
                                // Both hands have blackjack, end the game
                                console.log("Both split hands have blackjack");
                                this.completeSplitHandPlay();
                            } else {
                                // Continue play with the first hand
                                console.log("Continuing play with first hand");
                                
                                // Notify UI to show gameplay options for first hand
                                if (this.onGameEvent) {
                                    this.onGameEvent('showSplitHandOptions', {
                                        hand: 'first',
                                        canDouble: Globals.Balance >= Globals.currentBet
                                    });
                                }
                            }
                            
                            // End the split action
                            this.endAction('split');
                        });
                }
            });
    }
    
    /**
     * Position the split hand container
     */
    private positionSplitHand(): void {
        if (!this.playerSplitHand) return;
        
        // Get the active hand
        const activeHand = this.getActiveSplitHand() || 'first'; // Default to first hand if not set
        
        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Calculate horizontal offset based on screen width
        const horizontalOffset = screenWidth > screenHeight ? screenWidth * 0.12 : screenWidth * 0.2; // 15% of screen width for desktop, 5% for mobile
        
        // Get the normal player hand vertical position (same as in positionHands method)
        const playerHandY =  screenWidth > screenHeight ?screenHeight * 0.35 : screenHeight * 0.40; // This should match the value used in positionHands
        
        // Position player hand on the left
        this.playerHand.container.position.set(-horizontalOffset, playerHandY);
        
        // Position split hand on the right
        this.playerSplitHand.container.position.set(horizontalOffset, playerHandY);
        
        // Scale the active hand slightly larger
        if (activeHand === 'first') {
            this.playerHand.container.scale.set(1);
            this.playerSplitHand.container.scale.set(0.9);
        } else {
            this.playerHand.container.scale.set(0.9);
            this.playerSplitHand.container.scale.set(1);
        }
        
        // Ensure cards are properly positioned within each hand
        this.positionCardsInHand(this.playerHand);
        this.positionCardsInHand(this.playerSplitHand);
        
        // Update points display positions
        this.positionPointsDisplays();
        
        console.log("Split hands positioned:", {
            playerHand: this.playerHand.container.position,
            splitHand: this.playerSplitHand.container.position,
            activeHand
        });
    }
    
    /**
     * Set active split hand
     */
    public setActiveSplitHand(hand: 'first' | 'second'): void {
        if (!this.playerSplitHand) return;
        
        console.log(`Setting active hand to ${hand}`);
        
        // Scale down both hands
        this.playerHand.container.scale.set(0.9);
        this.playerSplitHand.container.scale.set(0.9);
        
        // Scale up active hand
        if (hand === 'first') {
            this.playerHand.container.scale.set(1.0);
        } else {
            this.playerSplitHand.container.scale.set(1.0);
        }
        
        // Update points displays
        this.positionPointsDisplays();
    }
    
    /**
     * Handle player hit on split hand
     * @param hand - Which hand to hit ('first' or 'second')
     */
    public playerHitSplitHand(hand: 'first' | 'second'): void {
        if (!this.beginAction('hit')) {
            return;
        }
        
        console.log(`Player hits on ${hand} split hand`);
        
        // Determine which hand to hit
        const targetHand = hand === 'first' ? this.playerHand : this.playerSplitHand;
        
        if (!targetHand) {
            console.error("Target hand not found");
            this.endAction('hit');
            return;
        }
        
        // Deal a card to the target hand
        this.dealCardWithErrorHandling(targetHand, true)
            .then(() => {
            // Check if the hand busted
                if (targetHand.busted) {
                    console.log(`${hand} split hand busted with value ${targetHand.value}`);
                
                if (hand === 'first') {
                    // First hand busted, switch to second hand
                        this.switchToSecondSplitHand();
                } else {
                        // Second hand busted, complete the split hand play
                    this.completeSplitHandPlay();
                }
                } else if (targetHand.value === 21) {
                    console.log(`${hand} split hand has 21`);
                    
                    if (hand === 'first') {
                        // First hand has 21, switch to second hand
                        this.switchToSecondSplitHand();
            } else {
                        // Second hand has 21, complete the split hand play
                        this.completeSplitHandPlay();
                    }
                }
                
                // End the hit action
                this.endAction('hit');
            });
    }
    
    /**
     * Switch to the second split hand
     */
    private switchToSecondSplitHand(): void {
        if (!this.playerSplitHand) return;
        
        console.log("Switching to second split hand");
        
        // Set the second hand as active
        this.setActiveSplitHand('second');
        
        // Notify UI to update buttons for second hand
        if (this.onGameEvent) {
            this.onGameEvent('switchToSplitHand', {
                canDouble: Globals.Balance >= Globals.currentBet && this.playerSplitHand.cards.length === 1
            });
        }
    }
    
    /**
     * Deal a card to a specific hand
     * @param hand - The hand to deal to
     * @param faceUp - Whether the card should be face up
     * @returns The dealt card
     */
    private dealCardToHand(hand: Hand, faceUp: boolean = true): Promise<Card> {
        return new Promise((resolve) => {
            // Get a card from the deck
            const card = this.getCardFromDeck();
            
            // Set face up state
            card.faceUp = faceUp;
            
            // Create sprite for the card
            this.createCardSprite(card);
            
            // Add card to hand
            hand.addCard(card);
            
            // Add sprite to hand container
            if (card.sprite) {
                hand.container.addChild(card.sprite);
                
                // Position the card
                this.positionCardsInHand(hand);
                
                // Animate the card
                setTimeout(() => {
                    resolve(card);
                }, this.dealAnimationSpeed + 50);
            } else {
                resolve(card);
            }
        });
    }
    
    /**
     * Get a card from the deck
     * @returns The card from the deck
     */
    private getCardFromDeck(): Card {
        return this.deck.pop()!;
    }
    
    /**
     * Animate a card to a specific position
     * @param sprite - The sprite to animate
     * @param x - Target x position
     * @param y - Target y position
     */
    private animateCardToPosition(sprite: Sprite, x: number, y: number): void {
        // Store original position
        const originalPosition = { x: sprite.position.x, y: sprite.position.y };
        
        // Only animate if the position has changed significantly
        const distanceSquared = Math.pow(originalPosition.x - x, 2) + Math.pow(originalPosition.y - y, 2);
        if (distanceSquared < 1) {
            // If the change is very small, just set the position directly
            sprite.position.set(x, y);
            return;
        }
        
        // Animate to new position with a smoother animation
        new Tween(sprite.position, Globals.SceneManager?.tweenGroup)
            .to({ x, y }, this.dealAnimationSpeed)
            .easing(Easing.Cubic.Out) // Use Cubic.Out for smoother movement without overshoot
            .start();
    }
    
    /**
     * Player action: Insurance (bet half the original bet against dealer blackjack)
     */
    public playerInsurance(): void {
        if (!this.beginAction('insurance')) {
            return;
        }
        
        // Check if insurance is allowed
        if (this.playerHand.cards.length !== 2 || 
            this.dealerHand.cards[0].rank !== 'A' ||
            Globals.Balance < Globals.currentBet / 2) {
            console.log("Insurance not allowed");
            this.endAction('insurance');
            return;
        }
        
        console.log("Taking insurance");
        
        // Calculate insurance bet (half the original bet)
        const insuranceBet = Globals.currentBet / 2;
        
        // Deduct insurance bet from player's balance
        Globals.Balance -= insuranceBet;
        Globals.uiContainer?.updateBalance();
        
        // Update the UI
        this.updatePointsDisplay();
        
        // Check if dealer has blackjack
        const dealerHasBlackjack = this.checkDealerBlackjack();
        
        if (dealerHasBlackjack) {
            console.log("Dealer has blackjack, insurance pays 2:1");
            
            // Insurance pays 2:1
            Globals.Balance += insuranceBet * 3;
            
            // Reveal dealer's hole card
            this.revealDealerCard();
            
            // Show insurance won popup
            if (this.onGameEnd) {
                this.onGameEnd(GameOutcome.INSURANCE_WON, this.playerHand.value, this.dealerHand.value);
            }
            
            // The MainScene will now handle the game end logic
        } else {
            console.log("Dealer doesn't have blackjack, insurance lost");
            
            // Show insurance lost popup
            if (this.onGameEnd) {
                this.onGameEnd(GameOutcome.INSURANCE_LOST, this.playerHand.value, this.dealerHand.value);
            }
            
            // Explicitly trigger showing gameplay buttons after insurance decision
            if (this.onGameEvent) {
                this.onGameEvent('showGameplayButtons');
            }
        }
        
        // End the insurance action
        setTimeout(() => {
            this.endAction('insurance');
        }, 500);
    }
    
    /**
     * Dealer's turn - hit until 17 or higher
     */
    private dealerTurn(): void {
        console.log("Dealer's turn");
        
        const dealerPlay = () => {
        // Calculate dealer's hand value
        const dealerValue = this.dealerHand.value;
        console.log(`Dealer's hand value: ${dealerValue}`);
        
        // Check if dealer must hit
        // Dealer must hit on soft 17 in most casinos
        const mustHit = dealerValue < 17 || (dealerValue === 17 && this.dealerHand.soft);
        
        if (mustHit) {
            console.log("Dealer must hit");
            
                // Deal a card to the dealer with error handling
                this.dealCardWithErrorHandling(this.dealerHand, true)
                    .then((card) => {
                        if (!card) {
                            console.error("Failed to deal card to dealer");
                            this.determineOutcome();
                            return;
                        }
                
                // Check if dealer busted
                if (this.dealerHand.value > 21) {
                    console.log("Dealer busted");
                    
                    // Add a delay to allow the card animation to complete
                    setTimeout(() => {
                        this.determineOutcome();
                    }, 800);
                } else {
                    // Continue dealer's turn after a delay
                            setTimeout(dealerPlay, 800);
                }
                    });
        } else {
            console.log("Dealer stands with " + dealerValue);
            
            // Add a delay before determining the outcome
            setTimeout(() => {
                this.determineOutcome();
            }, 600);
        }
        };
        
        // Start dealer play
        dealerPlay();
    }
    
    /**
     * Determine the outcome of the game
     */
    private determineOutcome(): void {
        // Get final hand values
        const playerValue = this.playerHand.value;
        const dealerValue = this.dealerHand.value;
        
        console.log(`Final hand values - Player: ${playerValue}, Dealer: ${dealerValue}`);
        
        let outcome: GameOutcome;
        
        // Determine outcome
        if (this.dealerHand.busted) {
            // Dealer busted
            outcome = GameOutcome.DEALER_BUST;
            console.log("Outcome: Dealer busted");
        } else if (playerValue > dealerValue) {
            // Player has higher value
            outcome = GameOutcome.PLAYER_WIN;
            console.log("Outcome: Player wins");
        } else if (dealerValue > playerValue) {
            // Dealer has higher value
            outcome = GameOutcome.DEALER_WIN;
            console.log("Outcome: Dealer wins");
        } else {
            // Equal values - push
            outcome = GameOutcome.PUSH;
            console.log("Outcome: Push (tie)");
        }
        
        // End the game with the determined outcome
        this.endGame(outcome);
    }
    
    /**
     * End the game
     * @param outcome - The outcome of the game
     */
    private endGame(outcome: GameOutcome): void {
        this.gameInProgress = false;
        
        // Handle payouts based on outcome
        switch (outcome) {
            case GameOutcome.PLAYER_BLACKJACK:
                // Blackjack pays 3:2
                Globals.Balance += Globals.currentBet * 2.5;
                break;
                
            case GameOutcome.PLAYER_WIN:
            case GameOutcome.DEALER_BUST:
                // Regular win pays 1:1
                Globals.Balance += Globals.currentBet * 2;
                break;
                
            case GameOutcome.PUSH:
                // Push returns the bet
                Globals.Balance += Globals.currentBet;
                break;
                
            case GameOutcome.SURRENDER:
                // Surrender returns half the bet
                Globals.Balance += Globals.currentBet * 0.5;
                break;
                
            case GameOutcome.PLAYER_BUST:
            case GameOutcome.DEALER_WIN:
                // Player loses, no payout
                break;
        }
        
        // Note: We don't reset lastBetAmount here to allow for rebet functionality
        
        // Reset current bet but keep points display visible
        Globals.currentBet = 0;
        this.updatePointsDisplay();
        
        // Call onGameEnd callback if provided
        if (this.onGameEnd) {
            this.onGameEnd(outcome, this.playerHand.value, this.dealerHand.value);
        }
    }
    
    /**
     * Resize the card container and reposition hands
     * Called when the window is resized
     */
    public resize(): void {
        console.log("Resizing BlackjackDealer");
        
        // Reposition hands
        this.positionHands();
        
        // Reposition cards in hands
        this.positionCardsInHand(this.playerHand);
        this.positionCardsInHand(this.dealerHand);
        
        // If split hand exists, reposition it too
        if (this.playerSplitHand) {
            this.positionSplitHand();
            this.positionCardsInHand(this.playerSplitHand);
        }
        
        // Reposition points displays
        this.positionPointsDisplays();
    }
    
    /**
     * Initialize the points display system
     */
    private initializePointsSystem(): void {
        console.log("Initializing points system");
        
        // Create container for points display
        this.pointsContainer = new Container();
        this.cardContainer.addChild(this.pointsContainer);
        
        // Create player points display
        this.playerPointsDisplay = new Sprite(Globals.resources.PointsHolder);
        this.playerPointsDisplay.anchor.set(0.5);
        this.pointsContainer.addChild(this.playerPointsDisplay);
        console.log("Player points display created with texture:", this.playerPointsDisplay.texture ? "loaded" : "missing");
        
        // Create dealer points display
        this.dealerPointsDisplay = new Sprite(Globals.resources.PointsHolder);
        this.dealerPointsDisplay.anchor.set(0.5);
        this.pointsContainer.addChild(this.dealerPointsDisplay);
        console.log("Dealer points display created with texture:", this.dealerPointsDisplay.texture ? "loaded" : "missing");
        
       
        // Create player points text (initially showing 0)
        this.playerPointsText = new TextLabel(0, 0, 0.5, '0', 28, 0x000000);
        this.playerPointsText.anchor.set(0.5);
        
        // Apply style to player points text - less bold
        const playerTextStyle = this.playerPointsText.style as any; // Use type assertion to avoid linter errors
        playerTextStyle.fontWeight = 'normal'; // Changed from 'bold' to 'normal'
        playerTextStyle.strokeThickness = 2; // Reduced from 3 to 2
        playerTextStyle.stroke = 0x000000; // Black stroke
        this.playerPointsText.style = playerTextStyle;
        
        this.playerPointsDisplay.addChild(this.playerPointsText);
        
        // Create dealer points text (initially showing 0)
        this.dealerPointsText = new TextLabel(0, 0, 0.5, '0', 28, 0x000000);
        this.dealerPointsText.anchor.set(0.5);
        
        // Apply style to dealer points text - less bold
        const dealerTextStyle = this.dealerPointsText.style as any; // Use type assertion to avoid linter errors
        dealerTextStyle.fontWeight = 'normal'; // Changed from 'bold' to 'normal'
        dealerTextStyle.strokeThickness = 2; // Reduced from 3 to 2
        dealerTextStyle.stroke = 0x000000; // Black stroke
        this.dealerPointsText.style = dealerTextStyle;
        
        this.dealerPointsDisplay.addChild(this.dealerPointsText);
        
        // Position the displays
        this.positionPointsDisplays();
        
        // Initially hide the points display
        this.pointsContainer.visible = false;
        
        console.log("Points system initialized");
    }
    
    /**
     * Position the points displays
     */
    private positionPointsDisplays(): void {
        console.log("Positioning points displays");
        
        // Check if we're in portrait or landscape mode
        const isPortrait = window.innerHeight > window.innerWidth;
        
        // Calculate display scale - make it larger for better visibility
        // Increase scale for mobile devices
        const scale = isPortrait ? 0.7 : 0.9; // Increased from 0.6 to 0.8 for mobile
        
        // Set scale first so positioning is accurate
        this.playerPointsDisplay.scale.set(scale);
        this.dealerPointsDisplay.scale.set(scale);
        
        // Use the consistent card scale calculation
        const cardScale = this.calculateCardScale();
        
        // Calculate card dimensions based on scale
        const cardWidth = 225 * cardScale; // Assuming card texture width is 225px
        const cardHeight = cardWidth * 1.4; // Standard card ratio
        
        // Calculate positions based on card positions
        let playerY, dealerY;
        
        // Position higher above cards on mobile
        playerY = this.playerHand.container.position.y - cardHeight * 0.35;
        console.log("Positioning player points above card at:", playerY);
        
        // Position higher above cards on mobile
        dealerY = this.dealerHand.container.position.y + cardHeight * 0.35;
        console.log("Positioning dealer points above card at:", dealerY);
        
        // Set positions
        this.playerPointsDisplay.position.set(this.playerHand.container.position.x, playerY);
        this.dealerPointsDisplay.position.set(0, dealerY);
        
        // Center text in the displays
        this.playerPointsText.position.set(0, 0);
        this.dealerPointsText.position.set(0, 0);
        
        // Position split points display if it exists
        if (this.playerSplitHand && this.splitPointsDisplay) {
            this.positionSplitPointsDisplay();
        }
        
        console.log("Points displays positioned - Player:", this.playerPointsDisplay.position, "Dealer:", this.dealerPointsDisplay.position);
    }
    
    /**
     * Update the points display
     * @param animate - Whether to animate the update (default: true)
     */
    private updatePointsDisplay(animate: boolean = true): void {
        // Update player points text to show hand value
        this.playerPointsText.text = `${this.playerHand.value}`;
        
        // Update dealer points text to show hand value
        // If the game is in progress and the second card is face down, only show the value of the first card
        if (this.gameInProgress && this.dealerHand.cards.length > 1 && !this.dealerHand.cards[1].faceUp) {
            this.dealerPointsText.text = `${this.dealerHand.cards[0].value}`;
        } else {
            this.dealerPointsText.text = `${this.dealerHand.value}`;
        }
        
        // Update split hand points text if it exists
        if (this.playerSplitHand && this.splitPointsText) {
            this.splitPointsText.text = `${this.playerSplitHand.value}`;
            
            // Make sure split points display is visible
            if (this.splitPointsDisplay) {
                this.splitPointsDisplay.visible = true;
            }
        }
        
        console.log("Updated points display - Player:", this.playerPointsText.text, 
            "Dealer:", this.dealerPointsText.text,
            "Split:", this.splitPointsText?.text || "N/A");
        
        // Animate the points displays when they update (if animation is enabled)
        if (animate) {
            this.animatePointsDisplay();
        }
    }
    
    /**
     * Animate the points displays
     */
    private animatePointsDisplay(): void {
        // Animate player points display
        this.animateSinglePointsDisplay(this.playerPointsDisplay);
        
        // Animate dealer points display
        this.animateSinglePointsDisplay(this.dealerPointsDisplay);
        
        // Animate split points display if it exists
        if (this.splitPointsDisplay) {
            this.animateSinglePointsDisplay(this.splitPointsDisplay);
        }
    }
    
    /**
     * Animate a single points display
     * @param display - The display to animate
     */
    private animateSinglePointsDisplay(display: Sprite): void {
        // Store original scale
        const originalScale = { x: display.scale.x, y: display.scale.y };
        
        // First, scale up slightly
        new Tween(display.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: originalScale.x * 1.2, 
                y: originalScale.y * 1.2 
            }, 150)
            .easing(Easing.Back.Out)
            .onComplete(() => {
                // Then scale back to original size
                new Tween(display.scale, Globals.SceneManager?.tweenGroup)
                    .to({ 
                        x: originalScale.x, 
                        y: originalScale.y 
                    }, 150)
                    .easing(Easing.Back.Out)
                    .start();
            })
            .start();
    }
    
    /**
     * Show the points display with animation
     */
    private showPointsDisplay(): void {
        console.log("Showing points display");
        
        // Make sure the container is visible
        this.pointsContainer.visible = true;
        
        // Check if we're in portrait or landscape mode
        const isPortrait = window.innerHeight > window.innerWidth;
        
        // Calculate target scale - make it larger for better visibility
        // Increase scale for mobile devices
        const targetScale = isPortrait ? 0.8 : 0.9;
        
        // Set initial state for animation
        this.playerPointsDisplay.alpha = 0;
        this.dealerPointsDisplay.alpha = 0;
        this.playerPointsDisplay.scale.set(0);
        this.dealerPointsDisplay.scale.set(0);
        
        // Force immediate update of text to ensure it's correct when displayed
        this.updatePointsDisplay(false); // Pass false to skip animation
        
        // Animate player points display with a delay
        setTimeout(() => {
            console.log("Animating player points display");
            new Tween(this.playerPointsDisplay, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 1 }, 300)
                .easing(Easing.Cubic.Out)
                .start();
                
            new Tween(this.playerPointsDisplay.scale, Globals.SceneManager?.tweenGroup)
                .to({ x: targetScale, y: targetScale }, 400)
                .easing(Easing.Back.Out)
                .start();
        }, 600); // Delay to allow card animations to complete
        
        // Animate dealer points display with a longer delay
        setTimeout(() => {
            console.log("Animating dealer points display");
            new Tween(this.dealerPointsDisplay, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 1 }, 300)
                .easing(Easing.Cubic.Out)
                .start();
                
            new Tween(this.dealerPointsDisplay.scale, Globals.SceneManager?.tweenGroup)
                .to({ x: targetScale, y: targetScale }, 400)
                .easing(Easing.Back.Out)
                .start();
        }, 900); // Longer delay for dealer points
    }
    
    /**
     * Hide the points display with animation
     */
    private hidePointsDisplay(): void {
        // Animate player points display
        new Tween(this.playerPointsDisplay, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0 }, 300)
            .easing(Easing.Cubic.In)
            .start();
            
        new Tween(this.playerPointsDisplay.scale, Globals.SceneManager?.tweenGroup)
            .to({ x: 0, y: 0 }, 300)
            .easing(Easing.Back.In)
            .start();
        
        // Animate dealer points display
        new Tween(this.dealerPointsDisplay, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0 }, 300)
            .easing(Easing.Cubic.In)
            .start();
            
        new Tween(this.dealerPointsDisplay.scale, Globals.SceneManager?.tweenGroup)
            .to({ x: 0, y: 0 }, 300)
            .easing(Easing.Back.In)
            .onComplete(() => {
                // Hide the container after animation completes
                this.pointsContainer.visible = false;
            })
            .start();
    }
    
    /**
     * Place a bet
     * @param amount - The amount to bet
     * @returns Whether the bet was placed successfully
     */
    public placeBet(amount: number): boolean {
        // Check if a game can be started
        if (!this.canStartGame()) {
            return false;
        }
        
        // Check if player has enough balance
        if (amount > Globals.Balance) {
            console.log("Not enough balance to place bet");
            return false;
        }
        
        console.log("Placing bet:", amount);
        
        // Set the current bet
        Globals.currentBet = amount;
        Globals.Balance -= amount;
        Globals.uiContainer?.updateBalance();
        
        // Store the bet amount for rebet functionality
        this.lastBetAmount = amount;
        
        // Explicitly show the bet display in the center chip area
        if (Globals.centerChip) {
            console.log("Showing bet display in center chip");
            Globals.centerChip.showBetDisplay(amount);
            
            // Force the bet holder to be visible
            Globals.centerChip.betHolder.isVisible(true);
            Globals.centerChip.betHolder.alpha = 1;
        } else {
            console.warn("Center chip reference is missing");
        }
        
        // Start the game
        this.startGame();
        
        return true;
    }
    
    /**
     * Get the current player points
     * @returns The player's current points
     */
    public getPlayerPoints(): number {
        return Globals.Balance;
    }
    
    /**
     * Get the current bet amount
     * @returns The current bet amount
     */
    public getCurrentBet(): number {
        return Globals.currentBet;
    }
    
    /**
     * Reset the game for a new round
     */
    public resetGame(): void {
        // Reset game state
        this.gameInProgress = false;
        Globals.gameStarted = false;
        
        // Reset hands
        this.resetHands();
        
        // Reset current bet (but keep lastBetAmount for rebet functionality)
        Globals.currentBet = 0;
        this.updatePointsDisplay();
        this.positionHands()
        
        // Hide points display
        this.hidePointsDisplay();
        
        console.log("Game reset. Ready for a new round.");
    }
    
    /**
     * Test function to force specific scenarios for testing
     * @param scenario - The scenario to test: 'insurance', 'insuranceLost', or 'split'
     * @returns True if the test was set up successfully
     */
    public testScenario(scenario: 'insurance' | 'insuranceLost' | 'split'): boolean {
        console.log(`Setting up test scenario: ${scenario}`);
        
        // Make sure we're not in a game already
        if (this.gameInProgress) {
            console.error("Cannot set up test scenario while game is in progress");
            return false;
        }
        
        // Reset the game first
        this.resetGame();
        
        // Initialize a fresh deck
        this.initializeDeck();
        
        // Set up specific cards based on scenario
        switch (scenario) {
            case 'insurance':
                // Force dealer to have an Ace up card with a 10 down card (blackjack)
                this.setupInsuranceScenario(true);
                break;
            case 'insuranceLost':
                // Force dealer to have an Ace up card with a non-10 down card (no blackjack)
                this.setupInsuranceScenario(false);
                break;
            case 'split':
                // Force player to have a pair
                this.setupSplitScenario();
                break;
            default:
                console.error("Unknown test scenario");
                return false;
        }
        
        // Start the game with the forced cards
        this.gameInProgress = true;
        Globals.gameStarted = true;
        
        // Update hand values
        this.updateHandValue(this.playerHand);
        this.updateHandValue(this.dealerHand);
        
        // Position hands
        this.positionHands();
        
        // Show points display
        this.showPointsDisplay();
        
        // Trigger the appropriate event based on the scenario
        setTimeout(() => {
            if (this.onGameEvent) {
                if (scenario === 'insurance' || scenario === 'insuranceLost') {
                    console.log("Triggering insuranceAvailable event for test scenario");
                    this.onGameEvent('insuranceAvailable');
                } else if (scenario === 'split') {
                    console.log("Triggering splitAvailable event for test scenario");
                    this.onGameEvent('splitAvailable');
                }
            }
        }, 500);
        
        return true;
    }
    
    /**
     * Set up insurance test scenario (dealer has Ace up card)
     * @param dealerHasBlackjack - Whether the dealer should have blackjack
     */
    private setupInsuranceScenario(dealerHasBlackjack: boolean = true): void {
        // Create player hand with non-blackjack cards (e.g., 10 and 5)
        const playerCard1: Card = {
            suit: 'hearts',
            rank: '10',
            value: 10,
            spriteKey: `${this.getSuitPrefix('hearts')}10`,
            faceUp: true
        };
        
        const playerCard2: Card = {
            suit: 'diamonds',
            rank: '5',
            value: 5,
            spriteKey: `${this.getSuitPrefix('diamonds')}5`,
            faceUp: true
        };
        
        // Create dealer hand with Ace up card
        const dealerCard1: Card = {
            suit: 'spades',
            rank: 'A',
            value: 11,
            spriteKey: `${this.getSuitPrefix('spades')}A`,
            faceUp: true
        };
        
        // Create dealer's second card based on whether dealer should have blackjack
        const dealerCard2: Card = {
            suit: 'clubs',
            rank: dealerHasBlackjack ? 'K' : '6',
            value: dealerHasBlackjack ? 10 : 6,
            spriteKey: `${this.getSuitPrefix('clubs')}${dealerHasBlackjack ? 'K' : '6'}`,
            faceUp: false
        };
        
        // Create card sprites
        this.createCardSprite(playerCard1);
        this.createCardSprite(playerCard2);
        this.createCardSprite(dealerCard1);
        this.createCardSprite(dealerCard2);
        
        // Add cards to hands
        this.playerHand.cards = [playerCard1, playerCard2];
        this.dealerHand.cards = [dealerCard1, dealerCard2];
        
        // Add sprites to containers
        this.playerHand.container.removeChildren();
        this.dealerHand.container.removeChildren();
        
        if (playerCard1.sprite) this.playerHand.container.addChild(playerCard1.sprite);
        if (playerCard2.sprite) this.playerHand.container.addChild(playerCard2.sprite);
        if (dealerCard1.sprite) this.dealerHand.container.addChild(dealerCard1.sprite);
        if (dealerCard2.sprite) this.dealerHand.container.addChild(dealerCard2.sprite);
        
        // Position cards in hands
        this.positionCardsInHand(this.playerHand);
        this.positionCardsInHand(this.dealerHand);
        
        console.log(`Insurance scenario set up: Dealer has Ace up card${dealerHasBlackjack ? ' and blackjack' : ' but no blackjack'}`);
    }
    
    /**
     * Set up split test scenario (player has a pair)
     */
    private setupSplitScenario(): void {
        // Create player hand with a pair of 8s
        const playerCard1: Card = {
            suit: 'hearts',
            rank: '8',
            value: 8,
            spriteKey: `${this.getSuitPrefix('hearts')}8`,
            faceUp: true
        };
        
        const playerCard2: Card = {
            suit: 'diamonds',
            rank: '8',
            value: 8,
            spriteKey: `${this.getSuitPrefix('diamonds')}8`,
            faceUp: true
        };
        
        // Create dealer hand with a non-Ace up card
        const dealerCard1: Card = {
            suit: 'spades',
            rank: '6',
            value: 6,
            spriteKey: `${this.getSuitPrefix('spades')}6`,
            faceUp: true
        };
        
        const dealerCard2: Card = {
            suit: 'clubs',
            rank: '10',
            value: 10,
            spriteKey: `${this.getSuitPrefix('clubs')}10`,
            faceUp: false
        };
        
        // Create card sprites
        this.createCardSprite(playerCard1);
        this.createCardSprite(playerCard2);
        this.createCardSprite(dealerCard1);
        this.createCardSprite(dealerCard2);
        
        // Add cards to hands
        this.playerHand.cards = [playerCard1, playerCard2];
        this.dealerHand.cards = [dealerCard1, dealerCard2];
        
        // Add sprites to containers
        this.playerHand.container.removeChildren();
        this.dealerHand.container.removeChildren();
        
        if (playerCard1.sprite) this.playerHand.container.addChild(playerCard1.sprite);
        if (playerCard2.sprite) this.playerHand.container.addChild(playerCard2.sprite);
        if (dealerCard1.sprite) this.dealerHand.container.addChild(dealerCard1.sprite);
        if (dealerCard2.sprite) this.dealerHand.container.addChild(dealerCard2.sprite);
        
        // Position cards in hands
        this.positionCardsInHand(this.playerHand);
        this.positionCardsInHand(this.dealerHand);
        
        console.log("Split scenario set up: Player has a pair of 8s");
    }
    
    /**
     * Set a callback for game events
     * @param callback - The callback function to call when a game event occurs
     */
    public setGameEventCallback(callback: (eventType: string, data?: any) => void): void {
        this.onGameEvent = callback;
    }
    
    /**
     * Get the current game event callback
     * @returns The current game event callback
     */
    public getGameEventCallback(): ((eventType: string, data?: any) => void) | undefined {
        return this.onGameEvent;
    }
    
    /**
     * Set up both insurance and split test scenario
     * @deprecated This method is kept for backward compatibility
     */
    private setupBothScenario(): void {
        // Create player hand with a pair of Queens
        const playerCard1: Card = {
            suit: 'hearts',
            rank: 'Q',
            value: 10,
            spriteKey: `${this.getSuitPrefix('hearts')}Q`,
            faceUp: true
        };
        
        const playerCard2: Card = {
            suit: 'diamonds',
            rank: 'Q',
            value: 10,
            spriteKey: `${this.getSuitPrefix('diamonds')}Q`,
            faceUp: true
        };
        
        // Create dealer hand with Ace up card
        const dealerCard1: Card = {
            suit: 'spades',
            rank: 'A',
            value: 11,
            spriteKey: `${this.getSuitPrefix('spades')}A`,
            faceUp: true
        };
        
        const dealerCard2: Card = {
            suit: 'clubs',
            rank: '9',
            value: 9,
            spriteKey: `${this.getSuitPrefix('clubs')}9`,
            faceUp: false
        };
        
        // Create card sprites
        this.createCardSprite(playerCard1);
        this.createCardSprite(playerCard2);
        this.createCardSprite(dealerCard1);
        this.createCardSprite(dealerCard2);
        
        // Add cards to hands
        this.playerHand.cards.push(playerCard1, playerCard2);
        this.dealerHand.cards.push(dealerCard1, dealerCard2);
        
        // Add sprites to containers
        if (playerCard1.sprite) this.playerHand.container.addChild(playerCard1.sprite);
        if (playerCard2.sprite) this.playerHand.container.addChild(playerCard2.sprite);
        if (dealerCard1.sprite) this.dealerHand.container.addChild(dealerCard1.sprite);
        if (dealerCard2.sprite) this.dealerHand.container.addChild(dealerCard2.sprite);
        
        console.log("Both scenarios set up: Player has a pair of Queens and dealer has Ace up card");
    }
    
    /**
     * Get the last bet amount for rebet functionality
     * @returns The last bet amount
     */
    public getLastBetAmount(): number {
        return this.lastBetAmount;
    }
    
    /**
     * Rebet with the same amount as the last bet
     */
    public rebet(): boolean {
        if (!this.canStartGame()) {
            return false;
        }
        
        // Check if there was a previous bet
        if (this.lastBetAmount <= 0) {
            console.log("No previous bet to repeat");
            return false;
        }
        
        // Check if player has enough balance
        if (Globals.Balance < this.lastBetAmount) {
            console.log("Not enough balance to rebet");
            return false;
        }
        
        console.log("Rebetting with amount:", this.lastBetAmount);
        
        // Place the bet
        this.placeBet(this.lastBetAmount);
        
        // Explicitly show the bet display in the center chip area
        if (Globals.centerChip) {
            console.log("Showing bet display in center chip");
            
            // Force any active tweens to stop
            if (Globals.centerChip.stopActiveTweens) {
                Globals.centerChip.stopActiveTweens();
            }
            
            // Show the bet display with the current bet amount
            Globals.centerChip.showBetDisplay(this.lastBetAmount);
            
            // Force the bet holder to be visible with full opacity
            Globals.centerChip.betHolder.isVisible(true);
            Globals.centerChip.betHolder.alpha = 1;
            Globals.centerChip.betHolder.scale.set(1 * config.scaleFactor);
        } else {
            console.warn("Center chip reference is missing");
        }
        
        return true;
    }
    
    
    /**
     * Send a game event to the registered callback
     * @param eventType - The type of event
     * @param data - Optional data to send with the event
     */
    private sendGameEvent(eventType: string, data?: any): void {
        if (this.onGameEvent) {
            this.onGameEvent(eventType, data);
        }
    }

    /**
     * Player stands on split hand
     * @param hand - Which hand to stand on ('first' or 'second')
     */
    public playerStandSplitHand(hand: 'first' | 'second'): void {
        if (!this.beginAction('stand')) {
            return;
        }
        
        console.log(`Player stands on ${hand} split hand`);
        
        if (hand === 'first') {
            // First hand stands, switch to second hand
            this.switchToSecondSplitHand();
        } else {
            // Second hand stands, complete the split hand play
            this.completeSplitHandPlay();
        }
        
        // End the stand action
        this.endAction('stand');
    }

    /**
     * Player action: Double down on a split hand
     * @param hand - Which split hand to double down on ('first' or 'second')
     */
    public playerDoubleDownSplitHand(hand: 'first' | 'second'): void {
        if (!this.beginAction('doubleDown')) {
            return;
        }
        
        console.log(`Player doubles down on ${hand} split hand`);
        
        // Determine which hand to double down on
        const targetHand = hand === 'first' ? this.playerHand : this.playerSplitHand;
        
        if (!targetHand) {
            console.error("Target hand not found");
            this.endAction('doubleDown');
            return;
        }
        
        // Check if player has enough balance to double down
        if (Globals.Balance < Globals.currentBet) {
            console.log("Not enough balance to double down");
            this.endAction('doubleDown');
            return;
        }
        
        // Double the bet
        Globals.Balance -= Globals.currentBet;
        Globals.uiContainer?.updateBalance();
        Globals.emitter?.Call("addDoubleChip", Globals.currentBet);
        // Deal one more card to the target hand
        this.dealCardWithErrorHandling(targetHand, true)
            .then(() => {
                if (hand === 'first') {
                    // First hand doubled, switch to second hand
                    this.switchToSecondSplitHand();
                } else {
                    // Second hand doubled, complete the split hand play
            this.completeSplitHandPlay();
        }
                
                // End the double down action
                this.endAction('doubleDown');
            });
    }

    /**
     * Complete play for both split hands
     */
    private completeSplitHandPlay(): void {
        if (!this.playerSplitHand) return;
        
        console.log("Completing split hand play");
        
        // If both hands are busted, end the game immediately without playing dealer's hand
        if (this.playerHand.busted && this.playerSplitHand.busted) {
            console.log("Both split hands busted, ending game without dealer play");
            
            // Determine outcomes (both are player busts)
            const firstHandOutcome = GameOutcome.PLAYER_BUST;
            const secondHandOutcome = GameOutcome.PLAYER_BUST;
            
            // End the game with both outcomes
            this.endSplitGame(firstHandOutcome, secondHandOutcome);
            return;
        }
        
        // Reveal dealer's hole card
        this.revealDealerCard();
        
        // Play out dealer's hand
        setTimeout(() => {
            this.dealerTurn();
        }, 600);
    }

    /**
     * Reveal dealer's hole card
     */
    private revealDealerHoleCard(): void {
        // Find the hole card (second card that is face down)
        const holeCard = this.dealerHand.cards.find(card => !card.faceUp);
        
        if (holeCard) {
            // Flip the card face up
            holeCard.faceUp = true;
            
            // Update the sprite texture
            if (holeCard.sprite) {
                holeCard.sprite.texture = Globals.resources[holeCard.spriteKey];
            }
            
            // Update dealer's hand value display
            this.updatePointsDisplay();
            
            console.log("Dealer's hole card revealed:", holeCard);
        }
    }

    /**
     * Play out dealer's hand for split game
     */
    private playDealerHandForSplit(): void {
        const dealerPlay = () => {
            // Check if dealer needs to hit
            if (this.dealerHand.value < 17) {
                // Use dealCardToHand which returns a Promise
                this.dealCardToHand(this.dealerHand, true).then(() => {
                    // Update points display
                    this.updatePointsDisplay();
                    
                    // Continue dealer play after a delay
                    setTimeout(dealerPlay, 800);
                });
            } else {
                // Dealer stands, determine outcomes
                this.determineSplitOutcomes();
            }
        };
        
        // Start dealer play
        dealerPlay();
    }

    /**
     * Determine split outcomes
     */
    private determineSplitOutcomes(): void {
        if (!this.playerSplitHand) return;
        
        console.log("Determining split hand outcomes");
        console.log("First hand value:", this.playerHand.value, "busted:", this.playerHand.busted);
        console.log("Second hand value:", this.playerSplitHand.value, "busted:", this.playerSplitHand.busted);
        console.log("Dealer value:", this.dealerHand.value, "busted:", this.dealerHand.busted);
        
        // Determine outcome for first hand
        let firstHandOutcome: GameOutcome;
        if (this.playerHand.busted) {
            // If player busts, they lose regardless of dealer's hand
            firstHandOutcome = GameOutcome.PLAYER_BUST;
        } else if (this.dealerHand.busted) {
            // If dealer busts and player didn't, player wins
            firstHandOutcome = GameOutcome.DEALER_BUST;
        } else if (this.playerHand.value > this.dealerHand.value) {
            // Player has higher value without busting
            firstHandOutcome = GameOutcome.PLAYER_WIN;
        } else if (this.playerHand.value < this.dealerHand.value) {
            // Dealer has higher value without busting
            firstHandOutcome = GameOutcome.DEALER_WIN;
        } else {
            // Equal values result in a push
            firstHandOutcome = GameOutcome.PUSH;
        }
        
        // Determine outcome for second hand
        let secondHandOutcome: GameOutcome;
        if (this.playerSplitHand.busted) {
            // If player busts, they lose regardless of dealer's hand
            secondHandOutcome = GameOutcome.PLAYER_BUST;
        } else if (this.dealerHand.busted) {
            // If dealer busts and player didn't, player wins
            secondHandOutcome = GameOutcome.DEALER_BUST;
        } else if (this.playerSplitHand.value > this.dealerHand.value) {
            // Player has higher value without busting
            secondHandOutcome = GameOutcome.PLAYER_WIN;
        } else if (this.playerSplitHand.value < this.dealerHand.value) {
            // Dealer has higher value without busting
            secondHandOutcome = GameOutcome.DEALER_WIN;
        } else {
            // Equal values result in a push
            secondHandOutcome = GameOutcome.PUSH;
        }
        
        // End the game with both outcomes
        this.endSplitGame(firstHandOutcome, secondHandOutcome);
    }

    /**
     * End the game with split outcomes
     */
    private endSplitGame(firstHandOutcome: GameOutcome, secondHandOutcome: GameOutcome): void {
        // Calculate payouts based on outcomes
        let totalPayout = 0;
        
        // First hand payout
        if (firstHandOutcome === GameOutcome.PLAYER_WIN || firstHandOutcome === GameOutcome.DEALER_BUST) {
            totalPayout += Globals.currentBet * 2; // Win: return bet + equal amount
        } else if (firstHandOutcome === GameOutcome.PUSH) {
            totalPayout += Globals.currentBet; // Push: return bet
        }
        // Note: No payout for PLAYER_BUST or DEALER_WIN
        
        // Second hand payout
        if (secondHandOutcome === GameOutcome.PLAYER_WIN || secondHandOutcome === GameOutcome.DEALER_BUST) {
            totalPayout += Globals.currentBet * 2; // Win: return bet + equal amount
        } else if (secondHandOutcome === GameOutcome.PUSH) {
            totalPayout += Globals.currentBet; // Push: return bet
        }
        // Note: No payout for PLAYER_BUST or DEALER_WIN
        
        // Update balance
        Globals.Balance += totalPayout;
        Globals.uiContainer?.updateBalance();
        
        // Determine overall outcome for UI based on the best result
        let overallOutcome: GameOutcome;
        let bestPlayerValue: number;
        
        // Determine the best outcome to show
        if ((firstHandOutcome === GameOutcome.PLAYER_WIN || firstHandOutcome === GameOutcome.DEALER_BUST) ||
            (secondHandOutcome === GameOutcome.PLAYER_WIN || secondHandOutcome === GameOutcome.DEALER_BUST)) {
            // If either hand won, show player win
            overallOutcome = GameOutcome.PLAYER_WIN;
        } else if (firstHandOutcome === GameOutcome.PUSH || secondHandOutcome === GameOutcome.PUSH) {
            // If either hand pushed and none won, show push
            overallOutcome = GameOutcome.PUSH;
        } else {
            // Both hands lost, show dealer win
            overallOutcome = GameOutcome.DEALER_WIN;
        }
        if(!this.playerSplitHand) return;
        // Get the best non-busted hand value for display
        if (!this.playerHand.busted && !this.playerSplitHand.busted) {
            // Both hands are valid, use the higher value
            bestPlayerValue = Math.max(this.playerHand.value, this.playerSplitHand.value);
        } else if (!this.playerHand.busted) {
            // Only first hand is valid
            bestPlayerValue = this.playerHand.value;
        } else if (!this.playerSplitHand.busted) {
            // Only second hand is valid
            bestPlayerValue = this.playerSplitHand.value;
        } else {
            // Both hands busted, use the lower bust (closer to 21)
            bestPlayerValue = Math.min(this.playerHand.value, this.playerSplitHand.value);
        }
        
        console.log("Split game ended with outcomes:", {
            firstHand: firstHandOutcome,
            secondHand: secondHandOutcome,
            overall: overallOutcome,
            bestPlayerValue: bestPlayerValue,
            dealerValue: this.dealerHand.value,
            totalPayout: totalPayout
        });
        
        // Send game end event with the best outcome
        if (this.onGameEnd) {
            this.onGameEnd(
                overallOutcome,
                bestPlayerValue,
                this.dealerHand.value
            );
        }
        
        // Reset game state
        this.gameInProgress = false;
        Globals.currentBet = 0;
        Globals.gameStarted = false;
    }

    /**
     * Check if player has hit at least once
     * @returns Whether the player has hit at least once
     */
    public hasPlayerHit(): boolean {
        // Player has hit if they have more than 2 cards
        return this.playerHand.cards.length > 2;
    }

    /**
     * Get the currently active split hand
     * @returns 'first', 'second', or null if not in split mode
     */
    public getActiveSplitHand(): 'first' | 'second' | null {
        if (!this.playerSplitHand) return null;
        
        return this.playerSplitHand.container.scale.x > this.playerHand.container.scale.x ? 'second' : 'first';
    }

    /**
     * Create split points display
     */
    private createSplitPointsDisplay(): void {
        console.log("Creating split points display");
        
        // Create split points display
        this.splitPointsDisplay = new Sprite(Globals.resources.PointsHolder);
        this.splitPointsDisplay.anchor.set(0.5);
        this.splitPointsDisplay.scale.set(0.6);
        
        // Create split points text
        this.splitPointsText = new TextLabel(0, 0, 0.5, '0', 28, 0x000000);
        
        // Add split points text to display
        this.splitPointsDisplay.addChild(this.splitPointsText);
        
        // Add split points display to points container
        this.pointsContainer.addChild(this.splitPointsDisplay);
        
        // Position the split points display
        this.positionSplitPointsDisplay();
        
        console.log("Split points display created");
    }

    /**
     * Position the split points display
     */
    private positionSplitPointsDisplay(): void {
        if (!this.splitPointsDisplay || !this.playerSplitHand) return;
        
        this.splitPointsDisplay.position.set(
            this.playerSplitHand.container.position.x,
            this.playerPointsDisplay.position.y
        );
    }

    /**
     * Check if player can split their hand
     * @returns Whether the player can split
     */
    private canSplit(): boolean {
        // Check if player has exactly 2 cards of the same rank
        if (this.playerHand.cards.length !== 2 || 
            this.playerHand.cards[0].value !== this.playerHand.cards[1].value) {
            return false;
        }
        
        // Check if player has enough balance to place another bet
        if (Globals.Balance < Globals.currentBet) {
            return false;
        }
        
        // Check if player already has a split hand
        if (this.playerSplitHand !== null) {
            return false;
        }
        
        return true;
    }

    /**
     * Check if a new game can be started
     * @returns Whether a new game can be started
     */
    private canStartGame(): boolean {
        // Can't start a game if one is already in progress
        if (this.gameInProgress) {
            console.log("Game already in progress");
            return false;
        }
        
        // Can't start a game if an action is in progress
        if (this.actionInProgress || this.dealInProgress) {
            console.log("Action or deal in progress");
            return false;
        }
        
        return true;
    }

    /**
     * Get the player's split hand
     * @returns The player's split hand or null if not split
     */
    public getPlayerSplitHand(): Hand | null {
        return this.playerSplitHand;
    }
} 


