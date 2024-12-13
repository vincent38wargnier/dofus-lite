import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { AIEngine } from '../AI/AIEngine';
import './AIDashboard.css';

export function AIDashboard() {
  const { actions, state } = useGame();
  const [selectedStrategy, setSelectedStrategy] = useState('simple');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const handleEnableAI = async () => {
    if (!selectedPlayerId) return;
    const aiEngine = new AIEngine(`/config/ai/${selectedStrategy}_strategy.json`);
    await aiEngine.loadConfig();
    actions.initializeAI(aiEngine);
    actions.assignAIControl(selectedPlayerId, aiEngine);
  };

  return (
    <div className="ai-dashboard">
      <h3>AI Control</h3>
      <div className="ai-controls">
        <div className="control-group">
          <label>Select Player</label>
          <select 
            className="ai-select"
            value={selectedPlayerId || ''} 
            onChange={(e) => setSelectedPlayerId(e.target.value)}
          >
            <option value="">Choose player...</option>
            {state.players.map(player => (
              <option key={player.id} value={player.id}>
                {player.name} ({player.class})
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>AI Strategy</label>
          <select 
            className="ai-select"
            value={selectedStrategy} 
            onChange={(e) => setSelectedStrategy(e.target.value)}
          >
            <option value="simple">Simple Strategy</option>
            <option value="aggressive">Aggressive Strategy</option>
            <option value="defensive">Defensive Strategy</option>
          </select>
        </div>

        <div className="button-group">
          <button 
            className="ai-button ai-button-enable"
            onClick={handleEnableAI}
            disabled={!selectedPlayerId}
          >
            Enable AI
          </button>
          <button 
            className="ai-button ai-button-disable"
            onClick={() => actions.disableAI(selectedPlayerId)}
            disabled={!selectedPlayerId}
          >
            Disable AI
          </button>
        </div>
      </div>
    </div>
  );
} 