import Board from '../board/Board';
import { CHARACTER_CLASSES, INITIAL_STATS } from '../../utils/constants';

export function createInitialGameState() {
    // Create board
    const board = new Board();

    // Create initial players
    const players = [
        {
            id: 0,
            class: 'SWORD',
            position: { x: 0, y: 0 },
            hp: INITIAL_STATS.hp,
            pa: INITIAL_STATS.pa,
            pm: INITIAL_STATS.pm,
            spells: CHARACTER_CLASSES.SWORD.spells.map(spell => ({
                ...spell,
                usesLeft: spell.usesPerTurn,
                cooldown: 0
            }))
        },
        {
            id: 1,
            class: 'ARCHER',
            position: { x: 9, y: 9 },
            hp: INITIAL_STATS.hp,
            pa: INITIAL_STATS.pa,
            pm: INITIAL_STATS.pm,
            spells: CHARACTER_CLASSES.ARCHER.spells.map(spell => ({
                ...spell,
                usesLeft: spell.usesPerTurn,
                cooldown: 0
            }))
        }
    ];

    // Register players on board
    players.forEach(player => {
        board.registerPlayer(player.id, player.class, player.spells, player.position);
    });

    return {
        board,
        players,
        currentPlayer: 0,
        selectedSpell: null,
        winner: null,
        timeLeft: 60,
        path: [],
        damageAnimation: null
    };
}