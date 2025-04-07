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
    public shuffle(randomProvider?: () => number): void {
      // Add discard pile back to the deck before shuffling
      this.cards = [...this.cards, ...this.discardPile];
      this.discardPile = [];
      
      // Perform the shuffle
      for (let i = this.cards.length - 1; i > 0; i--) {
        const j = Math.floor((randomProvider ? randomProvider() : Math.random()) * (i + 1));
        [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
      }
    }
    
    /**
     * Deal a card from the deck
     */
    public dealCard(faceUp: boolean = true, randomValue?: number): Card {
      if (this.cards.length === 0) {
        // If deck is empty, shuffle discard pile back in
        if (this.discardPile.length > 0) {
          console.log('Deck empty, shuffling discard pile back in...');
          this.shuffle();
        } else {
          throw new Error('No cards left in the deck');
        }
      }
      
      // Ensure randomValue is between 0 and 1
      let normalizedRandomValue = randomValue;
      if (normalizedRandomValue !== undefined) {
        // If value is much larger than 1, it might need to be normalized
        if (normalizedRandomValue > 1) {
          normalizedRandomValue = (normalizedRandomValue % 1);
        }
        // Ensure it's between 0 and 1
        normalizedRandomValue = Math.max(0, Math.min(0.999, normalizedRandomValue));
      }
      
      // Get random index from remaining cards
      const randomIndex = Math.floor((normalizedRandomValue !== undefined ? normalizedRandomValue : Math.random()) * this.cards.length);
      console.log(`Dealing card: Random index ${randomIndex} from ${this.cards.length} remaining cards`);
      
      // Remove and return the card at random index
      const card = this.cards.splice(randomIndex, 1)[0];
      card.faceUp = faceUp;
      
      console.log(`Dealt card: ${card.rank} of ${card.suit} (value: ${card.value})`);
      return card;
    }

    /**
     * Deal an Ace from the deck
     * @param faceUp Whether the card should be dealt face up
     * @returns The dealt Ace card, or null if no Aces remain
     */
    public dealAce(faceUp: boolean = true, randomValue?: number): Card {
      if (this.cards.length === 0) {
        // If deck is empty, shuffle discard pile back in
        if (this.discardPile.length > 0) {
          console.log('Deck empty, shuffling discard pile back in...');
          this.shuffle();
        } else {
          throw new Error('No cards left in the deck');
        }
      }

      // Ensure randomValue is between 0 and 1
      let normalizedRandomValue = randomValue;
      if (normalizedRandomValue !== undefined) {
        // If value is much larger than 1, it might need to be normalized
        if (normalizedRandomValue > 1) {
          normalizedRandomValue = (normalizedRandomValue % 1);
        }
        // Ensure it's between 0 and 1
        normalizedRandomValue = Math.max(0, Math.min(0.999, normalizedRandomValue));
      }

      // Find indices of all remaining Aces
      const aceIndices = this.cards
        .map((card, index) => card.rank === 'A' ? index : -1)
        .filter(index => index !== -1);

      if (aceIndices.length === 0) {
        throw new Error('No Aces remaining in deck');
      }

      // Get random index from remaining Aces
      const randomIndex = Math.floor((normalizedRandomValue !== undefined ? normalizedRandomValue : Math.random()) * aceIndices.length);
      const aceIndex = aceIndices[randomIndex];
      console.log(`Dealing Ace: Random index ${randomIndex} from ${aceIndices.length} remaining Aces`);

      // Remove and return the Ace
      const card = this.cards.splice(aceIndex, 1)[0];
      card.faceUp = faceUp;

      console.log(`Dealt Ace of ${card.suit}`);
      return card;
    }
    /**
     * Deal a Ten-value card (10, J, Q, K) from the deck
     * @param faceUp Whether the card should be dealt face up
     * @param randomValue Optional random value between 0-1 to determine card selection
     * @returns The dealt ten-value card
     */
    public dealTen(faceUp: boolean = true, randomValue?: number): Card {
        // Find indices of all remaining ten-value cards
        const tenIndices = this.cards
            .map((card, index) => ['10', 'J', 'Q', 'K'].includes(card.rank) ? index : -1)
            .filter(index => index !== -1);

        if (tenIndices.length === 0) {
            throw new Error('No ten-value cards remaining in deck');
        }

        // Normalize random value between 0-1
        let normalizedRandomValue = randomValue;
        if (normalizedRandomValue !== undefined) {
            if (normalizedRandomValue > 1) {
                normalizedRandomValue = (normalizedRandomValue % 1);
            }
            normalizedRandomValue = Math.max(0, Math.min(0.999, normalizedRandomValue));
        }

        // Get random index from available tens
        const randomTenIndex = tenIndices[Math.floor((normalizedRandomValue !== undefined ? normalizedRandomValue : Math.random()) * tenIndices.length)];
        
        // Remove and return the ten-value card
        const ten = this.cards.splice(randomTenIndex, 1)[0];
        ten.faceUp = faceUp;
        
        console.log(`Dealt ${ten.rank} of ${ten.suit}`);
        return ten;
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