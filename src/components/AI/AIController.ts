interface AIController {
  // Input methods
  updateGameState(state: GameState): void;
  notifyTurnStart(playerId: string): void;
  
  // Output methods
  getNextAction(): Promise<GameAction>;
  
  // Configuration
  setStrategy(strategy: AIStrategy): void;
  setDifficulty(level: number): void;
} 