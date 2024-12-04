import { minimax } from './core/minimax';
import { generatePossibleActions } from './core/actionGenerator';
import { evaluatePosition } from './core/evaluator';
import { applyAction, cloneGameState } from './core/stateManager';

export class SwordMasterAI {
    constructor() {
        this.initialized = false;
        this.gameState = null;
        this.myId = null;
        this.MAX_DEPTH = 4;
        this.INFINITY = 1000000;
    }

    initialize(gameState, playerId) {
        console.log('Initializing AI with gameState:', gameState);
        this.gameState = gameState;
        this.myId = playerId;
        this.initialized = true;
    }

    async makeDecision() {
        if (!this.initialized) throw new Error('AI not initialized');
        
        console.log('AI starting deep analysis...');
        
        // Create initial node
        const initialNode = {
            state: cloneGameState(this.gameState),
            remainingPa: this.gameState.players[this.myId].pa,
            remainingPm: this.gameState.players[this.myId].pm,
            depth: 0,
            parent: null,
            action: null
        };

        try {
            // Find best sequence using minimax
            const result = minimax(
                initialNode,
                this.MAX_DEPTH,
                -this.INFINITY,
                this.INFINITY,
                true,
                this.myId,
                {
                    generateActions: (node, isMax) => generatePossibleActions(node, isMax, this.myId),
                    evaluate: (node) => evaluatePosition(node, this.myId),
                    applyAction: (node, action, isMax) => applyAction(node, action, isMax, this.myId)
                }
            );

            console.log('Minimax result:', result);

            if (!result || !result.move) {
                console.log('No valid move found, ending turn');
                return { type: 'end_turn' };
            }

            return result.move;

        } catch (error) {
            console.error('Error in makeDecision:', error);
            return { type: 'end_turn' };
        }
    }
}