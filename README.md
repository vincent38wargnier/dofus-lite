# Dofus Lite

A tactical turn-based strategy game inspired by Dofus, built with React.js. Players take turns moving on a grid-based map, casting spells, and engaging in tactical combat.

## Project Overview

### Core Game Mechanics
- Turn-based combat on a grid board
- Character classes with unique abilities
- Movement and action point system
- Line of sight and range calculations
- Status effects and cooldown management
- AI opponents with different strategies (planned)

### Technical Features
- React.js frontend
- Event-driven architecture
- State management using Context API
- Modular component design
- AI decision-making system (planned)
- Custom pathfinding implementation

## Complete Project Structure and Implementation Status

```
dofus-lite/
├── public/                           # Static files
│   ├── index.html                  ✅ Basic HTML structure
│   ├── favicon.ico                 ✅ Game icon
│   └── manifest.json               ✅ PWA configuration
└── src/
    ├── components/
    │   ├── ActionBar/               ✅ NEW - Action controls
    │   │   ├── ActionBar.js         ✅ Main action interface
    │   │   └── ActionBar.css        ✅ Action styling
    │   ├── Board/                    # Board-related components
    │   │   ├── BoardEngine.js      ✅ Core game board logic
    │   │   ├── BoardRenderer.js    ✅ Visual board rendering
    │   │   ├── Cell.js            ✅ Individual cell logic
    │   │   ├── BoardInteractionManager.js ✅ NEW - User interaction
    │   │   ├── Board.css          ✅ NEW - Board styling
    │   │   ├── Cell.css           ✅ NEW - Cell styling
    │   │   ├── Obstacle.js        ❌ Obstacle management
    │   │   ├── MovementManager.js  ✅ Movement calculations
    │   │   ├── ActionValidator.js  ❌ Action validation
    │   │   ├── LOSCalculator.js   ✅ NEW - Line of sight system
    │   │   ├── TurnManager.js     ✅ NEW - Turn handling
    │   │   └── EventBus.js        ❌ Event management
    │   ├── GameSetup/              ✅ NEW - Game initialization
    │   │   ├── GameSetup.js        ✅ Setup interface
    │   │   └── GameSetup.css       ✅ Setup styling
    │   ├── GameStatus/             ✅ NEW - Game state display
    │   │   ├── GameStatus.js       ✅ Status interface
    │   │   └── GameStatus.css      ✅ Status styling
    │   ├── Player/                   # Player-related components
    │   │   ├── Player.js          ✅ Player class implementation
    │   │   └── PlayerState.js     ✅ Player state management
    │   ├── AI/                       # AI system (To be implemented)
    │   │   ├── AIEngine.js        ❌ Main AI controller
    │   │   ├── DecisionMaker.js   ❌ AI decision logic
    │   │   ├── ActionPlanner.js   ❌ Action sequencing
    │   │   ├── Strategy/            # AI strategies
    │   │   │   ├── AggressiveStrategy.js  ❌
    │   │   │   ├── DefensiveStrategy.js   ❌
    │   │   │   └── BalancedStrategy.js    ❌
    │   │   ├── Heuristics/          # AI evaluation system
    │   │   │   ├── EvaluationFunctions.js ❌
    │   │   │   └── ScoringSystem.js       ❌
    │   │   └── Simulation/          # Action simulation
    │   │       ├── MoveSimulator.js       ❌
    │   │       └── OutcomePredictor.js    ❌
    │   ├── Sorts/                    # Spell system
    │   │   ├── Sort.js            ✅ Spell implementation
    │   │   ���── SortList.js        ✅ Spell UI management
    │   ├── UI/                       # User interface
    │   │   ├── Header.js          ✅ Game header
    │   │   ├── Footer.js          ✅ Game footer
    │   │   ├── HUD.js             ✅ Heads-up display
    │   │   └── Modal.js           ✅ Modal system
    │   └── Common/                   # Reusable components
    │       ├── Button.js          ✅ Custom button
    │       ├── Icon.js            ✅ Icon system
    │       ├── Badge.js           ✅ Status badges
    │       └── Tooltip.js         ✅ Tooltip system
    ├── context/                      # State management
    │   ├── GameContext.js         ✅ Game state context
    │   ├── AIContext.js          ❌ AI state management
    │   └── GameState.js          ✅ NEW - Game state logic
    ├── utils/                        # Utility functions
    │   ├── gameLogic.js          ✅ NEW - Core game logic
    │   ├── validation.js         ✅ NEW - Input validation
    │   ├── pathfinding.js        ✅ NEW - Movement algorithms
    │   ├── combat.js             ✅ NEW - Combat system
    │   ├── movement.js           ✅ NEW - Movement logic
    │   ���── turnManager.js        ✅ NEW - Turn management
    │   ├── lineOfSight.js        ✅ NEW - LOS calculations
    │   └── constants.js          ✅ Game constants
    ├── styles/                     ✅ NEW - Global styles
    │   └── global.css            ✅ Global styling
    ├── App.js                     ✅ Main application component
    └── index.js                   ✅ Application entry point

## Implementation Details

### Recently Implemented Features (✅)

1. Core Game System
   - Game setup and initialization
   - Turn-based gameplay
   - Basic movement system
   - Combat mechanics
   - Player state management

2. User Interface
   - Interactive game board
   - Action bar
   - Game status display
   - Player setup interface
   - Turn management UI

3. Game Logic
   - Movement validation
   - Combat calculations
   - Line of sight system
   - Turn sequencing
   - Win condition checking

### In Progress (🚧)

1. Combat System Enhancement
   - Status effect implementation
   - Spell variations
   - Combat animations

2. Board Interactions
   - Obstacle placement
   - Advanced movement patterns
   - Interactive spell targeting

### Pending Implementation (❌)

1. AI System
   - AI engine core
   - Strategy patterns
   - Decision making
   - Path finding optimization

2. Advanced Features
   - Game saving/loading
   - Match history
   - Tutorial system
   - Online multiplayer

### Obstacle System
- Types of obstacles:
  - Static obstacles: Permanent map features that cannot be modified
  - Dynamic obstacles: Can be created or destroyed during gameplay
  - Temporary obstacles: Created by spells or abilities, lasting for specific durations

- Obstacle Properties
  - Movement blocking: Prevents players from moving through or occupying the space
  - Line of sight blocking: Affects spell targeting and visibility
  - Spell interaction: Some obstacles may be affected by specific spells
  - Damage properties: Some obstacles might deal damage or apply effects

- Placement Rules
  - Cannot be placed on occupied cells
  - Must respect map boundaries
  - May have specific placement patterns or restrictions
  - Strategic positioning for tactical advantage

- Game Mechanics Integration
  - Pathfinding takes obstacles into account
  - Spells check for obstacle interference
  - Line of sight calculations consider obstacle positions
  - Movement validation includes obstacle detection

- Map Design
  - Pre-placed obstacles for map structure
  - Strategic obstacle placement for gameplay variety
  - Balance between open spaces and obstacle-rich areas

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- Yarn package manager

### Installation
1. Clone the repository:
```bash
git clone https://github.com/yourusername/dofus-lite.git
```

2. Install dependencies:
```bash
cd dofus-lite
yarn install
```

3. Start development server:
```bash
yarn start
```

4. Build for production:
```bash
yarn build
```

## Contributing

### Development Guidelines
1. Follow React best practices
2. Maintain component modularity
3. Write clear documentation
4. Include unit tests for new features
5. Follow existing code style

## License

This project is licensed under the MIT License - see the LICENSE file for details.
