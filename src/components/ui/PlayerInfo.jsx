import React, { useState } from 'react';
import { CLASSES } from '../../utils/classes';

const SpellButton = ({ spell, onSpellSelect, onHover, onLeave, disabled, pa }) => {
  const isOnCooldown = spell.cooldownLeft > 0;
  const noUsesLeft = spell.usesLeft <= 0;
  const cantAfford = pa < spell.pa;
  const isDisabled = disabled || isOnCooldown || noUsesLeft || cantAfford;

  return (
    <button
      onClick={() => !isDisabled && onSpellSelect(spell)}
      onMouseEnter={() => onHover(spell)}
      onMouseLeave={onLeave}
      disabled={isDisabled}
      className={`
        px-2 py-1 rounded text-sm relative
        transition-all duration-200
        ${isDisabled
          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-blue-500 text-white hover:bg-blue-600'}
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
        {isOnCooldown && (
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

const SpellHint = ({ spell }) => {
  if (!spell) {
    return (
      <div className="h-24 p-2 bg-gray-100 rounded mt-2 text-sm text-gray-500 flex items-center justify-center">
        Hover over a spell to see its description
      </div>
    );
  }

  return (
    <div className="h-24 p-2 bg-gray-100 rounded mt-2">
      <div className="text-sm space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">{spell.emoji}</span>
          <span className="font-bold">{spell.name}</span>
        </div>
        <div className="text-gray-600">{spell.description}</div>
        <div className="flex flex-wrap gap-2 text-xs text-gray-700">
          <div>Cost: {spell.pa} PA</div>
          <div>Range: {spell.range} cells</div>
          {spell.damage && <div>Damage: {spell.damage}</div>}
          {spell.healing && <div>Healing: {spell.healing}</div>}
          {spell.boost && (
            <div>
              Boost: +{spell.boost} {spell.type === 'boostPa' ? 'PA' : 'PM'}
              {spell.duration > 1 && ` for ${spell.duration} turns`}
            </div>
          )}
          {spell.usesPerTurn > 1 && (
            <div className="text-blue-600">{spell.usesPerTurn}x per turn</div>
          )}
          {spell.cooldown > 0 && (
            <div className="text-red-600">{spell.cooldown} turns cooldown</div>
          )}
        </div>
      </div>
    </div>
  );
};

const PlayerInfo = ({ player, isActive, onSpellSelect, onEndTurn, disabled }) => {
  const [hoveredSpell, setHoveredSpell] = useState(null);
  const playerClass = CLASSES[player.class];

  const isDead = player.hp <= 0;

  return (
    <div 
      className={`p-4 rounded-lg shadow-md w-64 transition-all duration-300
        ${isActive ? 'bg-blue-50 ring-2 ring-blue-400' : 'bg-gray-50'}
        ${isDead ? 'opacity-50' : ''}
        ${disabled ? 'pointer-events-none' : ''}
      `}
    >
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

      <div className="space-y-4">
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
              {player.activeBuffs.some(buff => buff.type === 'pa') && (
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
              {player.activeBuffs.some(buff => buff.type === 'pm') && (
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
        {player.activeBuffs.length > 0 && (
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

        {/* Spells */}
        {isActive && !isDead && (
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
                />
              ))}
            </div>
            
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
          </div>
        )}

        <SpellHint spell={hoveredSpell} />
      </div>
    </div>
  );
};

export default PlayerInfo;