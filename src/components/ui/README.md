# UI Components Documentation

This directory contains user interface components that handle game visualization and player interaction.

## Components Overview

### PlayerInfo.jsx
Displays player status and controls including:
- Health points
- Action points (PA)
- Movement points (PM)
- Available spells
- AI control toggle

```jsx
// Example usage
<PlayerInfo
  player={playerData}
  isActive={true}
  onSpellSelect={handleSpellSelect}
  onEndTurn={handleEndTurn}
  disabled={false}
  isAIControlled={false}
  onAIToggle={handleAIToggle}
/>
```

### SpellBook Component
Displays available spells and their:
- Cost
- Range
- Effects
- Cooldown status
- Usage limits

### TurnTimer.jsx
Manages the turn countdown:
- Visual countdown
- Color changes for urgency
- Turn end handling

```jsx
<TurnTimer 
  timeLeft={timeInSeconds}
  onTimeEnd={handleTimeEnd}
/>
```

### VictoryScreen.jsx
End-game display showing:
- Winner announcement
- Final stats
- Replay option

## Animations

### Damage Numbers
- Pop-up animation
- Color-coded (red for damage, green for healing)
- Fade-out effect

### Spell Effects
- Range indicators
- Cast animations
- Impact effects

### Movement
- Path highlighting
- Character movement
- Obstacle interaction

## Styling Guide

### Color Scheme
```javascript
const colors = {
  primary: 'blue-500',
  secondary: 'gray-500',
  danger: 'red-500',
  success: 'green-500',
  warning: 'yellow-500'
};
```

### Layout Classes
Common Tailwind classes used:
```css
/* Container layouts */
.container-class = "flex flex-col items-center justify-center"

/* Card layouts */
.card-class = "p-4 rounded-lg shadow-md"

/* Animation classes */
.animation-class = "transition-all duration-200"
```

## Interaction States

Components handle multiple states:
- Normal
- Hover
- Active
- Disabled
- Loading
- Error

## Best Practices

When modifying UI components:
1. Maintain responsive design
2. Follow accessibility guidelines
3. Keep consistent styling
4. Document prop types
5. Handle loading states
6. Provide user feedback

## Adding New Components

1. Create component file
2. Add to index.js export
3. Document props and usage
4. Add styling
5. Implement tests

Example:
```jsx
import React from 'react';

const NewComponent = ({ prop1, prop2 }) => {
  return (
    <div className="new-component">
      {/* Component content */}
    </div>
  );
};

export default NewComponent;
```

## State Management

UI components should:
- Minimize internal state
- Use props for data
- Emit events for changes
- Handle loading states
- Provide error feedback

## Accessibility

Ensure components:
- Have proper ARIA labels
- Support keyboard navigation
- Maintain color contrast
- Handle screen readers
- Support reduced motion