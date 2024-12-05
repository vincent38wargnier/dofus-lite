import React from 'react';
import './Icon.css';

const Icon = ({ 
  name, 
  size = 'medium', 
  color = 'currentColor',
  className = '' 
}) => {
  const getIconContent = () => {
    switch (name) {
      case 'heart':
        return '❤️';
      case 'sword':
        return '⚔️';
      case 'shield':
        return '🛡️';
      case 'magic':
        return '✨';
      case 'move':
        return '👣';
      case 'time':
        return '⏱️';
      case 'target':
        return '🎯';
      case 'poison':
        return '☠️';
      case 'heal':
        return '💚';
      case 'mana':
        return '🔮';
      case 'close':
        return '✖️';
      case 'check':
        return '✔️';
      default:
        return '❓';
    }
  };

  return (
    <span 
      className={`icon icon-${size} ${className}`}
      style={{ color }}
      role="img"
      aria-label={name}
    >
      {getIconContent()}
    </span>
  );
};

export default Icon;
