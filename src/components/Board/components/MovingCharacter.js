import React from 'react';

const MovingCharacter = ({ characterClass, animationStyle }) => {
  if (!characterClass || !animationStyle) return null;

  return (
    <div
      className={`moving-character occupant-${characterClass} animating`}
      style={animationStyle}
    />
  );
};

export default MovingCharacter;