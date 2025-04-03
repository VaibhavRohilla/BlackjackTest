# Blackjack Backend

Backend service for the blackjack game.

## Simplified Messaging Protocol

The backend now uses a simplified messaging protocol with only 4 core message types:

1. **START_GAME** - Sent when starting a new game with initial state
   - Contains: playerBalance, currentBet, gamePhase
   - Example: `{ type: "start_game", data: { playerBalance: 1000, currentBet: 100, gamePhase: "dealing" } }`

2. **CARD_DEALT** - Sent for each card dealt with target and card info
   - Contains: card (with suit, rank, value, faceUp), target ('player', 'dealer', 'split')
   - Example: `{ type: "card_dealt", data: { card: { suit: "hearts", rank: "A", value: 11, faceUp: true }, target: "player" } }`

3. **PHASE_CHANGE** - Signals transitions between game phases
   - Contains: from, to, playerBalance, currentBet, allowedActions
   - Example: `{ type: "phase_change", data: { from: "dealing", to: "player_turn", playerBalance: 900, currentBet: 100, allowedActions: ["hit", "stand", "double_down"] } }`

4. **GAME_END** - Sent at game end with outcome information
   - Contains: outcome, payout, playerBalance, currentBet
   - Example: `{ type: "game_end", data: { outcome: "player_win", payout: 200, playerBalance: 1100, currentBet: 100 } }`

Additionally, we still use:
- **SPECIAL_CASE** - For insurance and split options
- **ERROR** - For error conditions
- Authentication and leaderboard messages as needed

This simplified protocol makes the system more robust and easier to maintain.

## Installation

```bash
npm install
```

## Running

```bash
npm start
``` 