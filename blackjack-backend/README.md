# Blackjack Backend

This is the backend server for the blackjack game. It provides a WebSocket API for real-time communication with the frontend client.

## Features

- WebSocket-based real-time communication
- Full blackjack game logic implementation
- Support for standard blackjack actions: hit, stand, double down, split, surrender, insurance
- Multiple concurrent game sessions
- Persistent player balance

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. For production build:

```bash
npm run build
npm start
```

## API

The backend uses a WebSocket-based API with JSON messages. Each message has a `type` field indicating the action or event.

### Client to Server Messages

- `create_session`: Create a new game session
- `join_session`: Join an existing session
- `place_bet`: Place a bet for a new round
- `deal_cards`: Deal initial cards
- `hit`: Hit (draw a card)
- `stand`: Stand (end turn)
- `double_down`: Double down
- `split`: Split a pair
- `surrender`: Surrender
- `insurance`: Take insurance
- `rebet`: Repeat the last bet
- `clear_bet`: Clear the current bet

### Server to Client Messages

- `connected`: Connection established
- `session_created`: Session created successfully
- `bet_placed`: Bet placed successfully
- `cards_dealt`: Initial cards dealt
- `initial_state`: Current game state
- `player_turn`: Player's turn to act
- `dealer_turn`: Dealer's turn
- `card_dealt`: A card was dealt
- `dealer_card_revealed`: Dealer's hole card revealed
- `hand_updated`: Hand value updated
- `offer_insurance`: Insurance is available
- `insurance_result`: Result of insurance
- `offer_split`: Split is available
- `split_result`: Result of split
- `split_hand_switch`: Active split hand changed
- `game_outcome`: Game outcome determined
- `player_balance_update`: Player balance updated
- `error`: Error message

## Architecture

The backend consists of the following main components:

- `BlackjackServer`: Manages WebSocket connections and game sessions
- `GameSession`: Manages an individual game session for a client
- `BlackjackGame`: Implements the core blackjack game logic
- `Deck`: Manages the card deck(s) and card dealing

## Integration with Frontend

The frontend can connect to the backend using a WebSocket connection:

```javascript
const socket = new WebSocket('ws://localhost:3001');

socket.onopen = () => {
  console.log('Connection established');
  
  // Create a new session
  socket.send(JSON.stringify({
    type: 'create_session'
  }));
};

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  // Handle messages based on their type
  switch (message.type) {
    case 'session_created':
      // Store session ID
      const sessionId = message.data.sessionId;
      break;
      
    case 'initial_state':
      // Update game state
      break;
      
    // Handle other message types...
  }
};
``` 