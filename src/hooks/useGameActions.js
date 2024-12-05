import { useCallback } from 'react';
import { INITIAL_STATS } from '../utils/constants';

export function useGameActions(gameState, setGameState, addLog) {
    const handlePlayerAction = useCallback((playerId, action) => {
        if (!gameState.board) return;

        const player = gameState.players[playerId];
        if (!player) return;

        switch (action.type) {
            case 'move': {
                const validation = gameState.board.validateMove(playerId, action.x, action.y);
                
                if (validation.valid && validation.pmCost <= player.pm) {
                    const result = gameState.board.executeMove(playerId, action.x, action.y);
                    if (result.success) {
                        setGameState(prev => ({
                            ...prev,
                            players: prev.players.map(p => 
                                p.id === playerId 
                                    ? {
                                        ...p,
                                        position: { x: action.x, y: action.y },
                                        pm: p.pm - validation.pmCost
                                    }
                                    : p
                            )
                        }));
                        addLog(`Player ${playerId + 1} moved to (${action.x}, ${action.y})`);
                    }
                } else {
                    addLog(`Invalid move or insufficient PM`, 'error');
                }
                break;
            }
            case 'cast': {
                const spell = player.spells.find(s => s.id === action.spell);
                if (!spell) {
                    addLog('Spell not found', 'error');
                    return;
                }

                if (spell.pa > player.pa) {
                    addLog('Not enough PA to cast spell', 'error');
                    return;
                }

                if (spell.usesLeft <= 0) {
                    addLog('No uses left for this spell', 'error');
                    return;
                }

                if (spell.cooldown > 0) {
                    addLog('Spell is on cooldown', 'error');
                    return;
                }

                const validation = gameState.board.validateSpellCast(
                    playerId, 
                    action.spell,
                    action.x, 
                    action.y
                );

                if (validation.valid) {
                    const result = gameState.board.executeSpell(playerId, action.spell, action.x, action.y);
                    if (result.success) {
                        // Update player stats
                        setGameState(prev => ({
                            ...prev,
                            players: prev.players.map(p => {
                                if (p.id === playerId) {
                                    // Update caster
                                    return {
                                        ...p,
                                        pa: p.pa - spell.pa,
                                        spells: p.spells.map(s => 
                                            s.id === spell.id
                                                ? {
                                                    ...s,
                                                    usesLeft: s.usesLeft - 1,
                                                    cooldown: s.cooldown
                                                }
                                                : s
                                        )
                                    };
                                }
                                
                                // Update target if it's a player
                                const isTarget = p.position.x === action.x && p.position.y === action.y;
                                if (isTarget) {
                                    if (spell.type === 'hit') {
                                        return {
                                            ...p,
                                            hp: Math.max(0, p.hp - spell.damage)
                                        };
                                    } else if (spell.type === 'heal') {
                                        return {
                                            ...p,
                                            hp: Math.min(INITIAL_STATS.hp, p.hp + spell.healing)
                                        };
                                    }
                                }
                                return p;
                            }),
                            selectedSpell: null,
                            damageAnimation: {
                                position: { x: action.x, y: action.y },
                                type: spell.type,
                                value: spell.type === 'hit' ? spell.damage : spell.healing
                            }
                        }));

                        addLog(`Player ${playerId + 1} cast ${spell.name}`);

                        // Clear damage animation after delay
                        setTimeout(() => {
                            setGameState(prev => ({
                                ...prev,
                                damageAnimation: null
                            }));
                        }, 1000);
                    }
                } else {
                    addLog(validation.message || 'Invalid spell cast', 'error');
                }
                break;
            }
            default: {
                addLog('Unknown action type', 'error');
                break;
            }
        }
    }, [gameState.board, gameState.players, setGameState, addLog]);

    const handleSpellSelect = useCallback((spell) => {
        setGameState(prev => ({
            ...prev,
            selectedSpell: prev.selectedSpell?.id === spell?.id ? null : spell
        }));
    }, [setGameState]);

    return {
        handlePlayerAction,
        handleSpellSelect
    };
}