import { Card, Hand } from "./hand";
import { GameOutcome } from "./result";
import { Globals } from "./globals";
import { Container } from "pixi.js";
import { Result } from "./result";
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
     * Detects blackjack, potential insurance, and split opportunities
     * @param onComplete - Optional callback when all checks are complete
     */
    public checkInitialConditions(onComplete?: () => void): void {
        const conditions = {
            insurance: false,
            split: false,
            blackjack: false
        };
        
        // Check if dealer might have blackjack (face up card is Ace or 10-value)
        const dealerUpCard = this.dealerHand.cards[0];
        const dealerMightHaveBlackjack = dealerUpCard.rank === 'A' || dealerUpCard.value === 10;
        
        // If dealer might have blackjack, check if they actually do (using stored hole card value)
        // but don't reveal this information to the player yet
        let dealerHasBlackjack = false;
        if (dealerMightHaveBlackjack) {
            dealerHasBlackjack = this.checkDealerBlackjack();
            this.dealerHasBlackjack = dealerHasBlackjack;
        }
        
        // Check for insurance opportunity
        if (this.isInsuranceAvailable()) {
            conditions.insurance = true;
            console.log("Dealer shows an Ace, insurance is available");
            
            // Signal insurance availability as a game state, not UI action
            if (this.onGameEvent) {
                this.onGameEvent('insuranceOption', { available: true });
            }
        }
        
        // Check for split opportunity
        if (this.canSplit()) {
            conditions.split = true;
            console.log("Player has a pair, split is available");
            
            // Signal split availability as a game state, not UI action
            if (this.onGameEvent) {
                this.onGameEvent('splitOption', { available: true });
            }
        }
        
        // Check for player blackjack
        if (this.playerHand.cards.length === 2 && this.playerHand.value === 21) {
            conditions.blackjack = true;
            this.playerHand.blackjack = true;
            console.log("Player has blackjack!");
            
            // If dealer also might have blackjack
            if (dealerMightHaveBlackjack) {
                if (dealerHasBlackjack) {
                    // Both have blackjack, it's a push
                    console.log("Dealer also has blackjack - it's a push");
                    
                    // Reveal dealer's hole card with the stored value
                    if (typeof this.dealerHand.revealDealerCard === 'function') {
                        this.dealerHand.revealDealerCard(this.dealerHoleCardValue);
                        // Set callback to end game after card reveal
                        this.dealerHand.onCardRevealComplete = () => {
                            this.endGame(GameOutcome.PUSH);
                        };
                    } else {
                        this.endGame(GameOutcome.PUSH);
                    }
                } else {
                    // Player has blackjack, dealer doesn't
                    console.log("Player wins with blackjack!");
                    this.endGame(GameOutcome.PLAYER_BLACKJACK);
                }
            } else {
                // Dealer can't have blackjack, player wins
                console.log("Player wins with blackjack!");
                this.endGame(GameOutcome.PLAYER_BLACKJACK);
            }
        }
        // If player doesn't have blackjack, but dealer does, player loses immediately
        // if they haven't taken insurance
        else if (dealerHasBlackjack && this.playerInsuranceBet <= 0) {
            console.log("Dealer has blackjack, player didn't take insurance - auto-lose");
            
            // Reveal dealer's hole card with the stored value
            if (typeof this.dealerHand.revealDealerCard === 'function') {
                this.dealerHand.revealDealerCard(this.dealerHoleCardValue);
                // Set callback to end game after card reveal
                this.dealerHand.onCardRevealComplete = () => {
                    this.endGame(GameOutcome.DEALER_WIN);
                };
            } else {
                this.endGame(GameOutcome.DEALER_WIN);
            }
        }
        // No special conditions detected, notify game state
        else if (!conditions.insurance && !conditions.split && !conditions.blackjack) {
            console.log("No special conditions detected");
            if (this.onGameEvent) {
                // Signal that initial evaluation is complete
                this.onGameEvent('initialEvaluation', { 
                    specialConditions: false,
                    playerValue: this.playerHand.value,
                    dealerValue: this.dealerHand.cards[0].value
                });
            }
        } else {
            // Signal the detected special conditions
            if (this.onGameEvent) {
                this.onGameEvent('initialEvaluation', { 
                    specialConditions: true,
                    conditions: conditions,
                    playerValue: this.playerHand.value,
                    dealerValue: this.dealerHand.cards[0].value
                });
            }
        }
        
        // Call completion callback if provided
        if (onComplete) {
            onComplete();
        }
    }
    
    /**
     * Deal a backcard to the dealer without assigning a value to it
     * The actual card value is stored internally but not reflected in the hand value
     * @returns A promise that resolves with the dealt card
     */
    public dealBackCardToDealer(): Promise<Card | null> {
        return new Promise((resolve) => {
            try {
                if (!Globals.deck) {
                    console.error("Deck is not initialized");
                    resolve(null);
                    return;
                }
                
                // Get a card from the deck
                const card = Globals.deck.dealCard();
                card.faceUp = false;
                
                // Store the actual value for later use (insurance check)
                this.dealerHoleCardValue = card.value;
                this.dealerHoleCardRank = card.rank;
                
                // Create sprite for the card
                this.dealerHand.createCardSprite(card);
                
                // Add backcard to dealer's hand (visual only)
                // Don't update dealer hand value with this card yet
                this.dealerHand.cards.push(card);
                
                // Add sprite to hand container
                if (card.sprite) {
                    this.dealerHand.addChild(card.sprite);
                    
                    // Position the card
                    this.dealerHand.positionCardsInHand(this.dealerHand);
                    
                    // Animate the card - the enhanced animation will be used automatically
                    this.dealerHand.animateCardToHand(card, this.dealerHand);
                    
                    // Add a delay to ensure animation completes
                    setTimeout(() => {
                        // Update the dealer hand's points display
                        this.dealerHand.updatePointsDisplay(true);
                        
                        resolve(card);
                    }, this.dealerHand.dealAnimationSpeed + 150); // Added extra time for rotation animation
                } else {
                    resolve(card);
                }
            } catch (error) {
                console.error("Error dealing backcard to dealer:", error);
                resolve(null);
            }
        });
    }
    
    /**
     * Check if dealer has blackjack using the stored hole card value
     * @returns True if dealer has blackjack
     */
    public checkDealerBlackjack(): boolean {
        // Check if dealer has an ace up
        const dealerUpCard = this.dealerHand.cards[0];
        const dealerHasAceUp = dealerUpCard.rank === 'A';
        
        // Check if dealer has a 10-value up
        const dealerHas10Up = dealerUpCard.value === 10;
        
        // If dealer has an Ace up, check if hole card is a 10-value
        if (dealerHasAceUp) {
            return this.dealerHoleCardValue === 10;
        }
        
        // If dealer has a 10-value up, check if hole card is an Ace
        if (dealerHas10Up) {
            return this.dealerHoleCardRank === 'A';
        }
        
        // Neither Ace nor 10-value up, can't have blackjack
        return false;
    }
    
    /**
     * Begin an action
     * @param action - The action to begin
     * @returns Whether the action was successfully started
     */
    private beginAction(action: string): boolean {
        if (this.actionInProgress) {
            console.log(`Cannot start ${action} - another action is in progress: ${this.currentAction || 'unknown'}`);
            return false;
        }
        
        console.log(`Beginning action: ${action}`);
        this.actionInProgress = true;
        this.currentAction = action;
        return true;
    }
    
    /**
     * End an action
     * @param action - The action to end
     */
    private endAction(action: string): void {
        if (this.currentAction !== action) {
            console.warn(`Ending action ${action} but current action is ${this.currentAction}`);
        }
        
        console.log(`Ending action: ${action}`);
        this.actionInProgress = false;
        this.currentAction = '';
    }
    
    /**
     * Player action: Hit
     * Deal one card to the player's hand
     * @throws Error if another action is in progress
     */
    public playerHit(): void {
        if (!this.beginAction('hit')) {
            throw new Error(`Cannot hit - another action is in progress: ${this.currentAction}`);
        }
        
        console.log("Player hits");
        
        // Deal a card to the player's hand
        this.playerHand.dealCardWithErrorHandling(true)
            .then(() => {
                // Check if the hand value is 21
                if (this.playerHand.value === 21) {
                    console.log("Player has 21, switching to dealer's turn");
                    this.completePlayerTurn();
                } else if (this.playerHand.busted) {
                    console.log("Player busted with value:", this.playerHand.value);
                    // End the hit action before ending the game to prevent state conflicts
                    this.endAction('hit');
                    this.endGame(GameOutcome.PLAYER_BUST);
                } else {
                    // Continue allowing player actions
                    this.endAction('hit');
                    
                    // Check if a stand was requested during the hit
                    if (this._standRequestedAfterHit) {
                        console.log("Executing queued stand action after hit completed");
                        this._standRequestedAfterHit = false;
                        // Small delay to ensure UI updates properly
                        setTimeout(() => this.playerStand(), 100);
                    }
                }
            })
            .catch(error => {
                console.error("Error during hit:", error);
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
        
        console.log("Player stands");
        
        // For split hands, handle differently
        if (this.splitHand) {
            // Get active hand
            const activeHand = this.getActiveSplitHand();
            
            if (activeHand === 'first') {
                // First hand stands, switch to second hand
                console.log("First hand stands, switching to second hand");
                this.setActiveSplitHand('second');
                this.endAction('stand');
            } else {
                // Second hand stands, complete player turn
                console.log("Second hand stands, completing player turn");
                this.completePlayerTurn();
            }
        } else {
            // Regular stand - complete player turn
            this.completePlayerTurn();
        }
    }
    
    /**
     * Complete the player's turn and transition to dealer's turn
     */
    private completePlayerTurn(): void {
        console.log("Completing player turn, transitioning to dealer");
        
        // Clear any queued actions
        this._standRequestedAfterHit = false;
        
        // End the current action
        this.endAction('stand');
        
        // Add a longer delay before dealer's turn to ensure UI is fully settled
        setTimeout(() => {
            // Execute dealer's turn
            this.dealerTurn()
                .then(() => {
                    // Determine the outcome after dealer's turn is complete
                    this.determineOutcome();
                })
                .catch(error => {
                    console.error("Error during dealer turn:", error);
                    // Ensure game outcome is still determined even if there's an error
                    this.determineOutcome();
                });
        }, 1500); // Increased delay to ensure UI transitions complete
    }
    
    /**
     * Player action: Double down (double bet and receive exactly one more card)
     * @returns Whether the split was successful
     */
    public playerDoubleDown(): boolean {
        if (!this.beginAction('doubleDown')) {
            return false;
        }
        
        console.log("Player doubles down");
        
        // Set doubled down flag
        this._doubledDown = true;
        
        // Deal one more card to player
        this.playerHand.dealCardWithErrorHandling(true)
            .then((card) => {
                console.log("Card dealt for double down");
                
                // Notify that doubleDown was processed
        if (this.onGameEvent) {
                    this.onGameEvent('doubleDownProcessed', { success: true });
                }
                
                // Check if player busts
                if (this.playerHand.value > 21) {
                    console.log("Player busted on double down");
                    this.playerHand.busted = true;
                    
                    // End double down action
                this.endAction('doubleDown');
                    
                    // Complete player turn (will check for bust and end game if necessary)
                    this.completePlayerTurn();
                } else {
                    // Regardless of value, player's turn ends after doubling
                    this.completePlayerTurn();
                }
            })
            .catch(error => {
                console.error("Error dealing card for double down:", error);
                
                // End action even on error
                this.endAction('doubleDown');
            });
        
        return true;
    }
    
    /**
     * Player action: Split (split a pair into two hands)
     * @returns Whether the split was successful
     */
    public playerSplit(): boolean {
        if (!this.beginAction('split')) {
            return false;
        }
        
        // Check if the hand is eligible for splitting
        if (!this.canSplit()) {
            console.error("Cannot split: conditions not met");
            this.endAction('split');
            return false;
        }
        
        console.log("Splitting hand...");
        
        try {
            // Create a new hand for the split (left side)
        this.splitHand = new Hand('split');
        this.cardContainer.addChild(this.splitHand);
        
            // Ensure we have exactly two cards in the original hand
            if (this.playerHand.cards.length !== 2) {
                throw new Error(`Invalid card count for split: ${this.playerHand.cards.length}`);
            }
            
            // Store the original two cards and their sprites
            const firstCard = this.playerHand.cards[0];
            const secondCard = this.playerHand.cards[1];
            
            if (!firstCard || !secondCard) {
                throw new Error("Failed to get original cards for split");
            }
            
            console.log(`Original cards: ${firstCard.rank}${firstCard.suit} and ${secondCard.rank}${secondCard.suit}`);
            
            // Save references to the card sprites before we clear them
            const firstCardSprite = firstCard.sprite;
            const secondCardSprite = secondCard.sprite;
            
            // Verify the cards have the same value for splitting
            if (firstCard.value !== secondCard.value) {
                throw new Error(`Cards do not have the same value: ${firstCard.value} vs ${secondCard.value}`);
            }
            
            // Clear the player's hand (will be right side)
            this.playerHand.cards = [];
            
            // Clear the card sprites from the original hand
            if (firstCardSprite && firstCardSprite.parent) {
                firstCardSprite.parent.removeChild(firstCardSprite);
            }
            if (secondCardSprite && secondCardSprite.parent) {
                secondCardSprite.parent.removeChild(secondCardSprite);
            }
            
            // Add first card to the right hand (player hand)
            this.playerHand.addCard(firstCard);
            
            // Add second card to the left hand (split hand)
            this.splitHand.addCard(secondCard);
            
            // Manually ensure sprites are added to their correct containers
            if (firstCardSprite) {
                this.playerHand.addChild(firstCardSprite);
                firstCard.sprite = firstCardSprite;
            } else {
                // If sprite is missing, create a new one
                this.playerHand.createCardSprite(firstCard);
            }
            
            if (secondCardSprite) {
                this.splitHand.addChild(secondCardSprite);
                secondCard.sprite = secondCardSprite;
            } else {
                // If sprite is missing, create a new one
                this.splitHand.createCardSprite(secondCard);
            }
            
            // Log initial split state
            console.log(`Initial split: Right hand has ${this.playerHand.cards.length} card, Left hand has ${this.splitHand.cards.length} card`);
            console.log(`Card sprites: Right card has sprite: ${!!firstCard.sprite}, Left card has sprite: ${!!secondCard.sprite}`);
            
            // Reposition cards for visual clarity - first hand on right, second hand on left
            this.positionHands();
            
            // Force redraw of cards in their new positions
            this.playerHand.positionCardsInHand(this.playerHand);
            this.splitHand.positionCardsInHand(this.splitHand);
            
            // Define an async function to handle the card dealing sequentially
            const dealCardsToSplitHands = async () => {
                // Reset any card animations that might be in progress
                if (this._dealCardTimeout !== null) {
                    clearTimeout(this._dealCardTimeout);
                    this._dealCardTimeout = null;
                }
                
                try {
                    // Deal to right hand (player hand) first
                    console.log("Dealing card to RIGHT hand...");
                    const rightCard = await this.playerHand.dealCardWithErrorHandling(true);
                    
                    if (!rightCard) {
                        throw new Error("Failed to deal card to right hand");
                    }
                    
                    console.log(`Card dealt to RIGHT hand: ${rightCard.rank}${rightCard.suit}`);
                    console.log(`RIGHT hand now has ${this.playerHand.cards.length} cards`);
                    
                    // Ensure card sprite exists and is visible
                    if (!rightCard.sprite) {
                        console.error("RIGHT card is missing sprite");
                        this.playerHand.createCardSprite(rightCard);
                    } else {
                        console.log("RIGHT card sprite exists");
                        rightCard.sprite.visible = true;
                    }
                    
                    // Ensure positioning is correct
                    this.playerHand.positionCardsInHand(this.playerHand);
                    
                    // Wait for animation to complete
                    await new Promise<void>((resolve) => {
                        this._dealCardTimeout = setTimeout(() => {
                            this._dealCardTimeout = null;
                            resolve();
                        }, 1000) as unknown as number;
                    });
                    
                    // Verify the split hand still exists
                    if (!this.splitHand) {
                        throw new Error("Split hand is null before dealing second card");
                    }
                    
                    // Deal to left hand (split hand)
                    console.log("Dealing card to LEFT hand...");
                    const leftCard = await this.splitHand.dealCardWithErrorHandling(true);
                    
                    if (!leftCard) {
                        throw new Error("Failed to deal card to left hand");
                    }
                    
                    console.log(`Card dealt to LEFT hand: ${leftCard.rank}${leftCard.suit}`);
                    
                    // Ensure card sprite exists and is visible for left card
                    if (!leftCard.sprite) {
                        console.error("LEFT card is missing sprite");
                        this.splitHand.createCardSprite(leftCard);
                    } else {
                        console.log("LEFT card sprite exists");
                        leftCard.sprite.visible = true;
                    }
                    
                    // Verify our split hand still exists
                    if (!this.splitHand) {
                        throw new Error("Split hand is null after dealing to left hand");
                    }
                    
                    console.log(`LEFT hand now has ${this.splitHand.cards.length} cards`);
                    
                    // Double-check card counts
                    console.log(`Final card counts - RIGHT: ${this.playerHand.cards.length}, LEFT: ${this.splitHand.cards.length}`);
                    
                    // Log sprite status for all cards
                    console.log("RIGHT hand card sprites:");
                    this.playerHand.cards.forEach((c, i) => {
                        console.log(`  Card ${i+1}: ${c.rank}${c.suit} - has sprite: ${!!c.sprite}, visible: ${c.sprite?.visible}`);
                    });
                    
                    console.log("LEFT hand card sprites:");
                    this.splitHand.cards.forEach((c, i) => {
                        console.log(`  Card ${i+1}: ${c.rank}${c.suit} - has sprite: ${!!c.sprite}, visible: ${c.sprite?.visible}`);
                    });
                    
                    // Sanity check - throw error if either hand doesn't have exactly 2 cards
                    if (this.playerHand.cards.length !== 2) {
                        throw new Error(`RIGHT hand should have 2 cards but has ${this.playerHand.cards.length}`);
                    }
                    
                    if (this.splitHand.cards.length !== 2) {
                        throw new Error(`LEFT hand should have 2 cards but has ${this.splitHand.cards.length}`);
                    }
                    
                    // Force card positioning again after all operations
                    this.positionHands();
                    
                    // Force visual update of cards
                    this.playerHand.positionCardsInHand(this.playerHand);
                    this.splitHand.positionCardsInHand(this.splitHand);
                    
                    // Force specific positions for left hand cards to ensure they are visible
                    if (this.splitHand) {
                        const splitHandCards = this.splitHand.cards || [];
                        if (splitHandCards.length >= 2) {
                            const leftDistance = 200;
                            
                            // Ensure position the first card in left hand
                            if (splitHandCards[0] && splitHandCards[0].sprite) {
                                splitHandCards[0].sprite.position.set(-15, 0);
                                splitHandCards[0].sprite.visible = true;
                            }
                            
                            // Ensure position the second card in left hand
                            if (splitHandCards[1] && splitHandCards[1].sprite) {
                                splitHandCards[1].sprite.position.set(15, 0);
                                splitHandCards[1].sprite.visible = true;
                            }
                            
                            console.log("Forced LEFT hand card positions");
                        }
                    }
                    
                    // Set right hand (first hand) as active
                this.setActiveSplitHand('first');
                
                    // Report split completed with hand values
                if (this.onGameEvent) {
                    this.onGameEvent('splitComplete', {
                        firstHandValue: this.playerHand.value,
                        secondHandValue: this.splitHand ? this.splitHand.value : 0,
                        activeHand: 'first'
                    });
                }
                
                    // End the action
                this.endAction('split');
                    
                    return true;
                } catch (error) {
                    // Log the error and handle it
                    console.error("Error in dealCardsToSplitHands:", error);
                    
                    // Verify both hands have the correct number of cards
                    // If not, manually ensure both hands have 2 cards by creating them
                    console.log("Attempting to recover from error...");
                    
                    // Force right hand to have 2 cards
                    if (this.playerHand.cards.length < 2) {
                        console.log("Forcing right hand to have 2 cards");
                        try {
                            // Get a card from the deck directly
                            if (Globals.deck) {
                                const recoveryCard = Globals.deck.dealCard();
                                recoveryCard.faceUp = true;
                                this.playerHand.addCard(recoveryCard);
                                // Create sprite for the recovery card
                                this.playerHand.createCardSprite(recoveryCard);
                                console.log(`Added recovery card to RIGHT hand: ${recoveryCard.rank}${recoveryCard.suit}`);
                            }
                        } catch (e) {
                            console.error("Failed to add recovery card to right hand:", e);
                        }
                    }
                    
                    // Force left hand to have 2 cards
                    if (this.splitHand && this.splitHand.cards.length < 2) {
                        console.log("Forcing left hand to have 2 cards");
                        try {
                            // Get a card from the deck directly
                            if (Globals.deck) {
                                const recoveryCard = Globals.deck.dealCard();
                                recoveryCard.faceUp = true;
                                this.splitHand.addCard(recoveryCard);
                                // Create sprite for the recovery card
                                this.splitHand.createCardSprite(recoveryCard);
                                console.log(`Added recovery card to LEFT hand: ${recoveryCard.rank}${recoveryCard.suit}`);
                            }
                        } catch (e) {
                            console.error("Failed to add recovery card to left hand:", e);
                        }
                    }
                    
                    // Check if all cards have sprites
                    this.playerHand.cards.forEach((card, index) => {
                        if (!card.sprite) {
                            console.log(`Creating missing sprite for RIGHT card ${index}`);
                            this.playerHand.createCardSprite(card);
                        }
                    });
                    
                    if (this.splitHand) {
                        this.splitHand.cards.forEach((card, index) => {
                            if (!card.sprite) {
                                console.log(`Creating missing sprite for LEFT card ${index}`);
                                if(this.splitHand) {
                                    this.splitHand.createCardSprite(card);
                                }
                            }
                        });
                    }
                    
                    // Final verification
                    console.log(`After recovery - RIGHT: ${this.playerHand.cards.length}, LEFT: ${this.splitHand?.cards.length || 0}`);
                    
                    // Force positioning again
                    this.positionHands();
                    
                    // Force card positioning
                    this.playerHand.positionCardsInHand(this.playerHand);
                    if (this.splitHand) {
                        this.splitHand.positionCardsInHand(this.splitHand);
                        
                        // Emergency repositioning for left hand cards
                        this.splitHand.cards.forEach((card, index) => {
                            if (card.sprite) {
                                card.sprite.position.set(index * 30 - 15, 0);
                                card.sprite.visible = true;
                                console.log(`Force positioned LEFT card ${index}`);
                            }
                        });
                    }
                    
                    // End the action
                    this.endAction('split');
                    
                    // Even if we had an error, we've tried to recover, so return true
            return true;
                }
            };
            
            // Start the card dealing process
            console.log("Starting card dealing sequence for split hands");
            dealCardsToSplitHands();
            
            return true;
        } catch (error) {
            console.error("Unexpected error during split setup:", error);
            this.endAction('split');
            return false;
        }
    }
    
    /**
     * Player action: Surrender (give up half the bet)
     * @returns Whether the surrender was successful
     */
    public playerSurrender(): boolean {
        if (!this.beginAction('surrender')) {
            return false;
        }
        
        // Can only surrender on initial two cards
        if (this.playerHand.cards.length !== 2 || this.hasPlayerHit()) {
            console.log("Cannot surrender: not on initial two cards");
            this.endAction('surrender');
            return false;
        }
        
        console.log("Player surrenders");
        
        // Set the surrendered flag on the player's hand
        this.playerHand.surrendered = true;
        
        // End game with surrender outcome
        this.endGame(GameOutcome.SURRENDER);
        this.endAction('surrender');
        return true;
    }
    
    /**
     * Handle player taking insurance bet
     * @returns True if insurance was taken successfully
     */
    public playerInsurance(): boolean {
        // Check if insurance is available
        if (!this.isInsuranceAvailable()) {
            console.log("Insurance is not available");
            return false;
        }
        
        // Check if insurance bet is valid (should be half the original bet)
        if (this.playerInsuranceBet <= 0) {
            console.log("Invalid insurance bet amount");
            return false;
        }
        
        console.log(`Player takes insurance for ${this.playerInsuranceBet}`);
        
        // Check if dealer has blackjack using the stored hole card value
        // without revealing the card value directly
        this.dealerHasBlackjack = this.checkDealerBlackjack();
        console.log(`Dealer has blackjack: ${this.dealerHasBlackjack} (not revealed to player yet)`);
        
        // Process the insurance outcome
        if (this.dealerHasBlackjack) {
            console.log("Dealer has blackjack, insurance bet wins");
            
            // Reveal dealer's hole card with the stored value
            if (typeof this.dealerHand.revealDealerCard === 'function') {
                this.dealerHand.revealDealerCard(this.dealerHoleCardValue);
                
                // Set callback to process insurance outcome after card reveal
                this.dealerHand.onCardRevealComplete = () => {
                    // Notify the game manager that insurance was processed
        if (this.onGameEvent) {
            this.onGameEvent('insuranceProcessed', {
                            dealerHasBlackjack: true,
                            insurancePayout: this.playerInsuranceBet * 2 
                        });
                    }
                    
                    // End game with dealer win since dealer has blackjack
                    // Player loses their original bet but wins insurance
                    this.endGame(GameOutcome.INSURANCE_WON);
                };
            } else {
                // Fallback if revealDealerCard is not available
                if (this.onGameEvent) {
                    this.onGameEvent('insuranceProcessed', { 
                        dealerHasBlackjack: true,
                        insurancePayout: this.playerInsuranceBet * 2 
                    });
                }
                
                this.endGame(GameOutcome.INSURANCE_WON);
            }
        } else {
            console.log("Dealer doesn't have blackjack, insurance bet loses");
            
            // Notify the game manager that insurance was processed
            if (this.onGameEvent) {
                this.onGameEvent('insuranceProcessed', { 
                    dealerHasBlackjack: false,
                    insurancePayout: 0 
                });
            }
            
            // Continue the game - we don't end it here since dealer doesn't have blackjack
            // Game flow will continue with player's turn
        }
        
        return true;
    }
    
    /**
     * Dealer plays their turn by revealing hole card and hitting until 17+
     * @returns Promise that resolves when dealer turn is complete
     */
    private dealerTurn(): Promise<void> {
        return new Promise<void>((resolve) => {
            const dealerPlay = () => {
                // First reveal dealer's hole card if not already revealed
                if (this.dealerHand.cards.length > 1 && !this.dealerHand.cards[1].faceUp) {
                    console.log("Revealing dealer's hole card");
                    
                    // Reveal dealer's hole card with the stored value
        if (typeof this.dealerHand.revealDealerCard === 'function') {
                        this.dealerHand.revealDealerCard(this.dealerHoleCardValue);
            
                        // Wait for animation to complete before continuing
            this.dealerHand.onCardRevealComplete = () => {
                            // Calculate dealer hand value now that the card is revealed
                            this.dealerHand.calculateValue();
                            
                            console.log(`Dealer hand value after reveal: ${this.dealerHand.value}`);
                            
                            // Continue dealer turn after a short delay
                            setTimeout(() => {
                                dealerHitOrStand();
                            }, 1000);
                        };
                        return;
        } else {
                        // Fallback if reveal method not available
                        console.error("revealDealerCard method not available");
                        this.dealerHand.calculateValue();
                    }
                }
                
                // If the card is already revealed, just continue with dealer's turn
                dealerHitOrStand();
            };
            
            const dealerHitOrStand = () => {
                // Check the dealer's hand value after card reveal
                const dealerValue = this.dealerHand.value;
                console.log(`Dealer has ${dealerValue}`);
                
                // Dealer must hit on 16 or less, and stand on 17 or more
                if (dealerValue < 17) {
                    // Dealer hits
                    console.log("Dealer hits");
                    this.dealerHand.dealCardWithErrorHandling(true)
                        .then(() => {
                            // Calculate new hand value
                            this.dealerHand.calculateValue();
                            
                            // Check for bust
                            if (this.dealerHand.value > 21) {
                                console.log("Dealer busts with " + this.dealerHand.value);
                                this.dealerHand.busted = true;
                                resolve();
                            } else {
                                // Continue dealer turn after a short delay
                                setTimeout(dealerHitOrStand, 1000);
                            }
                        });
                } else {
                    // Dealer stands
                    console.log(`Dealer stands with ${dealerValue}`);
                    resolve();
                }
            };
            
            // Start dealer turn
            dealerPlay();
        });
    }
    
    /**
     * Determine the outcome of the game
     */
    private determineOutcome(): void {
        console.log("Determining game outcome");
        
        // Ensure dealer's hand value includes the hole card after reveal
        this.dealerHand.calculateValue();
        
        // Check for split hand
        if (this.splitHand) {
            // Calculate outcomes and payouts for both hands
            this.handleSplitHandOutcome();
        } else {
            // Regular game outcome
            const outcome = Result.determineOutcome(this.playerHand.value, this.dealerHand.value);
            console.log(`Game outcome: ${outcome}, Player: ${this.playerHand.value}, Dealer: ${this.dealerHand.value}`);
            
            // End the game with the determined outcome
            this.endGame(outcome);
        }
    }
  
    /**
     * End the game
     * @param outcome - The outcome of the game
     */
    public endGame(outcome: GameOutcome): void {
        if (!this.gameInProgress) {
            console.log("Game is not in progress, ignoring endGame call");
            return;
        }
        
        this.gameInProgress = false;
        
        // Call onGameEnd callback if provided
        if (this.onGameEnd) {
            this.onGameEnd(outcome, this.playerHand.value, this.dealerHand.value);
        }
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
        
        // Use Result helper for basic split check
        if (!Result.canSplit(this.playerHand, this.splitHand !== null)) {
            return false;
        }
        
        // Need enough balance to place another bet equal to the current one
        if (Globals.balance < Globals.currentBet) {
            return false;
        }
        
        return true;
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
     * Update player balance based on hand outcome
     * @param outcome The outcome of the hand
     * @param hand The hand to evaluate
     * @param bet The bet amount for this hand
     */
    private settleHand(outcome: GameOutcome, hand: Hand, bet: number): void {
        // Calculate payout based on outcome
        const payout = Result.calculatePayout(outcome, bet);
        
        // Add payout to player balance
        if (payout > 0) {
            Globals.balance += payout;
            console.log(`Payout: ${payout}. New balance: ${Globals.balance}`);
        }
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
     * Handle the outcome calculation for split hands
     */
    private handleSplitHandOutcome(): void {
        if (!this.splitHand) {
            console.error("Cannot determine split hand outcome - no split hand exists");
            return;
        }
        
        // Using the Result class for detailed outcome calculation that handles split hands
        const result = Result.determineDetailedOutcome(
            this.playerHand, 
            this.dealerHand, 
            this.splitHand,
            this.playerInsuranceBet
        );
        
        console.log("Split game outcome determined:", result.outcome, "- Message:", result.message);
        
        // End game with the determined outcome for the split hands
        this.endGame(result.outcome);
    }

    /**
     * Check if the player doubled down during this game
     * @returns True if the player doubled down
     */
    public wasDoubled(): boolean {
        return this._doubledDown;
    }
} 


