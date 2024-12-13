import React from 'react';
import BoardRenderer from '../Board/BoardRenderer';
import { AIDashboard } from '../Dashboard/AIDashboard';
import GameStatus from '../GameStatus/GameStatus';
import ActionBar from '../ActionBar/ActionBar';
import Header from '../UI/Header';
import Footer from '../UI/Footer';
import GameLog from '../UI/GameLog';

export function Game() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 flex p-4">
        {/* Left sidebar */}
        <div className="w-[300px] space-y-4">
          <GameStatus />
          <ActionBar />
        </div>

        {/* Center - Game board */}
        <div className="flex-1 mx-4">
          <BoardRenderer />
        </div>

        {/* Right sidebar - AI Controls */}
        <div className="w-[300px] flex flex-col">
          <AIDashboard />
          <GameLog />
        </div>
      </main>

      <Footer />
    </div>
  );
} 