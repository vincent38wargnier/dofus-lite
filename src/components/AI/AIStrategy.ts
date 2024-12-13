import { GameState } from '../../types/GameState';
import { GameAction } from '../../types/GameAction';

export interface AIStrategy {
  updateGameState(state: GameState): void;
  decideNextAction(availableActions: GameAction[]): Promise<GameAction>;
} 