import { calculateDistance, countNearbyCover, evaluateMobilityOptions } from './utils';
import { hasLineOfSight } from './pathfinding';

export function evaluatePosition(node, playerId) {
    const state = node.state;
    const myPlayer = state.players[playerId];
    const enemy = state.players[1 - playerId];

    // Base scores
    let score = 0;

    // 1. Health difference (most important)
    score += (myPlayer.hp - enemy.hp) * 10;

    // 2. Position evaluation
    const distance = calculateDistance(myPlayer.position, enemy.position);
    const spellRanges = myPlayer.spells
        .filter(s => s.type === 'hit')
        .map(s => s.range);
    const bestRange = spellRanges.length > 0 ? Math.min(...spellRanges) : 1;
    
    // Reward being at optimal range
    score -= Math.abs(distance - bestRange) * 5;

    // 3. Resource advantage
    score += myPlayer.pa * 3;
    score += myPlayer.pm * 2;

    // 4. Spell availability
    score += evaluateSpellAvailability(myPlayer.spells);

    // 5. Board control
    score += evaluateBoardControl(myPlayer.position);

    // 6. Strategic position
    score += evaluateStrategicPosition(myPlayer.position, enemy.position, state.board);

    return score;
}

function evaluateSpellAvailability(spells) {
    return spells.reduce((acc, spell) => {
        if (spell.cooldownLeft === 0 && spell.usesLeft > 0) {
            return acc + (spell.type === 'hit' ? 5 : 3);
        }
        return acc;
    }, 0);
}

function evaluateBoardControl(position) {
    // Center control is valuable
    const centerDistance = Math.abs(5 - position.x) + Math.abs(5 - position.y);
    return 10 - centerDistance;
}

function evaluateStrategicPosition(myPos, enemyPos, board) {
    let score = 0;

    // 1. Line of sight
    if (hasLineOfSight(myPos, enemyPos, board)) {
        score += 5;
    }

    // 2. Nearby cover
    const nearbyCover = countNearbyCover(myPos, board);
    score += nearbyCover * 2;

    // 3. Mobility options
    const mobilityScore = evaluateMobilityOptions(myPos, board);
    score += mobilityScore;

    return score;
}