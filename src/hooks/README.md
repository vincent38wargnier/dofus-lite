# Custom Hooks Documentation

This directory contains custom React hooks that manage complex game logic and state.

## Hooks Overview

### useGameState

Primary game state management hook handling:
- Board state
- Player stats
- Turn management
- Action processing

```javascript
const {
  gameState,
  movePlayer,
  castSpell,
  selectSpell,
  endTurn,
  setHoveredCell,
} = useGameState();
```

#### State Structure
```javascript
{
  board: Array(10).fill().map(() => Array(10)),
  players: [
    {
      id: number,
      position: { x: number, y: number },
      hp: number,
      pa: number,
      pm: number,
      spells: Array<Spell>,
      activeBuffs: Array<Buff>
    }
  ],
  currentPlayer: number,
  selectedSpell: Spell | null,
  timeLeft: number,
  winner: number | null,
  moving: boolean,
  path: Array<Position>,
  hoveredCell: Position | null,
  damageAnimation: Animation | null
}
```

#### Actions
```javascript
// Movement
movePlayer(path: Array<Position>): void

// Spells
castSpell(x: number, y: number): void
selectSpell(spell: Spell): void

// Turn Management
endTurn(): void

// UI Interaction
setHoveredCell(position: Position | null): void
```

## Best Practices

### State Updates
- Use immutable updates
- Batch related changes
- Maintain atomic operations
- Handle edge cases
- Provide error feedback

### Performance
- Memoize callbacks
- Use appropriate dependencies
- Avoid unnecessary re-renders
- Clean up effects

Example:
```javascript
useEffect(() => {
  const timer = setInterval(() => {
    // Effect logic
  }, 1000);
  
  return () => clearInterval(timer);
}, [dependencies]);
```

### Error Handling
```javascript
const handleAction = async () => {
  try {
    // Action logic
  } catch (error) {
    console.error('Action failed:', error);
    // Handle error appropriately
  }
};
```

## Adding New Hooks

1. Create hook file
2. Document parameters and return values
3. Add error handling
4. Include usage examples
5. Add tests

Example:
```javascript
import { useState, useEffect } from 'react';

export const useNewHook = (params) => {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    // Effect logic
  }, [params]);

  const actions = {
    // Action methods
  };

  return {
    state,
    ...actions
  };
};
```

## Testing Hooks

Use React Testing Library:
```javascript
import { renderHook, act } from '@testing-library/react-hooks';

test('hook behavior', () => {
  const { result } = renderHook(() => useNewHook());

  act(() => {
    result.current.someAction();
  });

  expect(result.current.state).toBe(expectedValue);
});
```

## Common Patterns

### State Initialization
```javascript
const initialState = {
  // Initial values
};

const [state, dispatch] = useReducer(reducer, initialState);
```

### Effect Cleanup
```javascript
useEffect(() => {
  const subscription = someAPI.subscribe();
  
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

### Memoization
```javascript
const memoizedCallback = useCallback(() => {
  // Callback logic
}, [dependencies]);

const memoizedValue = useMemo(() => {
  // Computation logic
}, [dependencies]);
```