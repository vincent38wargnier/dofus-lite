import React from 'react';
import ReactDOM from 'react-dom/client';
import { GameProvider } from './context/GameContext';
import App from './App';
import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </React.StrictMode>
);
