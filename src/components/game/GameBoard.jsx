import React from 'react';
import GameCell from './GameCell';
import { BOARD_SIZE } from '../../utils/constants';

const GameBoard = ({ 
  board, 
  players, 
  currentPlayer,
  selectedSpell,
  path,
  onCellClick,
  onCellHover,
  onCellLeave
}) => {
  const getPlayerAtPosition = (x, y) => {
    const player = players.find(p => p.position.x === x && p.position.y === y);
    return player ? player.id : null;
  };

  const isInSpellRange = (x, y) => {
    if (!selectedSpell) return false;
    const player = players[currentPlayer];
    const dx = Math.abs(x - player.position.x);
    const dy = Math.abs(y - player.position.y);
    return dx + dy <= selectedSpell.range;
  };

  const isInPath = (x, y) => {
    return path.some(pos => pos.x === x && pos.y === y);
  };

  return (
    <div className="relative bg-gray-100 p-4 rounded-lg shadow-lg">
      <div 
        className="grid gap-0 bg-white border-2 border-gray-300"
        style={{ 
          gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
        }}
      >
        {board.map((row, y) =>
          row.map((cell, x) => (
            <GameCell
              key={`${x}-${y}`}
              x={x}
              y={y}
              type={cell.type}
              playerId={getPlayerAtPosition(x, y)}
              isHighlighted={selectedSpell && isInSpellRange(x, y)}
              isInPath={isInPath(x, y)}
              onClick={() => onCellClick(x, y)}
              onHover={() => onCellHover(x, y)}
              onLeave={() => onCellLeave()}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default React.memo(GameBoard);