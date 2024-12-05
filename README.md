# Dofus Lite

A lightweight tactical turn-based game inspired by Dofus, built with React. Players control characters on a grid-based map, using spells and movement to outmaneuver their opponents. The game features AI players that can take control of any character during the match.

## Core Features

### Implemented
- 🎮 Turn-based tactical combat on a 10x10 grid
- 🎯 Two character classes (Sword Master and Archer) with unique abilities
- 🔄 Action Points (PA) and Movement Points (PM) system
- 🤖 AI opponents with basic tactical decision making
- 🎨 Real-time spell effect animations
- 📊 Game state management with move validation
- 🕹️ Path finding and movement visualization
- 📝 Real-time game log
- ⌛ Turn timer system (60s per turn)
- 🔄 Buff/Debuff system with duration tracking
- 💫 Spell cooldown management

### Planned/TODO
- [ ] More character classes
- [ ] Team battles (2v2, 3v3)
- [ ] Improved AI strategies
- [ ] Save/Load game state
- [ ] Online multiplayer
- [ ] Custom map editor
- [ ] Character customization
- [ ] Achievement system

## Project Structure

```
src/
├── ai/                         # AI System
│   ├── core/
│   │   ├── actionGenerator.js  # Generates possible AI moves
│   │   └── actionEvaluator.js  # Evaluates and scores AI moves
│   └── interface/
│       └── AIController.js     # Main AI controller interface
│
├── components/
│   ├── game/                   # Core Game Components
│   │   ├── Game.jsx           # Main game orchestrator
│   │   ├── GameBoard.jsx      # Grid-based game board
│   │   └── GameCell.jsx       # Individual cell component
│   │
│   ├── ui/                    # User Interface Components
│   │   ├── PlayerInfo.jsx     # Player stats and spells UI
│   │   ├── SpellBook.jsx      # Spell management interface
│   │   ├── TurnTimer.jsx      # Turn countdown display
│   │   ├── LogPanel.jsx       # Game event log
│   │   └── VictoryScreen.jsx  # End game screen
│   │
│   └── shared/                # Shared UI Components
│       └── ErrorBoundary.jsx  # Error handling wrapper
│
├── core/                      # Core Game Logic
│   ├── game/
│   │   ├── state/            # Game State Management
│   │   │   ├── initialState.js  # Initial game setup
│   │   │   └── gameReducer.js   # State update logic
│   │   │
│   │   └── combat/           # Combat System
│   │       ├── spellCasting.js  # Spell execution logic
│   │       └── buffManagement.js # Buff/debuff handling
│   │
│   └── board/                # Board Management
│       └── Board.js          # Board state and validation
│
├── hooks/                    # Custom React Hooks
│   ├── useGameState.js      # Main game state hook
│   ├── useGameActions.js    # Game action handlers
│   └── useTurnManagement.js # Turn system management
│
└── utils/                   # Utility Functions
    ├── constants.js         # Game constants
    ├── pathfinding.js       # Movement calculations
    └── classes.js          # Character class definitions
```

## Implementation Details

### Game Mechanics
- Turn-based system with 60-second time limit per turn
- Each turn, players get:
  - 6 Action Points (PA)
  - 3 Movement Points (PM)

### Character Classes
Currently implemented:
- Sword Master
  - Close combat specialist
  - Sword Slash (4 PA, Range 1, 20 damage)
  - Heal (3 PA, Self, 15 HP)
- Archer
  - Ranged combat specialist
  - Arrow Shot (3 PA, Range 4, 15 damage)
  - Heal (3 PA, Self, 15 HP)

Each spell has:
- PA cost
- Range limitations
- Usage limits per turn
- Cooldown periods

### AI System
- Can be toggled for each player at any time
- Makes decisions based on:
  - Current game state
  - Available actions
  - Player positions
  - Resource management
- Currently implements basic strategies:
  - Moves toward optimal attack range
  - Prioritizes attacks when in range
  - Uses healing when below 50% HP
  - Manages resources efficiently

### Movement System
- A* pathfinding implementation
- Real-time path preview
- Movement cost validation
- Obstacle avoidance

### State Management
- Reducer-based game state
- Action validation system
- Turn management
- Buff/debuff tracking
- Animation states

## Setup and Development

1. Clone the repository
```bash
git clone https://github.com/yourusername/dofus-lite.git
cd dofus-lite
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Start development server
```bash
npm start
# or
yarn start
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
