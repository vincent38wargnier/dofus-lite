import React from 'react';
import { useGame } from '../../context/GameContext';
import './Sort.css';

const Sort = ({ sort, isUsable, onSelect }) => {
  const getSortTypeIcon = (type) => {
    switch (type) {
      case 'DAMAGE':
        return '⚔️';
      case 'HEAL':
        return '💚';
      case 'BUFF':
        return '⬆️';
      case 'DEBUFF':
        return '⬇️';
      case 'MOVEMENT':
        return '👣';
      case 'MOVEMENT_DAMAGE':
        return '🏃⚔️';
      case 'DOT_DAMAGE':
        return '☠️';
      default:
        return '❓';
    }
  };

  const renderSortInfo = () => (
    <div className="sort-tooltip">
      <h4>{sort.name}</h4>
      <p>Type: {sort.type}</p>
      <p>Cost: {sort.cost} PA</p>
      <p>Range: {sort.range} cells</p>
      {sort.damage && <p>Damage: {sort.damage}</p>}
      {sort.healing && <p>Healing: {sort.healing}</p>}
      {sort.duration && <p>Duration: {sort.duration} turns</p>}
      <p>Cooldown: {sort.cooldown} turns</p>
    </div>
  );

  return (
    <div 
      className={`sort ${!isUsable ? 'sort-disabled' : ''}`}
      onClick={() => isUsable && onSelect()}
      data-type={sort.type}
    >
      <div className="sort-icon">
        {getSortTypeIcon(sort.type)}
      </div>
      <div className="sort-details">
        <span className="sort-name">{sort.name}</span>
        <div className="sort-cost">
          <span>{sort.cost} PA</span>
          {sort.cooldown > 0 && (
            <span className="sort-cooldown">
              🕒 {sort.cooldown}
            </span>
          )}
        </div>
      </div>
      {renderSortInfo()}
    </div>
  );
};

export default Sort;