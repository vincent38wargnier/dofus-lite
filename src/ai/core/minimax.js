import { isGameOver } from './utils';

export function minimax(node, depth, alpha, beta, isMaximizing, playerId, helpers) {
    const { generateActions, evaluate, applyAction } = helpers;

    // Terminal conditions
    if (depth === 0 || isGameOver(node.state)) {
        return {
            score: evaluate(node),
            move: null
        };
    }

    const possibleActions = generateActions(node, isMaximizing);
    
    if (possibleActions.length === 0) {
        return {
            score: evaluate(node),
            move: { type: 'end_turn' }
        };
    }

    let bestMove = possibleActions[0];
    
    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const action of possibleActions) {
            const childNode = applyAction(node, action, isMaximizing);
            const evaluation = minimax(childNode, depth - 1, alpha, beta, false, playerId, helpers).score;
            
            if (evaluation > maxEval) {
                maxEval = evaluation;
                bestMove = action;
            }
            
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return { score: maxEval, move: bestMove };
    } else {
        let minEval = Infinity;
        for (const action of possibleActions) {
            const childNode = applyAction(node, action, isMaximizing);
            const evaluation = minimax(childNode, depth - 1, alpha, beta, true, playerId, helpers).score;
            
            if (evaluation < minEval) {
                minEval = evaluation;
                bestMove = action;
            }
            
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return { score: minEval, move: bestMove };
    }
}