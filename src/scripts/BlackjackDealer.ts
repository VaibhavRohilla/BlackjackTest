import { Card, Hand } from "./hand";
import { GameOutcome } from "./result";
import { getSuitPrefix, Globals } from "./globals";
import { Container, Sprite } from "pixi.js";
import { Result } from "./result";

/**
 * Interface for server card data to properly type the parameters
 */
interface ServerCardData {
    rank: string;
    suit: string;
    value: number;
    faceUp: boolean;
}

/**
 * Interface for server hand data
 */
interface ServerHandData {
    type: 'player' | 'dealer' | 'split';
    cards: ServerCardData[];
    value: number;
    busted: boolean;
    blackjack: boolean;
    soft: boolean;
}

/**
 * Convert a server suit value to a valid Card suit type
 */
function convertToCardSuit(suit: string): "hearts" | "diamonds" | "clubs" | "spades" {
    switch (suit.toLowerCase()) {
        case "hearts":
            return "hearts";
        case "diamonds":
            return "diamonds";
        case "clubs":
            return "clubs";
        case "spades":
            return "spades";
        default:
            console.warn(`Unknown suit type: ${suit}, defaulting to hearts`);
            return "hearts";
    }
}

/**
 * Handles card distribution and game logic for blackjack
 */
export class BlackjackDealer extends Container {
    dealerHand: Hand = new Hand('dealer');
    playerHand: Hand = new Hand('player');
    splitHand: Hand | null = null;
    cardContainer: Container = new Container();
    
    // Game state properties
    private gameInProgress: boolean = false;
    public lastBetAmount: number = 0;
    public playerInsuranceBet: number = 0;
    private activeSplitHand: 'first' | 'second' | null = null;
    
    // Points display properties
    private pointsContainer: Container = new Container();
    private playerPointsDisplay: Container = new Container();
    private dealerPointsDisplay: Container = new Container();
    private splitPointsDisplay: Container | null = null;
    
    /** Callback for game end events */
    private onGameEnd?: (outcome: GameOutcome, playerValue: number, dealerValue: number) => void;
        
    /** Callback for special game events */
    private onGameEvent?: (eventType: string, data?: any) => void;
   
    // Action states
    public actionInProgress: boolean = false;
    public currentAction: string = '';
    private _standRequestedAfterHit: boolean = false;
 
    // Add dealerHasBlackjack property to the class
    private dealerHasBlackjack: boolean = false;
 
    // Add this property to the class definition
    private _dealCardTimeout: number | null = null;
    
    // Store the actual dealer's hole card value without showing it
    private dealerHoleCardValue: number = 0;
    private dealerHoleCardRank: string = '';
    
    // Add a property to track if double down was used
    private _doubledDown: boolean = false;
    
    // Add actionStartTime property to BlackjackDealer class to track when actions started
    public actionStartTime: number = 0;
    
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
        
        // Add points container
        this.addChild(this.pointsContainer);
    }
    
    /**
     * Initialize hands for a new game
     */
    private initializeHands(): void {
        this.dealerHand.reset();
        this.playerHand.reset();
        if (this.splitHand) {
            this.splitHand.reset();
        }
    }
  
    /**
     * Reset player and dealer hands
     */
        resetHands(): void {
        this.dealerHand.reset();
        this.playerHand.reset();
        if (this.splitHand) {
            this.splitHand.reset();
        }
    }
    
    /**
     * Reset the game for a new round
     */
    public resetGame(): void {
        // Reset game state
        this.gameInProgress = false;
        
        // Reset hands
        this.resetHands();
        
        // Reset insurance bet
        this.playerInsuranceBet = 0;
        
        // Reset split hand
        this.splitHand = null;
        this.activeSplitHand = null;
        
        // Reset dealer hole card values
        this.dealerHoleCardValue = 0;
        this.dealerHoleCardRank = '';
        
        // Reset blackjack flag
        this.dealerHasBlackjack = false;
        
        // Reset action flags
        this.actionInProgress = false;
        this.currentAction = '';
        this._standRequestedAfterHit = false;
        
        // Reset doubled down flag
        this._doubledDown = false;
        
        console.log("BlackjackDealer game reset");
    }
    
    /**
     * Start a new game
     * @returns Whether the game was started successfully
     */
    public startGame(): boolean {
        if (this.gameInProgress) {
            console.warn('Game already in progress');
            return false;
        }
        
        // Check if there's a current bet
        if (!Globals.currentBet || Globals.currentBet <= 0) {
            console.warn('No bet placed');
            return false;
        }
        
        this.gameInProgress = true;
        // Store the current bet as the last bet amount for rebet functionality
        this.lastBetAmount = Globals.currentBet;
        // Return success
        return true;
    }
    
    /**
     * Check for all special conditions after initial deal
     * This should only sync with backend, not implement logic
     */
    public checkInitialConditions(onComplete?: () => void): void {
        // No need to implement game logic here, just notify that initial cards are dealt
        // and wait for backend to provide the game state
        console.log("Initial cards dealt, waiting for backend state update");
        
            if (this.onGameEvent) {
            this.onGameEvent('initialCardsDealt', {
                playerCards: this.playerHand.cards.length,
                dealerCards: this.dealerHand.cards.length
            });
        }
        
        // Call completion callback if provided
        if (onComplete) {
            onComplete();
        }
    }
    
    /**
     * Process dealer blackjack check
     * This should be handled by backend, not frontend
     */
    public processDealerBlackjackCheck(): boolean {
        // This should be removed - only used for notification
        console.log("Dealer blackjack check handled by backend");
        return false;
    }
    
    /**
     * Determine the outcome of the game
     * This is now completely handled by the backend
     */
    private determineOutcome(): void {
        console.log("Game outcome determined by backend server");
        // Do not implement game logic here
    }
    
    /**
     * Dealer plays their turn - should be handled by backend
     */
    private dealerTurn(): Promise<void> {
        console.log("Dealer turn handled by backend");
        return Promise.resolve();
    }
    
    /**
     * Handle split hand outcome - should be handled by backend
     */
    private handleSplitHandOutcome(): void {
        console.log("Split hand outcome handled by backend");
        // Do not implement game logic here
    }
    
    /**
     * Update the points display
     * @param animate - Whether to animate the update (default: true)
     */
    updatePointsDisplay(animate: boolean = true): void {
        // Update player hand points
        this.playerHand.updatePointsDisplay(animate);
        
        // Update dealer hand points
        this.dealerHand.updatePointsDisplay(animate);
        
        // Update split hand points if it exists
        if (this.splitHand) {
            this.splitHand.updatePointsDisplay(animate);
        }
    }
    
    /**
     * Position hands on the screen
     */
    positionHands(): void {
        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Calculate positions for player and dealer hands
        const playerY = screenHeight * 0.40; // Player hand at 40% from top
        const dealerY = -screenHeight * 0.25; // Dealer hand at 25% from top
        
        // Position dealer hand in center
        this.dealerHand.position.set(0, dealerY);
        
        // Position hands for split or non-split scenario
        if (this.splitHand) {
            // When split is active:
            // First hand (playerHand) on right side
            // Second hand (splitHand) on left side
            const splitDistance = 200; // Distance between split hands
            
            // First hand on right
            this.playerHand.position.set(splitDistance / 2, playerY);
            
            // Second hand on left
            this.splitHand.position.set(-splitDistance / 2, playerY);
            
            // Add visual indication for active hand (could be animated highlight, etc.)
            if (this.activeSplitHand === 'first') {
                // Highlight first hand (optional visual feedback)
                // Could add glow effect, slight scale up, etc.
            } else if (this.activeSplitHand === 'second') {
                // Highlight second hand (optional visual feedback)
                // Could add glow effect, slight scale up, etc.
            }
            
            // Ensure both hands reposition their cards properly
            this.playerHand.positionCardsInHand(this.playerHand);
            if (this.splitHand) {
                this.splitHand.positionCardsInHand(this.splitHand);
            }
        } else {
            // No split - just position player hand in center
            this.playerHand.position.set(0, playerY);
        }
        
        // Position points displays
        this.positionPointsDisplays();
    }
    
    /**
     * Position points displays
     */
    positionPointsDisplays(): void {
        // Position points displays relative to their hands
        const playerOffset = { x: 0, y: 50 }; // Offset below player hand
        const dealerOffset = { x: 0, y: -50 }; // Offset above dealer hand
        
        // Position player points display
        if (this.playerPointsDisplay) {
            this.playerPointsDisplay.position.set(
                this.playerHand.position.x + playerOffset.x,
                this.playerHand.position.y + playerOffset.y
            );
        }
        
        // Position dealer points display
        if (this.dealerPointsDisplay) {
            this.dealerPointsDisplay.position.set(
                this.dealerHand.position.x + dealerOffset.x,
                this.dealerHand.position.y + dealerOffset.y
            );
        }
        
        // Position split points display if it exists
        if (this.splitHand && this.splitPointsDisplay) {
            this.splitPointsDisplay.position.set(
                this.splitHand.position.x + playerOffset.x,
                this.splitHand.position.y + playerOffset.y
            );
        }
    }
    
    /**
     * Check if player can split their hand
     * @returns Whether the player can split
     */
    public canSplit(): boolean {
        // Can't split if already have a split hand
        if (this.splitHand) {
            return false;
        }
        
        // Basic conditions for split: two cards of the same value
        if (this.playerHand.cards.length !== 2) {
            return false;
        }
        
        // Check if both cards have the same value
        const firstCard = this.playerHand.cards[0];
        const secondCard = this.playerHand.cards[1];
        
        if (!firstCard || !secondCard) {
            return false;
        }
        
        return firstCard.value === secondCard.value;
    }
    
    /**
     * Get the last bet amount for rebet functionality
     * @returns The last bet amount, adjusted for double downs
     */
    public getLastBetAmount(): number {
        // If the bet was doubled, return half the amount to get the original bet
        return this.wasDoubled() ? this.lastBetAmount / 2 : this.lastBetAmount;
    }
    
    /**
     * Get the current game event callback
     * @returns The current game event callback
     */
    public getGameEventCallback(): ((eventType: string, data?: any) => void) | undefined {
        return this.onGameEvent;
    }
    
    /**
     * Resize the card container and reposition hands
     * Called when the window is resized
     */
    public resize(): void {
        console.log("Resizing BlackjackDealer");
        
        // Reposition hands
        this.positionHands();
        this.cardContainer.position.set(window.innerWidth/2, window.innerHeight/2);
      
        // Resize hands
        this.playerHand.resize();
        this.dealerHand.resize();
        if (this.splitHand) {
            this.splitHand.resize();
            
            // Debug log to verify split hand state
            console.log(`Split hand resize: cards=${this.splitHand.cards.length}, playerHand=${this.playerHand.cards.length}`);
        }
    }
    
    /**
     * Set a callback for game events
     * @param callback - The callback function to call when a game event occurs
     */
    public setGameEventCallback(callback: (eventType: string, data?: any) => void): void {
        this.onGameEvent = callback;
    }
    
    /**
     * Set a callback for game end events
     * @param callback - The callback function to call when the game ends
     */
    public setGameEndCallback(callback: (outcome: GameOutcome, playerValue: number, dealerValue: number) => void): void {
        this.onGameEnd = callback;
    }
    
    /**
     * Check if player has hit
     * @returns True if player has hit (has more than 2 cards)
     */
    public hasPlayerHit(): boolean {
        // If player has more than 2 cards, they've hit
        return this.playerHand.cards.length > 2;
    }

    /**
     * Check if insurance is available on the dealer's hand
     * Insurance is available when dealer's face-up card is an Ace.
     * @returns True if insurance is available
     */
    isInsuranceAvailable(): boolean {
        // Check if dealer has exactly two cards (initial deal) and first card is an Ace
        if (this.dealerHand.cards.length === 0) {
            return false;
        }
        
        // We only need to check if the dealer's up card is an Ace
        const dealerUpCard = this.dealerHand.cards[0];
        return dealerUpCard.rank === 'A';
    }

    /**
     * Set active split hand
     * @param hand - Which hand to set as active ('first' or 'second')
     * @returns The active hand
     */
    public setActiveSplitHand(hand: 'first' | 'second'): 'first' | 'second' | null {
        this.activeSplitHand = hand;
        
        // Notify of state change only, not UI action
        if (this.onGameEvent) {
            this.onGameEvent('activeHandChanged', { activeHand: hand });
        }
        
        return this.activeSplitHand;
    }
    
    /**
     * Get the active split hand
     * @returns The active split hand
     */
    public getActiveSplitHand(): 'first' | 'second' | null {
        return this.activeSplitHand;
    }

    /**
     * Player hit on split hand
     * @param hand - Which hand to hit ('first' or 'second')
     * @returns Whether the hit was successful
     */
    public playerHitSplitHand(hand: 'first' | 'second'): boolean {
        if (!this.beginAction('hitSplit')) {
            return false;
        }
        
        console.log(`Hitting on split hand: ${hand}`);
        
        // Check if split hand exists
        if (!this.splitHand) {
            console.error("Cannot hit on split hand: no split hand exists");
            this.endAction('hitSplit');
            return false;
        }
        
        // Make sure we're acting on the correct hand
        if (this.activeSplitHand !== hand) {
            console.log(`Active hand (${this.activeSplitHand}) doesn't match requested hand (${hand}), updating active hand`);
            // We'll update the active hand but without triggering another UI update
            this.activeSplitHand = hand;
        }
        
        // Determine which hand to hit
        const handToHit = hand === 'first' ? this.playerHand : this.splitHand;
        
        // Deal a card to the selected hand
        handToHit.dealCardWithErrorHandling(true)
            .then(card => {
                if (!card) {
                    console.error("Failed to deal card to split hand");
                    this.endAction('hitSplit');
                    return;
                }
                
                console.log(`Card dealt to ${hand} hand: ${card.rank}${card.suit}`);
                
                // Force card positioning to ensure visibility
                if (hand === 'first') {
                    this.playerHand.positionCardsInHand(this.playerHand);
                } else if (this.splitHand) {
                    this.splitHand.positionCardsInHand(this.splitHand);
                }
                
                // Check if the hand busted or reached 21
                if (handToHit.busted || handToHit.value >= 21) {
                    console.log(`Split hand ${hand} ${handToHit.busted ? 'busted' : 'reached 21'}`);
                    
                    // If both hands have been played, move to dealer's turn
                    if (this.areBothSplitHandsPlayed()) {
                        console.log("Both split hands have been played, moving to dealer's turn");
                        // End the hitSplit action before completing player turn
                        this.endAction('hitSplit');
                        
                        // Small delay before dealer turn to allow UI to update
                        setTimeout(() => {
                        this.completePlayerTurn();
                        }, 500);
                    } else {
                        // Switch to the other hand
                        const nextHand = hand === 'first' ? 'second' : 'first';
                        console.log(`Switching to ${nextHand} hand after ${hand} hand is done`);
                        
                        // End the current action before setting the active hand
                        this.endAction('hitSplit');
                        
                        // Small delay to ensure UI updates properly
                        setTimeout(() => {
                        this.setActiveSplitHand(nextHand);
                        }, 300);
                    }
                } else {
                    // Hand is still active, end the current action
                this.endAction('hitSplit');
                    
                    // Notify about the active hand (only if it changed)
                    if (this.onGameEvent && this.activeSplitHand === hand) {
                        this.onGameEvent('activeHandChanged', { activeHand: hand });
                    }
                }
            })
            .catch(error => {
                console.error("Error hitting split hand:", error);
                this.endAction('hitSplit');
            });
            
        return true;
    }
    
    /**
     * Check if both split hands have been played
     * @returns Whether both split hands have been played
     */
    private areBothSplitHandsPlayed(): boolean {
        // If there's no split hand, return true (nothing to play)
        if (!this.splitHand) return true;
        
        // Check if first hand is done (busted or reached 21)
        const firstHandDone = this.playerHand.busted || this.playerHand.value >= 21;
        
        // Check if second hand is done (busted or reached 21)
        const secondHandDone = this.splitHand.busted || this.splitHand.value >= 21;
        
        console.log(`Checking if both hands played - First hand done: ${firstHandDone}, Second hand done: ${secondHandDone}`);
        
        // If both hands are done, we're done
        if (firstHandDone && secondHandDone) {
            // If both hands are busted, end the game immediately with player_bust
            // This is a special case - we don't want to wait for dealer turn if both hands bust
            if (this.playerHand.busted && this.splitHand.busted) {
                console.log("Both split hands busted, ending game with player bust");
                
                // To avoid race conditions with animation, use setTimeout
                setTimeout(() => {
                    if (this.gameInProgress) {  // Double-check game is still in progress
                        this.endGame(GameOutcome.PLAYER_BUST);
                    }
                }, 500);
            } else if (this.activeSplitHand === 'second') {
                // If we just finished the second hand and it's not a double-bust,
                // we should continue to dealer's turn
                console.log("Both split hands completed, continuing to dealer's turn");
            }
            return true;
        }
        
        return false;
    }

    /**
     * Check if the player doubled down during this game
     * @returns True if the player doubled down
     */
    public wasDoubled(): boolean {
        return this._doubledDown;
    }

    /**
     * Update player hand from server state
     */
    public updatePlayerHandFromServer(serverHand: ServerHandData): void {
        if (!serverHand) return;
        
        // Create cards for each card in server hand
        const playerCards = serverHand.cards.map((cardData: ServerCardData) => {
            return {
                rank: cardData.rank as Card['rank'],
                suit: convertToCardSuit(cardData.suit),
                value: cardData.value,
                faceUp: cardData.faceUp,
                spriteKey: `${cardData.rank}${cardData.suit[0].toUpperCase()}`
            } as Card;
        });
        
        // Clear existing cards
        this.playerHand.cards = [];
        
        // Add new cards with sprites
        playerCards.forEach((card: Card) => {
            this.playerHand.addCard(card);
            this.playerHand.createCardSprite(card);
        });
        
        // Update hand properties
        this.playerHand.value = serverHand.value;
        this.playerHand.busted = serverHand.busted;
        this.playerHand.blackjack = serverHand.blackjack;
        this.playerHand.soft = serverHand.soft;
        
        // Position cards visually
        this.playerHand.positionCardsInHand(this.playerHand);
        
        // Update points display
        this.playerHand.updatePointsDisplay(true);
    }

    /**
     * Update dealer hand from server state
     */
    public updateDealerHandFromServer(serverHand: ServerHandData): void {
        if (!serverHand) return;
        
        // Create cards for each card in server hand
        const dealerCards = serverHand.cards.map((cardData: ServerCardData) => {
            // For face-down cards, use card back texture
            const spriteKey = cardData.faceUp ? 
                `${cardData.rank}${cardData.suit[0].toUpperCase()}` : 
                'cardBack';
            
            return {
                rank: cardData.rank as Card['rank'],
                suit: convertToCardSuit(cardData.suit),
                value: cardData.value,
                faceUp: cardData.faceUp,
                spriteKey: spriteKey
            } as Card;
        });
        
        // Clear existing cards
        this.dealerHand.cards = [];
        
        // Add new cards with sprites
        dealerCards.forEach((card: Card) => {
            this.dealerHand.addCard(card);
            this.dealerHand.createCardSprite(card);
        });
        
        // Update hand properties
        this.dealerHand.value = serverHand.value;
        this.dealerHand.busted = serverHand.busted;
        this.dealerHand.blackjack = serverHand.blackjack;
        this.dealerHand.soft = serverHand.soft;
        
        // Position cards visually
        this.dealerHand.positionCardsInHand(this.dealerHand);
        
        // Update points display if all cards are face up
        const allFaceUp = this.dealerHand.cards.every(card => card.faceUp);
        if (allFaceUp) {
            this.dealerHand.updatePointsDisplay(true);
        } else {
            this.dealerHand.updatePointsDisplay(false);
        }
    }

    /**
     * Update split hand from server state
     */
    public updateSplitHandFromServer(serverHand: ServerHandData): void {
        if (!serverHand) return;
        
        // Create split hand if it doesn't exist
        if (!this.splitHand) {
            this.splitHand = new Hand('split');
            this.cardContainer.addChild(this.splitHand);
        }
        
        // Create cards for each card in server hand
        const splitCards = serverHand.cards.map((cardData: ServerCardData) => {
            return {
                rank: cardData.rank as Card['rank'],
                suit: convertToCardSuit(cardData.suit),
                value: cardData.value,
                faceUp: cardData.faceUp,
                spriteKey: `${cardData.rank}${cardData.suit[0].toUpperCase()}`
            } as Card;
        });
        
        // Since we already checked this.splitHand above, we know it exists
        const splitHand = this.splitHand;
        
        // Clear existing cards
        splitHand.cards = [];
        
        // Add new cards with sprites
        splitCards.forEach((card: Card) => {
            splitHand.addCard(card);
            splitHand.createCardSprite(card);
        });
        
        // Update hand properties
        splitHand.value = serverHand.value;
        splitHand.busted = serverHand.busted;
        splitHand.blackjack = serverHand.blackjack;
        splitHand.soft = serverHand.soft;
        
        // Position hands correctly
        this.positionHands();
        
        // Position cards within the split hand
        splitHand.positionCardsInHand(splitHand);
        
        // Update points display
        splitHand.updatePointsDisplay(true);
    }

    /**
     * Highlight the active hand during split
     */
    public highlightActiveHand(activeHand: 'first' | 'second'): void {
        // Ensure split hand exists
        if (!this.splitHand) {
            console.warn("Cannot highlight active hand: split hand doesn't exist");
            return;
        }
        
        // Set active split hand
        this.activeSplitHand = activeHand;
        
        // Apply visual highlighting
        const firstHand = this.playerHand;
        const secondHand = this.splitHand;
        
        // Reset highlight
        firstHand.alpha = 0.7;
        secondHand.alpha = 0.7;
        
        // Highlight active hand
        if (activeHand === 'first') {
            firstHand.alpha = 1;
        } else {
            secondHand.alpha = 1;
        }
        
        // Update position to ensure proper layout
        this.positionHands();
    }

    /**
     * Reveal dealer's hole card
     * @param value - Optional value to set for the card (used when dealing from server data)
     */
    public revealDealerCard(value?: number): void {
        console.log("Revealing dealer's hole card");
        
        if (this.dealerHand.cards.length < 2) {
            console.warn("Cannot reveal dealer card: dealer has fewer than 2 cards");
            return;
        }
        
        // Get the second card (hole card)
        const holeCard = this.dealerHand.cards[1];
        
        // If already face up, nothing to do
        if (holeCard.faceUp) {
            console.log("Dealer card is already revealed");
            return;
        }
        
        // Turn card face up
        holeCard.faceUp = true;
        
        // Use stored value or provided value
        if (value !== undefined) {
            holeCard.value = value;
        } else if (this.dealerHoleCardValue) {
            holeCard.value = this.dealerHoleCardValue;
        }
        
        // Update card sprite if it exists
        if (holeCard.sprite) {
            // Create new texture name based on card info
            const cardTextureName = `${holeCard.rank}${holeCard.suit[0].toUpperCase()}`;
            
            // Get the texture from resources
            if (Globals.resources[cardTextureName]) {
                // Get the current sprite parent and position
                const parent = holeCard.sprite.parent;
                const position = holeCard.sprite.position.clone();
                
                // Remove the current sprite
                if (parent) {
                    parent.removeChild(holeCard.sprite);
                }
                
                // Create new sprite with face-up texture
                holeCard.sprite = new Sprite(Globals.resources[cardTextureName]);
                holeCard.sprite.position.copyFrom(position);
                holeCard.sprite.anchor.set(0.5);
                
                // Add the new sprite to the parent
                if (parent) {
                    parent.addChild(holeCard.sprite);
                }
            }
        }
        
        // Recalculate dealer hand value now that hole card is revealed
        this.dealerHand.calculateValue();
        
        // Update points display
        this.dealerHand.updatePointsDisplay(true);
        
        // Call card reveal complete callback if defined
        if (this.dealerHand.onCardRevealComplete) {
            setTimeout(() => {
                if (this.dealerHand.onCardRevealComplete) {
                    this.dealerHand.onCardRevealComplete();
                    this.dealerHand.onCardRevealComplete = undefined;
                }
            }, 500);
        }
    }
    
    /**
     * Deal initial cards (2 to player, 2 to dealer with one face down)
     * @returns Promise that resolves when all cards are dealt
     */
    public dealInitialCards(): Promise<void> {
        return new Promise<void>((resolve) => {
            console.log("Dealing initial cards");
            
            // Sequence of card dealing
            const dealSequence = async () => {
                try {
                    // Deal first card to player (face up)
                    await this.playerHand.dealCardWithErrorHandling(true);
                    
                    // Deal first card to dealer (face up)
                    await this.dealerHand.dealCardWithErrorHandling(true);
                    
                    // Deal second card to player (face up)
                    await this.playerHand.dealCardWithErrorHandling(true);
                    
                    // Deal second card to dealer (face down)
                    await this.dealBackCardToDealer();
                    
                    // Log initial hand values
                    console.log("Initial cards dealt");
                    console.log("Player hand:", this.playerHand.value);
                    console.log("Dealer visible card:", this.dealerHand.cards[0].value);
                    
                    // Check for special conditions (blackjack, insurance, split)
                    this.checkInitialConditions(() => resolve());
                } catch (error) {
                    console.error("Error dealing initial cards:", error);
                    resolve(); // Resolve the promise even on error to avoid blocking
                }
            };
            
            // Start dealing
            dealSequence();
        });
    }

    /**
     * Deal a face-down card to the dealer (second card)
     * @returns Promise that resolves when the card is dealt
     */
    public dealBackCardToDealer(): Promise<Card | null> {
        return new Promise<Card | null>((resolve) => {
            // Create a face-down card
            const card: Card = {
                rank: '2' as Card['rank'], // Use a valid rank, appearance doesn't matter since it's face down
                suit: 'hearts', // Doesn't matter for back card
                value: 0,
                faceUp: false,
                sprite: undefined, // Use undefined instead of null
                spriteKey: 'cardBack' // Use cardBack sprite key for face-down card
            };
            
            // Store reference to the card for later
            const dealerCard = card;
            
            // Add the card to the dealer's hand
            this.dealerHand.addCard(dealerCard);
            
            // Create sprite for the back card
            this.dealerHand.createCardSprite(dealerCard);
            
            // Position the cards in the hand
            this.dealerHand.positionCardsInHand(this.dealerHand);
            
            // Simulate delay for animation
            setTimeout(() => {
                resolve(dealerCard);
            }, 300);
        });
    }

    /**
     * Attempt to deal a recovery card to a hand
     * @param hand - The hand to deal a recovery card to
     * @returns The dealt recovery card
     */
    private attemptRecoveryCardDeal(hand: Hand): Card {
        console.log("Attempting recovery card deal");
        
        // Create a new card directly since we can't call dealCard on Deck
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        
        const randomRank = ranks[Math.floor(Math.random() * ranks.length)] as Card['rank'];
        const randomSuit = suits[Math.floor(Math.random() * suits.length)] as 'hearts' | 'diamonds' | 'clubs' | 'spades';
        
        // Create a sprite key based on the rank and suit
        const suitPrefix = getSuitPrefix(randomSuit);
        const spriteKey = `${randomRank}${suitPrefix.toUpperCase()}`;
        
        // Create a new card
        const recoveryCard: Card = {
            rank: randomRank,
            suit: randomSuit,
            value: this.getCardValue(randomRank),
            faceUp: true,
            sprite: undefined, // Use undefined instead of null
            spriteKey: spriteKey
        };
        
        return recoveryCard;
    }

    /**
     * Get the prefix for a suit to use in sprite keys
     * @param suit - The card suit
     * @returns The prefix for the suit
     */
    private getSuitPrefix(suit: string): string {
        switch (suit.toLowerCase()) {
            case "hearts":
                return "h";
            case "diamonds":
                return "d";
            case "clubs":
                return "c";
            case "spades":
                return "s";
            default:
                console.warn(`Unknown suit type: ${suit}, defaulting to hearts`);
                return "h";
        }
    }

    /**
     * Get the value of a card based on its rank
     */
    private getCardValue(rank: string): number {
        if (rank === 'A') return 11;
        if (['K', 'Q', 'J', '10'].includes(rank)) return 10;
        return parseInt(rank, 10);
    }

    /**
     * Begin an action - stub for compatibility 
     * @param action - The action to begin
     * @returns Whether the action was successfully started
     */
    private beginAction(action: string): boolean {
        console.log(`[UI Only] Beginning action: ${action}`);
        this.actionInProgress = true;
        this.currentAction = action;
        this.actionStartTime = Date.now();
        return true;
    }
    
    /**
     * End an action - stub for compatibility
     * @param action - The action to end
     */
    private endAction(action: string): void {
        console.log(`[UI Only] Ending action: ${action}`);
        this.actionInProgress = false;
        this.currentAction = '';
    }

    /**
     * Player action: Hit - stub for compatibility
     * Actual logic handled by backend
     */
    public playerHit(): void {
        console.log("[UI Only] Hit handled by backend");
    }
    
    /**
     * Player action: Stand - stub for compatibility
     * Actual logic handled by backend
     */
    public playerStand(): void {
        console.log("[UI Only] Stand handled by backend");
    }
    
    /**
     * Complete player turn - stub for compatibility
     * Actual logic handled by backend
     */
    private completePlayerTurn(): void {
        console.log("[UI Only] Player turn completion handled by backend");
    }
    
    /**
     * End the game - stub for compatibility
     * @param outcome - The outcome of the game
     */
    public endGame(outcome: GameOutcome): void {
        console.log(`[UI Only] Game end with outcome ${outcome} handled by backend`);
        if (this.onGameEnd) {
            this.onGameEnd(outcome, this.playerHand.value, this.dealerHand.value);
        }
    }
} 


