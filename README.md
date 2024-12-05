# Dofus Lite

A tactical turn-based strategy game inspired by Dofus, built with React.js. Players take turns moving on a grid-based map, casting spells, and engaging in tactical combat.

## Project Overview

### Core Game Mechanics
- Turn-based combat on a grid board
- Character classes with unique abilities
- Movement and action point system
- Line of sight and range calculations
- Status effects and cooldown management
- AI opponents with different strategies

### Technical Features
- React.js frontend
- Event-driven architecture
- State management using Context API
- Modular component design
- AI decision-making system
- Custom pathfinding implementation

## Project Structure

```
dofus-lite/
├── public/                           # Static files
│   ├── index.html                  ✅
│   ├── favicon.ico                 ✅
│   └── manifest.json               ✅
└── src/
    ├── components/
    │   ├── Board/                    # Board-related components
    │   │   ├── BoardEngine.js      ✅ Core game board logic
    │   │   ├── BoardRenderer.js    ✅ Visual board rendering
    │   │   ├── Cell.js            ✅ Individual cell logic
    │   │   ├── Obstacle.js        ❌ Obstacle management
    │   │   ├── MovementManager.js  ✅ Movement calculations
    │   │   ├── ActionValidator.js  ❌ Action validation
    │   │   ├── LOSCalculator.js   ❌ Line of sight system
    │   │   ├── TurnManager.js     ❌ Turn handling
    │   │   └── EventBus.js        ❌ Event management
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
    │   │   └── SortList.js        ✅ Spell UI management
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
    │   └── GameState.js          ❌ Game state logic
    └── utils/                        # Utility functions
        ├── gameLogic.js           ❌ Core game logic
        ├── validation.js          ❌ Input validation
        ├── pathfinding.js         ❌ Movement algorithms
        ├── lineOfSight.js         ❌ LOS calculations
        └── constants.js           ✅ Game constants

## Game Mechanics Details

### Turn System
- Each player gets a turn in sequence
- Turns have a time limit (30 seconds)
- During their turn, players can:
  - Move using Movement Points (PM)
  - Cast spells using Action Points (PA)
  - End their turn early

### Combat System
- Grid-based tactical combat
- Line of sight requirements
- Range limitations
- Damage calculations
- Status effects
- Spell cooldowns

### Character Classes
1. Warrior
   - High HP and defense
   - Close-range combat
   - Defensive abilities
   - Spells:
     - Slash (melee damage)
     - Shield (defensive buff)
     - Charge (movement + damage)

2. Archer
   - Medium HP
   - Long-range attacks
   - High mobility
   - Spells:
     - Arrow Shot (ranged damage)
     - Poison Arrow (damage over time)
     - Jump Back (tactical retreat)

3. Mage
   - Low HP
   - Powerful spells
   - Area effects
   - Spells:
     - Fireball (high damage)
     - Teleport (mobility)
     - Heal (recovery)

### AI System Design
- Multiple strategy levels:
  1. Aggressive (prioritizes damage)
  2. Defensive (prioritizes survival)
  3. Balanced (adapts to situation)
- Decision making process:
  1. Analyze game state
  2. Choose strategy
  3. Evaluate possible actions
  4. Execute best action sequence

## Implementation Status

### Completed Features ✅
- Basic project structure and setup
- Game board rendering system
- Cell and grid implementation
- Movement management
- Player state system
- Basic spell system
- UI components
- Game context setup

### In Progress 🚧
- Combat system implementation
- Turn management
- Action validation
- Game state management

### Pending Features ❌
- AI system implementation
- Pathfinding algorithms
- Line of sight calculations
- Status effects system
- Game saving/loading
- Match history
- Tutorial system

## Immediate Development Priorities
1. Complete core game mechanics
   - Finish combat system
   - Implement turn management
   - Add action validation

2. Add essential gameplay features
   - Line of sight system
   - Status effects
   - Win/lose conditions

3. Develop AI system
   - Basic decision making
   - Strategy implementation
   - Path finding

4. Polish and enhance
   - Visual feedback
   - Sound effects
   - Tutorial system

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

### Pull Request Process
1. Create feature branch
2. Update documentation
3. Add necessary tests
4. Submit PR with clear description

## License

This project is licensed under the MIT License - see the LICENSE file for details.