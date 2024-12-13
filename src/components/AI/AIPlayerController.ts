import { GameState } from '../../types/GameState';
import { PlayerActions } from '../../types/PlayerActions';
import { AIStrategy } from './AIStrategy';

export class AIPlayerController {
  private playerId: string;
  private playerActions: PlayerActions;
  private strategy: AIStrategy;
  private currentGameState: GameState;

  constructor(strategy: AIStrategy) {
    this.strategy = strategy;
  }

  initialize(playerId: string, playerActions: PlayerActions): void {
    this.playerId = playerId;
    this.playerActions = playerActions;
  }
  
  async onTurnStart(): Promise<void> {
    const actions = this.playerActions.getValidActions();
    const nextAction = await this.strategy.decideNextAction(actions);
    
    if (nextAction.type === 'MOVE') {
      await this.playerActions.move(nextAction.position);
    } else if (nextAction.type === 'SPELL') {
      await this.playerActions.castSpell(nextAction.spellId, nextAction.target);
    }
    
    await this.playerActions.endTurn();
  }
  
  onGameStateUpdate(state: GameState): void {
    this.currentGameState = state;
    this.strategy.updateGameState(state);
  }
} 