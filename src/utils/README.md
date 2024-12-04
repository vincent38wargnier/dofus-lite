# Utilities Documentation

This directory contains utility functions, constants, and shared logic used throughout the application.

## Overview

### Constants (constants.js)
Game-wide constants including:
```javascript
// Board Configuration
export const BOARD_SIZE = 10;
export const OBSTACLE_CHANCE = 0.1;

// Player Stats
export const INITIAL_STATS = {
  hp: 100,
  pa: 6,
  pm: 3,
};

// Game Settings
export const TURN_DURATION = 60; // seconds

// Icons and Visual Elements
export const PLAYER_ICONS = {
  PLAYER_1: '🗡️',
  PLAYER_2: '🏹',
};

export const OBSTACLE_ICONS = {
  TREE: '🌳',
  ROCK: '🪨',
};
```

### Classes Configuration (classes.js)
Character class definitions:
```javascript
export const CLASSES = {
  SWORD: {
    name: 'Sword Master',
    icon: '🗡️',
    spells: [...],
  },
  ARCHER: {
    name: 'Archer',
    icon: '🏹',
    spells: [...],
  }
};
```

## Spell System

### Spell Types
- hit: Direct damage
- heal: HP restoration
- boostPa: Action point boost
- boostPm: Movement point boost
- teleport: Position change

### Spell Properties
```javascript
{
  id: string,
  name: string,
  type: SpellType,
  damage?: number,
  healing?: number,
  boost?: number,
  range: number,
  pa: number,
  usesPerTurn: number,
  cooldown?: number,
  duration?: number,
  description: string,
  emoji: string
}
```

## Helper Functions

### Pathfinding
```javascript
const calculateDistance = (pos1, pos2) => {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
};

const isValidPosition = (x, y) => {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
};
```

### Buff Management
```javascript
const applyBuff = (player, buff) => {
  return {
    ...player,
    [buff.type]: player[buff.type] + buff.value,
    activeBuffs: [...player.activeBuffs, buff]
  };
};

const removeExpiredBuffs = (player) => {
  const activeBuffs = player.activeBuffs.filter(buff => buff.turnsLeft > 0);
  // Remove buff effects and return updated player
};
```

## Type Definitions

### Position
```typescript
interface Position {
  x: number;
  y: number;
}
```

### Player
```typescript
interface Player {
  id: number;
  class: string;
  position: Position;
  hp: number;
  pa: number;
  pm: number;
  spells: Spell[];
  activeBuffs: Buff[];
}
```

### Buff
```typescript
interface Buff {
  type: 'pa' | 'pm' | 'armor';
  value: number;
  turnsLeft: number;
  source: string;
}
```

## Best Practices

1. Constants Naming:
   - Use UPPER_SNAKE_CASE for constants
   - Group related constants in objects
   - Document magic numbers

2. Helper Functions:
   - Keep functions pure
   - Add TypeScript-style comments
   - Handle edge cases
   - Include error messages

3. Configuration:
   - Centralize game settings
   - Use semantic naming
   - Document all options
   - Include default values

4. Type Safety:
   - Use TypeScript-like interfaces
   - Validate parameters
   - Handle null cases
   - Document expected types

## Adding New Utilities

1. Create utility file:
```javascript
export const newUtility = (params) => {
  // Utility logic
};
```

2. Add to index.js:
```javascript
export * from './newUtility';
```

3. Document usage:
```javascript
/**
 * Utility description
 * @param {Type} param - Parameter description
 * @returns {Type} Return value description
 */
```

## Testing

Example test structure:
```javascript
describe('Utility', () => {
  test('should handle valid input', () => {
    expect(utility(validInput)).toBe(expectedOutput);
  });

  test('should handle edge cases', () => {
    expect(utility(edgeCase)).toBe(expectedOutput);
  });

  test('should throw on invalid input', () => {
    expect(() => utility(invalidInput)).toThrow();
  });
});
```