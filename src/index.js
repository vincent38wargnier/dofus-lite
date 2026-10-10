import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App';
import { RetroAssetsProvider } from './ui/RetroAssets';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RetroAssetsProvider><App /></RetroAssetsProvider>
  </React.StrictMode>,
);
