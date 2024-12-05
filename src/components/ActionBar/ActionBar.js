import React from 'react';
import { useGame } from '../../context/GameContext';
import { Sword, Shield, Move, Target, Skull, HeartPulse } from 'lucide-react';
import { CLASSES, SORTS } from '../../utils/constants';
import './ActionBar.css';

const ActionBar = () => {
  const { state, actions } = useGame();
  const { currentPlayer } = state;

  const getSpellIcon = (spellKey, type) => {
    // Simple icon mapping based on spell type
    switch (type) {
      case 'DAMAGE':
        return <Sword className="spell-icon" />;
      case 'BUFF':
        return <Shield className="spell-icon" />;
      case 'MOVEMENT':
      case 'MOVEMENT_DAMAGE':
        return <Move className="spell-icon" />;
      case 'DOT_DAMAGE':
        return <Skull className="spell-icon" />;
      case 'HEAL':
        return <HeartPulse className="spell-icon" />;
      default:
        return <Target className="spell-icon" />;
    }
  };

  if (!currentPlayer) return null;

  const hp = currentPlayer.getHP();
  const maxHp = currentPlayer.maxHp;
  const pa = currentPlayer.getPA();
  const maxPa = CLASSES[currentPlayer.class].basePA;
  const pm = currentPlayer.getPM();
  const maxPm = CLASSES[currentPlayer.class].basePM;
  const sorts = currentPlayer.getSorts();

  return (
    <div className="action-bar">
      <div className="player-header">
        <div className="player-info">
          <div className="class-icon">
            {currentPlayer.class === 'WARRIOR' && <Sword />}
            {currentPlayer.class === 'ARCHER' && <Target />}
            {currentPlayer.class === 'MAGE' && <HeartPulse />}
          </div>
          <div>
            <h2 className="player-name">{currentPlayer.name}</h2>
            <p className="player-class">{CLASSES[currentPlayer.class].name}</p>
          </div>
        </div>
      </div>

      <div className="player-stats">
        <div className="hp-bar">
          <div className="hp-progress">
            <div className="hp-fill" style={{ width: `${(hp / maxHp) * 100}%` }} />
            <span className="hp-text">{hp}/{maxHp}</span>
          </div>
        </div>

        <div className="points-container">
          <div className="point-stat">
            <span>PA</span>
            <span className="point-value">{pa}/{maxPa}</span>
          </div>
          <div className="point-stat">
            <span>PM</span>
            <span className="point-value">{pm}/{maxPm}</span>
          </div>
        </div>
      </div>

      <div className="spells-grid">
        {sorts.map((sortKey) => {
          const spell = SORTS[sortKey];
          const cooldown = currentPlayer.getSortCooldown(sortKey);
          const isUsable = currentPlayer.canUseSort(spell);
          
          return (
            <button 
              key={sortKey}
              className={`spell-button ${!isUsable ? 'disabled' : ''}`}
              onClick={() => isUsable && actions.selectSort(sortKey)}
              disabled={!isUsable}
            >
              {getSpellIcon(sortKey, spell.type)}
              <div className="spell-name">{spell.name}</div>
              <div className="spell-cost">
                {spell.cost} PA
                {cooldown > 0 && ` (${cooldown})`}
              </div>
            </button>
          );
        })}
      </div>

      <button className="end-turn-button" onClick={actions.endTurn}>
        End Turn
      </button>
    </div>
  );
};

export default ActionBar;