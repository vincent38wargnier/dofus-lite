import { ACTION_TYPES } from '../../types/GameAction';

export class AIPlayerController {
  constructor(strategy) {
    this.strategy = strategy;
    this.playerId = null;
    this.playerActions = null;
    this.currentGameState = null;
  }

  initialize(playerId, playerActions) {
    this.playerId = playerId;
    this.playerActions = playerActions;
  }
  
  async onTurnStart() {
    try {
      const actions = this.playerActions.getValidActions();
      const nextAction = await this.strategy.decideNextAction(actions);
      
      let result;
      switch (nextAction.type) {
        case ACTION_TYPES.MOVE:
          result = await this.playerActions.move(nextAction.data.position);
          break;
        case ACTION_TYPES.SPELL:
          result = await this.playerActions.castSpell(
            nextAction.data.spellId, 
            nextAction.data.target
          );
          break;
        case ACTION_TYPES.END_TURN:
          result = await this.playerActions.endTurn();
          break;
        default:
          result = await this.playerActions.endTurn();
      }

      if (!result?.success) {
        console.error('AI action failed:', result?.error);
        await this.playerActions.endTurn();
      }
    } catch (error) {
      console.error('AI error:', error);
      await this.playerActions.endTurn();
    }
  }
  
  onGameStateUpdate(state) {
    this.currentGameState = state;
    this.strategy.updateGameState(state);
  }
} 