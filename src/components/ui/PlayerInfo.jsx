import React from 'react';
import { CLASSES } from '../../utils/classes';

const PlayerInfo = ({ player, isActive, onSpellSelect, onEndTurn }) => {
  const playerClass = CLASSES[player.class];

  return (
    <div className={`p-4 rounded-lg shadow-md w-64 ${isActive ? 'bg-blue-50 ring-2 ring-blue-400' : 'bg-gray-50'}`}>
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
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <span>HP</span>
            <span>{player.hp}/100</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-red-600 h-2 rounded-full transition-all"
              style={{ width: `${player.hp}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-sm text-gray-600">PA</div>
            <div className="font-medium">{player.pa}/6</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">PM</div>
            <div className="font-medium">{player.pm}/3</div>
          </div>
          {player.armor > 0 && (
            <div>
              <div className="text-sm text-gray-600">Armor</div>
              <div className="font-medium">{player.armor}</div>
            </div>
          )}
        </div>

        {isActive && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {player.spells.map((spell) => (
                <button
                  key={spell.id}
                  onClick={() => onSpellSelect(spell)}
                  disabled={player.pa < spell.pa}
                  className={`
                    px-2 py-1 rounded text-sm
                    ${player.pa < spell.pa 
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'}
                  `}
                  title={spell.description}
                >
                  <div className="flex flex-col items-center">
                    <span>{spell.emoji}</span>
                    <span>{spell.name}</span>
                    <span className="text-xs">{spell.pa} PA</span>
                  </div>
                </button>
              ))}
            </div>
            
            <button
              onClick={onEndTurn}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              End Turn
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerInfo;