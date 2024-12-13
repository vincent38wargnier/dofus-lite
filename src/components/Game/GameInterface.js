import { AIDashboard } from '../Dashboard/AIDashboard';

export function GameInterface() {
  return (
    <div className="game-interface">
      <div className="game-board">
        {/* Your existing board component */}
      </div>
      <div className="game-controls">
        <AIDashboard />
        {/* Other controls */}
      </div>
    </div>
  );
} 