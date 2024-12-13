import React, { useState, useEffect } from 'react';
import { combatEventEmitter } from '../Player/Player';
import FloatingCombat from './FloatingCombat';

const FloatingCombatManager = () => {
  const [effects, setEffects] = useState([]);

  useEffect(() => {
    const handleCombatEffect = (effect) => {
      if (!effect.position || typeof effect.position.x !== 'number' || typeof effect.position.y !== 'number') {
        console.warn('Invalid position for combat effect:', effect);
        return;
      }

      const newEffect = {
        ...effect,
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
      };
      
      setEffects(prev => [...prev, newEffect]);

      setTimeout(() => {
        setEffects(prev => prev.filter(e => e.id !== newEffect.id));
      }, 3000);
    };

    combatEventEmitter.on('combatEffect', handleCombatEffect);

    return () => {
      combatEventEmitter.off('combatEffect', handleCombatEffect);
    };
  }, []);

  // Group effects by position to handle staggering
  const groupedEffects = effects.reduce((groups, effect) => {
    const key = `${effect.position.x},${effect.position.y}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(effect);
    return groups;
  }, {});

  return (
    <div className="floating-combat-container" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {Object.values(groupedEffects).map(positionEffects => 
        positionEffects
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((effect, index) => (
            <FloatingCombat
              key={effect.id}
              x={effect.position.x}
              y={effect.position.y}
              value={effect.value}
              type={effect.type}
              index={index}
            />
          ))
      )}
    </div>
  );
};

export default FloatingCombatManager; 