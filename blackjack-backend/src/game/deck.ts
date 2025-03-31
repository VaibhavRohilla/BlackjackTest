/**
 * Represents a playing card
 */
export interface Card {
    suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
    rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
    value: number;
    faceUp: boolean;
  }
  
  /**
   * Represents a standard deck of playing cards
   */
  export class Deck {
    private cards: Card[] = [];
    private discardPile: Card[] = [];
    
    constructor(numDecks: number = 1) {
      this.initialize(numDecks);
    }
    
    /**
     * Initialize the deck with the specified number of standard 52-card decks
     */
    private initialize(numDecks: number): void {
      this.cards = [];
      this.discardPile = [];
      
      const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
      const ranks: Card['rank'][] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      
      // Create specified number of decks
      for (let d = 0; d < numDecks; d++) {
        for (const suit of suits) {
          for (const rank of ranks) {
            this.cards.push({
              suit,
              rank,
              value: this.getCardValue(rank),
              faceUp: false
            });
          }
        }
      }
      
      // Shuffle the new deck
      this.shuffle();
    }
    
    /**
     * Get the blackjack value of a card
     */
    private getCardValue(rank: Card['rank']): number {
      if (rank === 'A') return 11;
      if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10;
      return parseInt(rank);
    }
    
    /**
     * Shuffle the deck using Fisher-Yates algorithm
     */
    public shuffle(): void {
      // Add discard pile back to the deck before shuffling
      this.cards = [...this.cards, ...this.discardPile];
      this.discardPile = [];
      
      // Perform the shuffle
      for (let i = this.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
      }
    }
    
    /**
     * Deal a card from the deck
     */
    public dealCard(faceUp: boolean = true): Card {
      if (this.cards.length === 0) {
        // If deck is empty, shuffle discard pile back in
        if (this.discardPile.length > 0) {
          console.log('Deck empty, shuffling discard pile back in...');
          this.shuffle();
        } else {
          throw new Error('No cards left in the deck');
        }
      }
      
      // Get random index from remaining cards
      const randomIndex = Math.floor(Math.random() * this.cards.length);
      console.log(`Dealing card: Random index ${randomIndex} from ${this.cards.length} remaining cards`);
      
      // Remove and return the card at random index
      const card = this.cards.splice(randomIndex, 1)[0];
      card.faceUp = faceUp;
      
      console.log(`Dealt card: ${card.rank} of ${card.suit} (value: ${card.value})`);
      return card;
    }

 


    /**
     * Discard a card
     */
    public discard(card: Card): void {
      this.discardPile.push(card);
    }
    
    /**
     * Get the number of cards remaining in the deck
     */
    public getCardsRemaining(): number {
      return this.cards.length;
    }
    
    /**
     * Reset the deck
     */
    public reset(numDecks: number = 1): void {
      this.initialize(numDecks);
    }
  } 