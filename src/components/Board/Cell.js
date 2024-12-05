import React from 'react';
import { useGame } from '../../context/GameContext';
import Tooltip from '../Common/Tooltip';
import './Cell.css';

const Cell = ({ 
  x, 
  y, 
  cell, 
  isHighlighted, 
  isSelected,
  isInPath,
  isInRange,
  pathStep,
  onMouseEnter,
  onMouseLeave,
  onClick 
}) => {
  const { state } = useGame();
  const { currentPlayer } = state;

  const getClassNames = () => {
    let classNames = ['cell'];

    if (isHighlighted) classNames.push('cell-highlighted');
    if (isSelected) classNames.push('cell-selected');
    if (isInPath) classNames.push('cell-path');
    if (isInRange) classNames.push('cell-in-range');
    if (cell.occupant) classNames.push('cell-occupied');

    return classNames.join(' ');
  };

  const renderOccupant = () => {
    if (!cell.occupant) return null;

    const isCurrentPlayer = cell.occupant === currentPlayer;
    
    return (
      <Tooltip content={getOccupantTooltip(cell.occupant)}>
        <div 
          className={`
            cell-occupant 
            occupant-${cell.occupant.class.toLowerCase()}
            ${isCurrentPlayer ? 'current-player' : ''}
          `}
        />
      </Tooltip>
    );
  };

  const renderPathPreview = () => {
    if (!isInPath || pathStep === null) return null;
    
    return (
      <div className="path-preview">
        <span className="path-number">{pathStep + 1}</span>
      </div>
    );
  };

  const getOccupantTooltip = (occupant) => (
    <div className="tooltip-content">
      <div>{occupant.name}</div>
      <div>Class: {occupant.class}</div>
      <div>HP: {occupant.getHP()}/{occupant.maxHp}</div>
      <div>PA: {occupant.getPA()}</div>
      <div>PM: {occupant.getPM()}</div>
      {occupant.getStatusEffects().map((effect, index) => (
        <div key={index}>
          {effect.name} ({effect.duration} turns)
        </div>
      ))}
    </div>
  );

  const handleMouseEnter = () => {
    if (onMouseEnter) onMouseEnter(x, y);
  };

  const handleMouseLeave = () => {
    if (onMouseLeave) onMouseLeave(x, y);
  };

  const handleClick = () => {
    if (onClick) onClick(x, y);
  };

  return (
    <div 
      className={getClassNames()}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-x={x}
      data-y={y}
    >
      {renderPathPreview()}
      {renderOccupant()}
    </div>
  );
};

export default React.memo(Cell);
