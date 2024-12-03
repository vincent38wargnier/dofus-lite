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
      <div className="container mx-auto">
        <div className="flex justify-center items-start gap-8">
          {/* Left Player */}
          <div className="w-64">
            <PlayerInfo
              player={gameState.players[0]}
              isActive={gameState.currentPlayer === 0}
              onSpellSelect={selectSpell}
              onEndTurn={endTurn}
            />
          </div>

          {/* Game Board and Timer */}
          <div className="flex flex-col items-center">
            <GameBoard
              board={gameState.board}
              players={gameState.players}
              currentPlayer={gameState.currentPlayer}
              selectedSpell={gameState.selectedSpell}
              path={gameState.path}
              damageAnimation={gameState.damageAnimation}
              onCellClick={handleCellClick}
              onCellHover={(x, y) => setHoveredCell({ x, y })}
              onCellLeave={() => setHoveredCell(null)}
            />
            
            <div className="mt-4 w-full max-w-lg">
              <TurnTimer timeLeft={gameState.timeLeft} />
            </div>
          </div>

          {/* Right Player */}
          <div className="w-64">
            <PlayerInfo
              player={gameState.players[1]}
              isActive={gameState.currentPlayer === 1}
              onSpellSelect={selectSpell}
              onEndTurn={endTurn}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;