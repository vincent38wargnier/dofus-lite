# Dofus Lite - Project Structure

```
src/
├── components/
│   ├── game/
│   │   ├── Game.jsx           # Main game component
│   │   ├── GameBoard.jsx      # Game board grid
│   │   └── GameCell.jsx       # Individual cell component
│   ├── ui/
│   │   ├── PlayerInfo.jsx     # Player stats and actions
│   │   ├── SpellBook.jsx      # Available spells
│   │   └── TurnTimer.jsx      # Turn countdown timer
│   └── shared/
│       ├── Button.jsx         # Reusable button component
│       └── HealthBar.jsx      # Health bar component
├── hooks/
│   ├── useGameState.js        # Game state management
│   └── useTurnTimer.js        # Turn timer logic
├── store/
│   ├── gameReducer.js         # Game state reducer
│   ├── actions.js             # Game actions
│   └── types.js              # Action types
├── utils/
│   ├── constants.js           # Game constants
│   ├── gameHelpers.js         # Helper functions
│   └── pathfinding.js         # Movement calculations
└── App.jsx                    # Root component
```

## Core Features

1. Game Board:
   - 10x10 grid
   - Cell types: empty, obstacle (trees 🌳, rocks 🪨)
   - Players: sword (🗡️) and bow (🏹)

2. Player Stats:
   - Health Points (HP): 100
   - Action Points (PA): 6 per turn
   - Movement Points (PM): 3 per turn

3. Actions:
   - Movement: Click to move within PM range
   - Spells: Attack (4 PA) and Heal (3 PA)
   - Turn Timer: 60 seconds per turn

4. Game Flow:
   - Turn-based gameplay
   - Automatic turn switch when timer expires
   - Victory when opponent HP reaches 0