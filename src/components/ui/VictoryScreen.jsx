import React from 'react';
import { CLASSES } from '../../utils/classes';

const VictoryScreen = ({ winner }) => (
  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-white p-8 rounded-lg shadow-xl text-center">
      <div className="text-6xl mb-4">
        {CLASSES[winner.class].icon}
      </div>
      <h2 className="text-3xl font-bold mb-2">
        {CLASSES[winner.class].name} Wins!
      </h2>
      <p className="text-gray-600 mb-4">
        Victory achieved through superior tactics!
      </p>
      <button 
        onClick={() => window.location.reload()}
        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded transition-colors"
      >
        Play Again
      </button>
    </div>
  </div>
);

export default VictoryScreen;