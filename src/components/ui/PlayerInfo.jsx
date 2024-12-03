import React from 'react';
import SpellBook from './SpellBook';

const PlayerInfo = ({ player, isActive, onSpellSelect, onEndTurn }) => {
  return (
    <div className={`p-4 rounded-lg shadow-md w-64 ${isActive ? 'bg-blue-50 ring-2 ring-blue-400' : 'bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">
          {player.id === 0 ? '🗡️' : '🏹'}
        </span>
        <h2 className="text-lg font-bold">
          Player {player.id + 1}
        </h2>
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

        <div className="flex justify-between">
          <div>
            <div className="text-sm text-gray-600">PA</div>
            <div className="font-medium">{player.pa}/6</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">PM</div>
            <div className="font-medium">{player.pm}/3</div>
          </div>
        </div>

        {isActive && (
          <div className="space-y-2">
            <SpellBook 
              pa={player.pa}
              onSpellSelect={onSpellSelect}
            />
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