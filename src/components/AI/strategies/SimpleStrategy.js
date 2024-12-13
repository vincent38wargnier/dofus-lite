import { AIStrategy } from '../AIStrategy';
import { ACTION_TYPES, GameAction } from '../../../types/GameAction';

export class SimpleStrategy extends AIStrategy {
  constructor() {
    super();
    this.currentState = null;
  }

  updateGameState(state) {
    this.currentState = state;
  }

  async decideNextAction(availableActions) {
    const { moves, spells } = availableActions;
    
    // First try to cast spells if possible
    if (spells && spells.length > 0) {
      const spell = spells[Math.floor(Math.random() * spells.length)];
      const target = spell.targets[Math.floor(Math.random() * spell.targets.length)];
      return new GameAction(ACTION_TYPES.SPELL, {
        spellId: spell.id,
        target: target
      });
    }
    
    // Otherwise try to move
    if (moves && moves.length > 0) {
      const position = moves[Math.floor(Math.random() * moves.length)];
      return new GameAction(ACTION_TYPES.MOVE, { position });
    }
    
    // If no actions available, end turn
    return new GameAction(ACTION_TYPES.END_TURN);
  }
} 