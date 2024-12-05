import { generateActions } from '../core/actionGenerator';
import { evaluateAction } from '../core/actionEvaluator';

export class AIController {
    constructor(playerId, gameState) {
        this.playerId = playerId;
        this.gameState = gameState;
    }

    async makeMove() {
        // Get valid actions
        const validActions = generateActions(this.gameState, this.playerId);
        
        if (validActions.length === 0) {
            return { type: 'end_turn' };
        }

        // Evaluate and choose best action
        const scoredActions = validActions.map(action => ({
            action,
            score: evaluateAction(action, this.gameState, this.playerId)
        }));

        const bestAction = scoredActions.reduce((best, current) => 
            current.score > best.score ? current : best,
            scoredActions[0]  // Initialize with first action to avoid undefined
        ).action;

        return bestAction;
    }
}