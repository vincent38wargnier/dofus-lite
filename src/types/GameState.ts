interface GameState {
  board: {
    cells: Cell[][];
    obstacles: Obstacle[];
    dimensions: {width: number, height: number};
  };
  players: {
    [playerId: string]: {
      position: Position;
      stats: PlayerStats;
      spells: Spell[];
      actionPoints: number;
      movementPoints: number;
    };
  };
  currentTurn: {
    playerId: string;
    phase: 'MOVEMENT' | 'ACTION' | 'END';
    remainingTime: number;
  };
} 