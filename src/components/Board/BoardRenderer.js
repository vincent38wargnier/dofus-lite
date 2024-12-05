import React from 'react';
import { useGame } from '../../context/GameContext';
import Cell from './Cell';
import { BOARD_CONFIG } from '../../utils/constants';

const BoardRenderer = () => {
  const { state, actions } = useGame();
  const { board } = state;

  const handleCellClick = (cellData) => {
    // This will be implemented with the movement and action logic
    console.log('Cell clicked:', cellData);
  };

  const renderBoard = () => {
    if (!board) {
      return null;
    }

    return (
      <div className="board-grid" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_CONFIG.DEFAULT_SIZE.columns}, 1fr)`,
        gap: '2px',
        padding: '10px',
        backgroundColor: '#2c3e50'
      }}>
        {board.map((row, y) =>
          row.map((cell, x) => (
            <Cell
              key={`${x}-${y}`}
              x={x}
              y={y}
              type={cell.type}
              occupant={cell.occupant}
              obstacle={cell.obstacle}
              isHighlighted={cell.isHighlighted}
              onClick={handleCellClick}
            />
          ))
        )}
      </div>
    );
  };

  return (
    <div className="board-container">
      {renderBoard()}
    </div>
  );
};

export default BoardRenderer;
