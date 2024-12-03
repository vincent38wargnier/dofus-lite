import React from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from '../ui/PlayerInfo';
import TurnTimer from '../ui/TurnTimer';
import useGameState from '../../hooks/useGameState';

const Game = () => {
  const {
    gameState,
    movePlayer,
    castSpell,
    selectSpell,
    endTurn,
    setHoveredCell,
  } = useGameState();

  const handleCellClick = (x, y) => {
    if (gameState.selectedSpell) {
      castSpell(x, y);
    } else if (gameState.path.length > 0 && !gameState.moving) {
      movePlayer(gameState.path);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="container mx-auto flex flex-col items-center gap-8">
        <div className="flex justify-between w-full max-w-4xl">
          <PlayerInfo
            player={gameState.players[0]}
            isActive={gameState.currentPlayer === 0}
            onSpellSelect={selectSpell}
            onEndTurn={endTurn}
          />
          
          <TurnTimer timeLeft={gameState.timeLeft} />
          
          <PlayerInfo
            player={gameState.players[1]}
            isActive={gameState.currentPlayer === 1}
            onSpellSelect={selectSpell}
            onEndTurn={endTurn}
          />
        </div>
        
        <GameBoard
          board={gameState.board}
          players={gameState.players}
          currentPlayer={gameState.currentPlayer}
          selectedSpell={gameState.selectedSpell}
          path={gameState.path}
          onCellClick={handleCellClick}
          onCellHover={(x, y) => setHoveredCell({ x, y })}
          onCellLeave={() => setHoveredCell(null)}
        />
      </div>
    </div>
  );
};

export default Game;