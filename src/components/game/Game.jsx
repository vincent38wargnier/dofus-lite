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
    timeLeft
  } = useGameState();

  const { board, players, currentPlayer, selectedSpell, highlightedCells } = gameState;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center gap-8">
        <div className="flex justify-between w-full max-w-4xl">
          <PlayerInfo
            player={players[0]}
            isActive={currentPlayer === 0}
            onSpellSelect={selectSpell}
            onEndTurn={endTurn}
          />
          <TurnTimer timeLeft={timeLeft} />
          <PlayerInfo
            player={players[1]}
            isActive={currentPlayer === 1}
            onSpellSelect={selectSpell}
            onEndTurn={endTurn}
          />
        </div>
        
        <GameBoard
          board={board}
          players={players}
          currentPlayer={currentPlayer}
          selectedSpell={selectedSpell}
          highlightedCells={highlightedCells}
          onCellClick={(x, y) => {
            if (selectedSpell) {
              castSpell(x, y);
            } else {
              movePlayer(x, y);
            }
          }}
        />
      </div>
    </div>
  );
};

export default Game;