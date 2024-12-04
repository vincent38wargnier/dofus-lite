# Dofus Lite

A lightweight tactical turn-based game inspired by Dofus, built with React. Players control characters on a grid-based map, using spells and movement to outmaneuver their opponents.

## Features

- 🎮 Turn-based tactical combat
- 🎯 Different character classes with unique abilities
- 🤖 AI opponents with customizable strategies
- 🌟 Spell effects and animations
- ⚔️ Strategic positioning and resource management

## Quick Start

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

3. Start the development server
```bash
npm start
# or
yarn start
```

## Project Structure

```
src/
├── ai/                 # AI implementations
├── components/         # React components
│   ├── game/          # Game mechanics components
│   └── ui/            # User interface components
├── hooks/             # Custom React hooks
└── utils/             # Utility functions and constants
```

## Game Mechanics

### Turn System
- Each turn lasts 60 seconds
- Players alternate turns
- Each turn, players get:
  - 6 Action Points (PA)
  - 3 Movement Points (PM)

### Characters
Currently implemented classes:
- Sword Master (Close combat specialist)
- Archer (Ranged combat specialist)

Each class has unique spells with different:
- Damage/healing values
- PA costs
- Range limitations
- Usage limits per turn
- Cooldown periods

### AI System
- Toggleable AI control for each player
- Strategic decision making based on:
  - Current game state
  - Resource management
  - Positional advantages
  - Spell availability

## Component Documentation

For detailed documentation of each major component, see:
- [Game Components](src/components/game/README.md)
- [AI System](src/ai/README.md)
- [UI Components](src/components/ui/README.md)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.