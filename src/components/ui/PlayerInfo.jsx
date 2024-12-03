import React, { useState } from 'react';
import { CLASSES } from '../../utils/classes';

const SpellEffectPreview = ({ spell }) => {
  if (spell.type === 'hit') {
    return (
      <div className="mt-1 bg-gray-800 p-1 rounded text-white text-xs">
        <div className="text-center mb-1">Range Pattern:</div>
        <div className="grid grid-cols-7 gap-px">
          {Array(7).fill().map((_, y) => (
            <div key={y} className="flex">
              {Array(7).fill().map((_, x) => {
                const distance = Math.abs(x - 3) + Math.abs(y - 3);
                const isInRange = distance <= spell.range;
                const isCenter = x === 3 && y === 3;
                return (
                  <div 
                    key={`${x}-${y}`}
                    className={`
                      w-2.5 h-2.5 flex items-center justify-center text-[8px]
                      ${isCenter ? 'bg-yellow-500' : isInRange ? 'bg-red-500/50' : 'bg-gray-700'}
                      ${isCenter ? 'text-black' : 'text-white'}
                    `}
                  >
                    {isCenter ? '🎯' : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-1 text-center text-red-400">
          Damage: {spell.damage}
        </div>
      </div>
    );
  }

  if (spell.type === 'boostPa' || spell.type === 'boostPm') {
    const boostType = spell.type === 'boostPa' ? 'PA' : 'PM';
    const examples = Array(spell.boost).fill('➕');
    return (
      <div className="mt-1 bg-gray-800 p-2 rounded text-white text-xs">
        <div className="flex items-center gap-1">
          <span>Current {boostType}:</span>
          {Array(6).fill('⬜').map((box, i) => (
            <span key={i} className="text-xs">{box}</span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-green-400">
          <span>Boost:</span>
          {examples.map((plus, i) => (
            <span key={i} className="text-green-400">{plus}</span>
          ))}
        </div>
        <div className="mt-1 text-xs text-center text-green-400">
          +{spell.boost} {boostType} for {spell.duration} turns
        </div>
      </div>
    );
  }

  if (spell.type === 'heal') {
    return (
      <div className="mt-1 bg-gray-800 p-2 rounded text-white text-xs">
        <div className="flex justify-center gap-1 text-green-400 text-lg">
          {Array(3).fill('💚').map((heart, i) => (
            <span key={i} className="animate-pulse">{heart}</span>
          ))}
        </div>
        <div className="mt-1 text-center text-green-400">
          Restore {spell.healing} HP
        </div>
      </div>
    );
  }

  if (spell.type === 'teleport') {
    return (
      <div className="mt-1 bg-gray-800 p-1 rounded text-white text-xs">
        <div className="text-center mb-1">Teleport Range:</div>
        <div className="grid grid-cols-7 gap-px">
          {Array(7).fill().map((_, y) => (
            <div key={y} className="flex">
              {Array(7).fill().map((_, x) => {
                const distance = Math.abs(x - 3) + Math.abs(y - 3);
                const isInRange = distance <= spell.range;
                const isCenter = x === 3 && y === 3;
                return (
                  <div 
                    key={`${x}-${y}`}
                    className={`
                      w-2.5 h-2.5 flex items-center justify-center text-[8px]
                      ${isCenter ? 'bg-blue-500' : isInRange ? 'bg-blue-500/30' : 'bg-gray-700'}
                    `}
                  >
                    {isCenter ? '🧙' : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-1 text-center text-blue-400">
          Range: {spell.range} cells
        </div>
      </div>
    );
  }

  return null;
};

const SpellHint = ({ spell }) => {
  if (!spell) {
    return (
      <div className="h-36 p-2 bg-gray-100 rounded mt-2 text-sm text-gray-500 flex items-center justify-center">
        Hover over a spell to see its description
      </div>
    );
  }

  return (
    <div className="h-36 p-2 bg-gray-100 rounded mt-2">
      <div className="text-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{spell.emoji}</span>
          <span className="font-bold">{spell.name}</span>
        </div>
        <div className="text-gray-600 text-xs mb-1">{spell.description}</div>
        
        <SpellEffectPreview spell={spell} />
      </div>
    </div>
  );
};

const SpellButton = ({ spell, onSpellSelect, onHover, onLeave, disabled, pa, isActiveTurn }) => {
  const isOnCooldown = spell.cooldownLeft > 0;
  const noUsesLeft = spell.usesLeft <= 0;
  const cantAfford = pa < spell.pa;
  const isDisabled = disabled || isOnCooldown || noUsesLeft || cantAfford;

  return (
    <button
      onClick={() => !isDisabled && isActiveTurn && onSpellSelect(spell)}
      onMouseEnter={() => onHover(spell)}
      onMouseLeave={onLeave}
      disabled={disabled}
      className={`
        px-2 py-1 rounded text-sm relative
        transition-all duration-200
        ${isActiveTurn 
          ? isDisabled
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
          : 'bg-gray-100 text-gray-600'}
      `}
    >
      <div className="flex flex-col items-center">
        <span>{spell.emoji}</span>
        <span className="whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
          {spell.name}
        </span>
        <div className="text-xs space-x-1">
          <span>{spell.pa} PA</span>
          {spell.usesPerTurn > 1 && (
            <span>({spell.usesLeft}/{spell.usesPerTurn})</span>
          )}
        </div>
        {isOnCooldown && isActiveTurn && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
            <span className="text-white font-bold text-lg">
              {spell.cooldownLeft}
            </span>
          </div>
        )}
      </div>
    </button>
  );
};

const PlayerInfo = ({ player, isActive, onSpellSelect, onEndTurn, disabled }) => {
  const [hoveredSpell, setHoveredSpell] = useState(null);
  const playerClass = CLASSES[player.class];
  const isDead = player.hp <= 0;

  return (
    <div 
      className={`
        p-4 rounded-lg shadow-md w-72 min-h-[600px] flex flex-col
        transition-all duration-300
        ${isActive ? 'bg-blue-50 ring-2 ring-blue-400' : 'bg-gray-50'}
        ${isDead ? 'opacity-50' : ''}
        ${disabled ? 'pointer-events-none' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">
          {playerClass.icon}
        </span>
        <div>
          <h2 className="text-lg font-bold">
            Player {player.id + 1}
          </h2>
          <div className="text-sm text-gray-600">
            {playerClass.name}
          </div>
          {isDead && (
            <div className="text-sm text-red-500 font-bold mt-1">
              Defeated ☠️
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 flex-grow">
        {/* HP Bar */}
        <div>
          <div className="flex justify-between mb-1">
            <span>HP</span>
            <span>{player.hp}/100</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${isDead ? 'bg-gray-400' : 'bg-red-600'}`}
              style={{ width: `${Math.max(0, player.hp)}%` }}
            />
          </div>
        </div>

        {/* Stats with Active Buffs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-sm text-gray-600">PA</div>
            <div className="font-medium flex items-center gap-1">
              {player.pa}/6
              {player.activeBuffs?.some(buff => buff.type === 'pa') && (
                <span className="text-green-500 text-xs">
                  +{player.activeBuffs.reduce((acc, buff) => 
                    buff.type === 'pa' ? acc + buff.value : acc, 0
                  )}
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">PM</div>
            <div className="font-medium flex items-center gap-1">
              {player.pm}/3
              {player.activeBuffs?.some(buff => buff.type === 'pm') && (
                <span className="text-green-500 text-xs">
                  +{player.activeBuffs.reduce((acc, buff) => 
                    buff.type === 'pm' ? acc + buff.value : acc, 0
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Active Buffs */}
        {player.activeBuffs && player.activeBuffs.length > 0 && (
          <div className="text-xs text-gray-600">
            Active Buffs:
            <div className="flex flex-wrap gap-1 mt-1">
              {player.activeBuffs.map((buff, index) => (
                <div key={index} className="bg-green-100 text-green-700 px-1 rounded">
                  +{buff.value} {buff.type.toUpperCase()} ({buff.turnsLeft}t)
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spells - Now always visible */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {player.spells.map((spell) => (
              <SpellButton
                key={spell.id}
                spell={spell}
                pa={player.pa}
                onSpellSelect={onSpellSelect}
                onHover={() => setHoveredSpell(spell)}
                onLeave={() => setHoveredSpell(null)}
                disabled={disabled}
                isActiveTurn={isActive && !isDead}
              />
            ))}
          </div>
          
          {isActive && !isDead && (
            <button
              onClick={onEndTurn}
              disabled={disabled}
              className={`
                w-full px-4 py-2 rounded transition-colors
                ${disabled 
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gray-500 text-white hover:bg-gray-600'}
              `}
            >
              End Turn
            </button>
          )}
        </div>

        <SpellHint spell={hoveredSpell} />
      </div>
    </div>
  );
};

export default PlayerInfo;