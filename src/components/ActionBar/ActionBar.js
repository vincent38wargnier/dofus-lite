import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Sword, Shield, Move, Target, Skull, HeartPulse } from 'lucide-react';
import { CLASSES } from '../../constants/classes';
import './ActionBar.css';

const ActionBar = () => {
  const { state, actions } = useGame();
  const { currentPlayer } = state;
  const [tooltipContent, setTooltipContent] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const getSpellIcon = (spellKey, type) => {
    switch (type) {
      case 'DAMAGE': return <Sword className="spell-icon" />;
      case 'BUFF': return <Shield className="spell-icon" />;
      case 'MOVEMENT':
      case 'MOVEMENT_DAMAGE': return <Move className="spell-icon" />;
      case 'DOT_DAMAGE': return <Skull className="spell-icon" />;
      case 'HEAL': return <HeartPulse className="spell-icon" />;
      default: return <Target className="spell-icon" />;
    }
  };

  const formatEffectDescription = (effect) => {
    if (!effect) return '';
    const lines = [];
    if (effect.pa_bonus) lines.push(`+${effect.pa_bonus} PA`);
    if (effect.pm_bonus) lines.push(`+${effect.pm_bonus} PM`);
    if (effect.pa_reduction) lines.push(`-${effect.pa_reduction} PA`);
    if (effect.pm_reduction) lines.push(`-${effect.pm_reduction} PM`);
    if (effect.damage) lines.push(`${effect.damage} damage`);
    if (effect.duration) lines.push(`Duration: ${effect.duration} turns`);
    return lines.join('\n');
  };

  const getSpellTooltip = (spell) => {
    let tooltip = `${spell.name}\n${spell.description}\n\n`;
    tooltip += `Type: ${spell.type}\n`;
    tooltip += `Cost: ${spell.cost} PA\n`;
    tooltip += `Range: ${spell.range} cells\n`;
    if (spell.min_range) tooltip += `Min Range: ${spell.min_range} cells\n`;
    if (spell.damage) tooltip += `Damage: ${spell.damage}\n`;
    if (spell.pattern) tooltip += `Pattern: ${spell.pattern} (size: ${spell.pattern_size})\n`;
    if (spell.cooldown) tooltip += `Cooldown: ${spell.cooldown} turns\n`;
    if (spell.effect) tooltip += `\nEffect:\n${formatEffectDescription(spell.effect)}`;
    if (spell.self_effect) tooltip += `\nSelf Effect:\n${formatEffectDescription(spell.self_effect)}`;
    return tooltip;
  };

  const handleMouseEnter = (e, spell) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left,
      y: rect.bottom + window.scrollY
    });
    setTooltipContent(getSpellTooltip(spell));
  };

  const handleMouseLeave = () => {
    setTooltipContent(null);
  };

  if (!currentPlayer) return null;

  const hp = currentPlayer.getHP();
  const maxHp = currentPlayer.maxHp;
  const pa = currentPlayer.getPA();
  const maxPa = CLASSES[currentPlayer.class].characteristics.basePA;
  const pm = currentPlayer.getPM();
  const maxPm = CLASSES[currentPlayer.class].characteristics.basePM;
  const sorts = currentPlayer.getSorts();

  const handleSpellSelect = (sortKey) => {
    const spell = sorts[sortKey];
    actions.selectAction({
      type: 'CAST_SORT',
      sort: {
        ...spell,
        key: sortKey
      }
    });
  };

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
        {Object.entries(sorts).map(([sortKey, spell]) => {
          const cooldown = currentPlayer.getSortCooldown(sortKey);
          const isUsable = currentPlayer.canUseSort(sortKey);
          
          return (
            <button 
              key={sortKey}
              className={`spell-button ${!isUsable ? 'disabled' : ''}`}
              onClick={() => isUsable && handleSpellSelect(sortKey)}
              disabled={!isUsable}
              onMouseEnter={(e) => handleMouseEnter(e, spell)}
              onMouseLeave={handleMouseLeave}
            >
              {getSpellIcon(sortKey, spell.type)}
              <div className="spell-info">
                <div className="spell-name">{spell.name}</div>
                <div className="spell-cost">
                  {spell.cost} PA
                  {cooldown > 0 && ` (${cooldown})`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {tooltipContent && (
        <div 
          className="spell-tooltip"
          style={{
            left: tooltipPosition.x + 'px',
            top: tooltipPosition.y + 'px'
          }}
        >
          {tooltipContent}
        </div>
      )}

      <button className="end-turn-button" onClick={actions.endTurn}>
        End Turn
      </button>
    </div>
  );
};

export default ActionBar;