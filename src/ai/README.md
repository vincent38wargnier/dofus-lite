# AI System Documentation

This directory contains the artificial intelligence implementations for different character classes.

## Overview

The AI system provides automated decision-making for game characters, allowing for:
- Single-player gameplay
- AI vs AI demonstrations
- Training scenarios

## AI Classes

### Base AI Interface
All AI implementations should follow this basic structure:
```javascript
class BaseAI {
  initialize(gameState, playerId) {}
  makeDecision() {}
  getEnemy() {}
  getMyPlayer() {}
}
```

### SwordMasterAI
Specialized AI for the Sword Master class focusing on:
- Close combat positioning
- Efficient PA/PM usage
- Strategic buff timing
- Health management

```javascript
// Example usage
const ai = new SwordMasterAI();
ai.initialize(gameState, playerId);
const decision = await ai.makeDecision();
```

## Decision Making

### State Analysis
AIs analyze:
- Current board state
- Player positions
- Available resources (PA/PM)
- Spell availability
- Health status

### Action Priority
1. Emergency healing (HP < 30%)
2. Offensive opportunities
3. Tactical positioning
4. Resource management
5. Turn end

### Decision Types
```javascript
// Movement decision
{
  type: 'move',
  path: [{x, y}, ...],
  nextAction: null | {type: 'cast', ...}
}

// Spell cast decision
{
  type: 'cast',
  spell: SpellObject,
  target: {x, y}
}

// Turn end decision
{
  type: 'end_turn'
}
```

## Pathfinding

The AI uses a modified A* algorithm for:
- Finding optimal paths
- Avoiding obstacles
- Calculating spell ranges
- Planning multi-turn movements

## Adding New AI Classes

1. Create new class file
2. Implement required interface
3. Add specialized decision logic
4. Register in Game component

Example:
```javascript
export class NewClassAI {
  constructor() {
    this.initialized = false;
    this.gameState = null;
    this.myId = null;
  }

  initialize(gameState, playerId) {
    this.gameState = gameState;
    this.myId = playerId;
    this.initialized = true;
  }

  async makeDecision() {
    // Implement decision logic
    return decision;
  }
}
```

## Debugging

The AI system includes:
- Extensive console logging
- Visual state indicators
- Action delay configuration
- Error handling

## Best Practices

When modifying AI:
1. Maintain deterministic behavior
2. Add appropriate delays
3. Handle edge cases
4. Document decision logic
5. Test against various scenarios