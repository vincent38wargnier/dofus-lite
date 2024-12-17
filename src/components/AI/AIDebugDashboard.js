import React, { useState, useEffect } from 'react';
import AIEngine from '../../ai/AIEngine';

const AIDebugDashboard = ({ gameState, actions, selectedUnit }) => {
  const [aiEngine] = useState(() => {
    const engine = new AIEngine();
    engine.initialize(gameState, actions);
    return engine;
  });

  // Add effect to update aiEngine when actions or gameState change
  useEffect(() => {
    aiEngine.initialize(gameState, actions);
  }, [gameState, actions, aiEngine]);

  const [analysis, setAnalysis] = useState(null);
  const [targetX, setTargetX] = useState('');
  const [targetY, setTargetY] = useState('');
  const [selectedSpell, setSelectedSpell] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('none');

  // Effect to trigger hover when coordinates change
  React.useEffect(() => {
    if (targetX !== '' && targetY !== '') {
      const x = parseInt(targetX);
      const y = parseInt(targetY);
      if (!isNaN(x) && !isNaN(y) && gameState.board.isWithinBounds(x, y)) {
        // Trigger the hover effect
        const cell = gameState.board.getCell(x, y);
        if (cell) {
          actions.handleCellHover?.(x, y);
        }
      }
    } else {
      // Clear hover effect when coordinates are empty
      actions.handleCellLeave?.();
    }
  }, [targetX, targetY, gameState.board, actions]);

  const handleTargetChange = (coord, value) => {
    // Update the coordinate
    if (coord === 'x') {
      setTargetX(value);
    } else {
      setTargetY(value);
    }

    // If both coordinates are valid, trigger hover effect
    const newX = coord === 'x' ? value : targetX;
    const newY = coord === 'y' ? value : targetY;
    
    if (newX !== '' && newY !== '') {
      const x = parseInt(newX);
      const y = parseInt(newY);
      if (!isNaN(x) && !isNaN(y) && gameState.board.isWithinBounds(x, y)) {
        actions.handleCellHover?.(x, y);
      }
    } else {
      actions.handleCellLeave?.();
    }
  };

  // Analysis Functions
  const handleAnalyzeState = () => {
    aiEngine.analyzeGameState();
    const gameAnalysis = aiEngine.analyzeGameState();
    setAnalysis(gameAnalysis);
    console.log('Game Analysis:', gameAnalysis);
  };

  const handleFindEnemies = () => {
    aiEngine.findEnemies();
    console.log('Found Enemies:', aiEngine.findEnemies());
  };

  const handleGetMoves = () => {
    aiEngine.getAvailableMoves();
    console.log('Available Moves:', aiEngine.getAvailableMoves());
  };

  const handleGetSpells = () => {
    aiEngine.getAvailableSpells();
    console.log('Available Spells:', aiEngine.getAvailableSpells());
  };

  // Action Functions
  const handleCellClick = () => {
    if (!targetX || !targetY) {
      console.error('Please enter target coordinates');
      return;
    }
    const x = parseInt(targetX);
    const y = parseInt(targetY);
    if (!gameState.board.isWithinBounds(x, y)) {
      console.error('Target coordinates out of bounds');
      return;
    }

    // Use the cell click handler directly
    actions.handleCellClick?.(x, y);
  };

  const handleSelectSpell = () => {
    if (!selectedSpell) {
      console.error('Please select a spell');
      return;
    }
    const currentPlayer = gameState.currentPlayer;
    const spell = currentPlayer.getSorts()[selectedSpell];
    if (!currentPlayer.canUseSort(selectedSpell)) {
      console.error('Spell is not usable (cooldown or not enough PA)');
      return;
    }
    actions.selectAction({
      type: 'CAST_SORT',
      sort: {
        ...spell,
        key: selectedSpell
      }
    });
  };

  const handleSpellChange = (spellKey) => {
    setSelectedSpell(spellKey);
    // Clear any previous spell selection
    actions.selectAction(null);
  };

  const handleEndTurn = () => {
    actions.endTurn();
  };

  // Get available spells for the select input
  const getAvailableSpells = () => {
    if (!gameState.currentPlayer) return [];
    return Object.entries(gameState.currentPlayer.getSorts())
      .map(([key, spell]) => ({
        key,
        name: spell.name
      }));
  };

  const strategies = [
    { id: 'none', name: 'No Strategy' },
    { id: 'simpleMovement', name: 'Simple Movement' },
    { id: 'chessLike', name: 'Chess-like Combat' }
  ];

  const handleStrategyChange = (e) => {
    const newStrategy = e.target.value;
    setSelectedStrategy(newStrategy);
  };

  const handleExecuteStrategy = async () => {
    if (selectedStrategy === 'none' || !selectedUnit) {
      console.log('Please select a strategy and unit');
      return;
    }

    await aiEngine.executeStrategy(gameState, selectedUnit, selectedStrategy);
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
      <h3 className="text-white text-lg font-bold mb-4">AI Debug Controls</h3>
      
      {/* Analysis Controls */}
      <div className="mb-6">
        <h4 className="text-white font-bold mb-2">Analysis</h4>
        <div className="grid grid-cols-2 gap-2">
          <button className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600" onClick={handleAnalyzeState}>
            Analyze State
          </button>
          <button className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600" onClick={handleFindEnemies}>
            Find Enemies
          </button>
          <button className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600" onClick={handleGetMoves}>
            Get Moves
          </button>
          <button className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600" onClick={handleGetSpells}>
            Get Spells
          </button>
        </div>
      </div>

      {/* Coordinate Inputs */}
      <div className="mb-4">
        <h4 className="text-white font-bold mb-2">Target Coordinates</h4>
        <div className="flex space-x-2">
          <input
            type="number"
            value={targetX}
            onChange={(e) => handleTargetChange('x', e.target.value)}
            placeholder="X"
            className="w-20 px-2 py-1 rounded"
          />
          <input
            type="number"
            value={targetY}
            onChange={(e) => handleTargetChange('y', e.target.value)}
            placeholder="Y"
            className="w-20 px-2 py-1 rounded"
          />
          <button 
            className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
            onClick={handleCellClick}
          >
            Click Cell
          </button>
        </div>
      </div>

      {/* Spell Selection */}
      <div className="mb-4">
        <h4 className="text-white font-bold mb-2">Spell Selection</h4>
        <select
          value={selectedSpell}
          onChange={(e) => handleSpellChange(e.target.value)}
          className="w-full px-2 py-1 rounded"
        >
          <option value="">Select a spell</option>
          {getAvailableSpells().map(spell => (
            <option key={spell.key} value={spell.key}>
              {spell.name}
            </option>
          ))}
        </select>
      </div>

      {/* Action Controls */}
      <div className="mb-6">
        <h4 className="text-white font-bold mb-2">Actions</h4>
        <div className="grid grid-cols-2 gap-2">
          <button className="bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600" onClick={handleSelectSpell}>
            Select Spell
          </button>
          <button className="bg-yellow-500 text-white px-3 py-2 rounded hover:bg-yellow-600" onClick={handleEndTurn}>
            End Turn
          </button>
        </div>
      </div>

      {/* Full AI Turn */}
      <div>
        <button
          className="w-full bg-purple-500 text-white px-3 py-2 rounded hover:bg-purple-600"
          onClick={() => aiEngine.playTurn()}
        >
          Full AI Turn
        </button>
      </div>

      {/* Analysis Display */}
      {analysis && (
        <div className="mt-4 text-white">
          <h4 className="font-bold">Last Analysis:</h4>
          <pre className="bg-gray-700 p-2 rounded mt-2 text-sm overflow-auto max-h-40">
            {JSON.stringify(analysis, null, 2)}
          </pre>
        </div>
      )}

      <div className="mb-4">
        <label className="block mb-2">Strategy:</label>
        <select 
          value={selectedStrategy}
          onChange={handleStrategyChange}
          className="w-full p-2 bg-gray-700 rounded"
        >
          {strategies.map(strategy => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block mb-2">Selected Unit:</label>
        <div className="bg-gray-700 p-2 rounded">
          {selectedUnit ? (
            `${selectedUnit.type} at (${selectedUnit.position.x}, ${selectedUnit.position.y})`
          ) : (
            'No unit selected'
          )}
        </div>
      </div>

      <button
        onClick={handleExecuteStrategy}
        disabled={selectedStrategy === 'none' || !selectedUnit}
        className={`w-full p-2 rounded ${
          selectedStrategy === 'none' || !selectedUnit
            ? 'bg-gray-600 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        Execute Strategy
      </button>

      {/* Optional: Add strategy description */}
      {selectedStrategy !== 'none' && (
        <div className="mt-4 p-2 bg-gray-700 rounded">
          <h3 className="font-bold mb-2">Strategy Description:</h3>
          <p>
            {selectedStrategy === 'simpleMovement' 
              ? 'Moves unit towards the nearest enemy until out of movement points.'
              : 'Advanced chess-like combat strategy with tactical evaluation.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default AIDebugDashboard; 