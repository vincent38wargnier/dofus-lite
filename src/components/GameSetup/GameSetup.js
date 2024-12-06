import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { CLASSES } from '../../constants/classes';
import Button from '../Common/Button';
import './GameSetup.css';

const GameSetup = () => {
  const { actions } = useGame();
  const [players, setPlayers] = useState([
    { name: '', class: '' },
    { name: '', class: '' }
  ]);

  const handleNameChange = (index, value) => {
    const newPlayers = [...players];
    newPlayers[index].name = value;
    setPlayers(newPlayers);
  };

  const handleClassChange = (index, value) => {
    const newPlayers = [...players];
    newPlayers[index].class = value;
    setPlayers(newPlayers);
  };

  const handleStartGame = () => {
    // Validate players
    if (!isSetupValid()) return;

    // Initialize game with players
    actions.initializeGame(players);
  };

  const isSetupValid = () => {
    return players.every(player => 
      player.name.trim() !== '' && 
      CLASSES[player.class]
    );
  };

  return (
    <div className="game-setup">
      <h2>Game Setup</h2>
      
      {players.map((player, index) => (
        <div key={index} className="player-setup">
          <h3>Player {index + 1}</h3>
          
          <div className="input-group">
            <label>Name:</label>
            <input
              type="text"
              value={player.name}
              onChange={(e) => handleNameChange(index, e.target.value)}
              placeholder="Enter player name"
            />
          </div>
          
          <div className="input-group">
            <label>Class:</label>
            <select
              value={player.class}
              onChange={(e) => handleClassChange(index, e.target.value)}
            >
              <option value="">Select a class</option>
              {Object.keys(CLASSES).map(className => (
                <option key={className} value={className}>
                  {CLASSES[className].name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <Button
        onClick={handleStartGame}
        disabled={!isSetupValid()}
        variant="primary"
        size="large"
      >
        Start Game
      </Button>
    </div>
  );
};

export default GameSetup;