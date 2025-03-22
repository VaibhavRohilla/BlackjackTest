import { Globals } from "./globals";
import { Card } from "./hand";

/**
 * Frontend representation of a deck of cards
 * Note: All actual deck logic now happens on the backend.
 * This class only stores UI state relevant to the deck display.
 */
export class Deck {
    private cardsRemaining: number = 52;
    
    constructor() {
        this.cardsRemaining = 52;
    }

    /**
     * Update the number of cards remaining in the deck
     * This is updated from backend data
     */
    public updateCardsRemaining(count: number): void {
        this.cardsRemaining = count;
    }

    /**
     * Get the remaining cards in the deck
     * @returns The number of remaining cards
     */
    public getRemainingCards(): number {
        return this.cardsRemaining;
    }
    
    /**
     * Get the prefix for a suit to use in sprite keys
     * @param suit - The card suit
     * @returns The prefix for the suit
     */
    getSuitPrefix(suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'): string {
        switch (suit) {
            case 'hearts': return 'h';
            case 'diamonds': return 'd';
            case 'clubs': return 'c';
            case 'spades': return 's';
        }
    }
    
    /**
     * Get a sprite key for a card
     * @param card The card data from the backend
     * @returns The sprite key to use
     */
    getCardSpriteKey(card: Card): string {
        return `${this.getSuitPrefix(card.suit)}${card.rank}`;
    }
} 