import { AIStrategy } from '../AIStrategy';
import { GameState } from '../../../types/GameState';
import { GameAction } from '../../../types/GameAction';

export class SimpleStrategy implements AIStrategy {
  private currentState: GameState;

  updateGameState(state: GameState): void {
    this.currentState = state;
  }

  async decideNextAction(availableActions: GameAction[]): Promise<GameAction> {
    // Simple strategy: randomly choose an available action
    if (availableActions.length === 0) {
      throw new Error('No available actions');
    }
    
    const randomIndex = Math.floor(Math.random() * availableActions.length);
    return availableActions[randomIndex];
  }
} 