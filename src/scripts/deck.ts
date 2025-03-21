import { Globals } from "./globals";
import { Card } from "./hand";

export class Deck {
    private cards: Card[] = [];
    
    constructor() {
        this.initializeDeck();
        this.shuffleDeck();
    }

    /**
     * Initialize the deck with 52 cards
     */
    private initializeDeck(): void {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

        this.cards = suits.flatMap(suit => 
            ranks.map(rank => ({
                suit: suit,
                rank: rank,
                value: rank === 'A' ? 11 : (['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank)),
                spriteKey: `${this.getSuitPrefix(suit)}${rank}`,
                faceUp: false
            }))
        );
    }

    /**
     * Shuffle the deck
     */
    public shuffleDeck(): void {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    /**
     * Deal a card from the deck
     * @returns The dealt card or null if the deck is empty
     */
    public dealCard(): Card {
        const card = this.cards.pop();
        if (!card) {
            throw new Error('Cannot deal card - deck is empty');
        }
        return card;
    }

    /**
     * Check if the deck is empty
     * @returns Whether the deck is empty
     */
    public isEmpty(): boolean {
        return this.cards.length === 0;
    }

    /**
     * Get the remaining cards in the deck
     * @returns The number of remaining cards
     */
    public getRemainingCards(): number {
        return this.cards.length;
    }
    
        /**
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
} 