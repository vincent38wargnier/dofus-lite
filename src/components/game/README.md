# Game Components Documentation

This directory contains the core game mechanics components.

## Components Overview

### Game.jsx
The main game controller component that:
- Manages game state
- Handles turn system
- Coordinates AI and player actions
- Manages game board and player interfaces

```jsx
// Example usage
<Game />
```

Key features:
- Turn management
- AI integration
- Player state tracking
- Victory condition checking

### GameBoard.jsx
Renders the game grid and manages:
- Cell positioning
- Movement visualization
- Spell range displays
- Player positions

```jsx
// Example usage
<GameBoard
  board={boardState}
  players={players}
  currentPlayer={currentPlayerId}
  selectedSpell={selectedSpell}
  path={movementPath}
  onCellClick={handleCellClick}
  onCellHover={handleHover}
  onCellLeave={handleLeave}
  damageAnimation={damageAnimation}
/>
```

### GameCell.jsx
Individual cell component handling:
- Content display (players, obstacles)
- Interaction events
- Visual states (movement range, spell range)
- Animations (damage, healing)

```jsx
// Example usage
<GameCell
  x={0}
  y={0}
  type="empty"
  playerId={null}
  isHighlighted={false}
  isInPath={false}
  onClick={() => {}}
/>
```

## State Management

### Game State
The game maintains several key state elements:
```javascript
{
  board: Array(10).fill().map(() => Array(10).fill()),
  players: [
    { id, position, hp, pa, pm, spells, activeBuffs },
    { id, position, hp, pa, pm, spells, activeBuffs }
  ],
  currentPlayer: 0,
  selectedSpell: null,
  timeLeft: 60,
  winner: null
}
```

### Event Flow
1. Player/AI initiates action
2. Action validation
3. State update
4. Visual feedback
5. Turn progression

## Animation System

Animations are handled through:
- CSS transitions for smooth state changes
- React state for coordinating multiple animations
- Tailwind classes for consistent styling

## Best Practices

When modifying game components:
1. Maintain pure render functions
2. Use React.memo for performance
3. Keep state updates atomic
4. Document complex game logic
5. Add console logs for debugging