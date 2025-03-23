import { Card, Hand } from "./hand";
import { GameOutcome } from "./result";
import { getSuitPrefix, Globals } from "./globals";
import { Container, Sprite } from "pixi.js";
import { Result } from "./result";
import { log } from "node:console";


/**



/**
 * Handles card distribution and game logic for blackjack
 */
export class BlackjackDealer extends Container {
  
    dealerHand: Hand = new Hand('dealer');
    playerHand: Hand = new Hand('player');
    splitHand: Hand | null = null;
    cardContainer: Container = new Container();
    isInsuranceAvailable: boolean = false;
    isSplitAvailable: boolean = false;
isCardDealInProgress: boolean = false; 

payout: number = 0;
    
    
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
    }
    
    initializeSplitHand(): void {
        this.splitHand = new Hand('split');
        this.cardContainer.addChild(this.splitHand);
    }

    updateHand(hand: Hand, cardData: Card): void {
        hand.dealCards(cardData);
    }

    async dealCards(playerHand: Hand, dealerHand: Hand) {
        console.log("Dealing cards", playerHand.cards[0], dealerHand.cards[0]);
        await this.playerHand.dealCards(playerHand.cards[0]);
        await this.dealerHand.dealCards(dealerHand.cards[0]);
        await this.playerHand.dealCards(playerHand.cards[1]);
        await this.dealerHand.dealCards(dealerHand.cards[1]);
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
  
    resize() {
        this.cardContainer.position.set(window.innerWidth / 2, window.innerHeight / 2);
        this.dealerHand.resize();
        this.playerHand.resize();
        this.splitHand?.resize();
    }

    /**
     * Reset player and dealer hands
     */
        resetHands(): void {
        this.dealerHand.reset();
        this.playerHand.reset();
        if (this.splitHand) {
            this.splitHand.destroy();
            this.splitHand = null;
        }
    }

}