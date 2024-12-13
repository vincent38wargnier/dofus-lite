import React from 'react';
import './FloatingCombat.css';

const FloatingCombat = ({ x, y, value, type }) => {
  const prefix = value > 0 ? '+' : '';
  
  return (
    <div
      className={`floating-number ${type}`}
      style={{ left: x, top: y }}
    >
      {prefix}{value}
    </div>
  );
};

export default FloatingCombat; 