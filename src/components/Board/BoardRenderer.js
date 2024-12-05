import React, { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import Cell from './Cell';
import BoardInteractionManager from './BoardInteractionManager';
import './Board.css';

const BoardRenderer = () => {
  const { state } = useGame();
  const [interactionManager] = useState(() => new BoardInteractionManager(state));
  const [selectedCell, setSelectedCell] = useState(null);
  const [highlightedCells, setHighlightedCells] = useState(new Set());

  useEffect(() => {
    const handleInteraction = (event, data) => {
      switch (event) {
        case 'cellSelected':
          setSelectedCell(data);
          break;
        case 'highlightsUpdated':
          setHighlightedCells(data.highlightedCells);
          break;
        case 'actionCleared':
          setSelectedCell(null);
          break;
      }
    };

    interactionManager.addListener(handleInteraction);
    return () => interactionManager.removeListener(handleInteraction);
  }, [interactionManager]);

  const handleCellClick = (x, y) => {
    if (state.status === 'ACTIVE' && state.currentPlayer) {
      interactionManager.handleCellClick(x, y);
    }
  };

  const renderBoard = () => {
    const { board } = state;
    if (!board) return null;

    return (
      <div 
        className="board-grid"
        style={{
          gridTemplateColumns: `repeat(${board.width}, 1fr)`,
          gridTemplateRows: `repeat(${board.height}, 1fr)`
        }}
      >
        {Array.from({ length: board.height }, (_, y) => (
          Array.from({ length: board.width }, (_, x) => {
            const cell = board.getCell(x, y);
            const isHighlighted = highlightedCells.has(`${x},${y}`);
            const isSelected = selectedCell && 
                             selectedCell.x === x && 
                             selectedCell.y === y;

            return (
              <Cell
                key={`${x}-${y}`}
                x={x}
                y={y}
                cell={cell}
                isHighlighted={isHighlighted}
                isSelected={isSelected}
                onClick={() => handleCellClick(x, y)}
              />
            );
          })
        )).flat()}
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
