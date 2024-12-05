import { CELL_TYPES } from '../../../utils/constants';

export const handleSpellCast = (state, spell, x, y, currentPlayer, targetPlayer) => {
  let updatedPlayers = [...state.players];
  let damageAnimation = null;

  // Check if spell has uses left and is not on cooldown
  const spellState = currentPlayer.spells.find(s => s.id === spell.id);
  if (spellState.usesLeft <= 0 || spellState.cooldownLeft > 0) {
    return null;
  }

  switch (spell.type) {
    case 'hit': {
      if (targetPlayer && targetPlayer.id !== currentPlayer.id) {
        const finalDamage = spell.damage;
        damageAnimation = {
          playerId: targetPlayer.id,
          position: targetPlayer.position,
          value: finalDamage,
          type: 'damage'
        };

        updatedPlayers = state.players.map(player =>
          player.id === targetPlayer.id
            ? { ...player, hp: Math.max(0, player.hp - finalDamage) }
            : player
        );
      }
      break;
    }

    case 'heal': {
      if (!targetPlayer || targetPlayer.id === currentPlayer.id) {
        damageAnimation = {
          playerId: currentPlayer.id,
          position: currentPlayer.position,
          value: spell.healing,
          type: 'heal'
        };

        updatedPlayers = state.players.map(player =>
          player.id === currentPlayer.id
            ? { ...player, hp: Math.min(100, player.hp + spell.healing) }
            : player
        );
      }
      break;
    }

    case 'boostPa':
    case 'boostPm': {
      const buffType = spell.type === 'boostPa' ? 'pa' : 'pm';
      damageAnimation = {
        playerId: currentPlayer.id,
        position: currentPlayer.position,
        value: spell.boost,
        type: spell.type
      };

      const newBuff = {
        spellId: spell.id,
        type: buffType,
        value: spell.boost,
        turnsLeft: spell.duration
      };

      updatedPlayers = state.players.map(player =>
        player.id === currentPlayer.id
          ? {
              ...player,
              activeBuffs: [...player.activeBuffs, newBuff],
              [buffType]: player[buffType] + spell.boost
            }
          : player
      );
      break;
    }

    case 'teleport': {
      if (state.board[y][x].type === CELL_TYPES.EMPTY && !targetPlayer) {
        updatedPlayers = state.players.map(player =>
          player.id === currentPlayer.id
            ? { ...player, position: { x, y } }
            : player
        );
      }
      break;
    }

    default:
      return null;
  }

  if (updatedPlayers === null) return null;

  // Update spell uses and cooldown
  updatedPlayers = updatedPlayers.map(player => 
    player.id === currentPlayer.id
      ? {
          ...player,
          spells: player.spells.map(s =>
            s.id === spell.id
              ? { 
                  ...s, 
                  usesLeft: s.usesLeft - 1,
                  cooldownLeft: s.cooldown || 0
                }
              : s
          )
        }
      : player
  );

  return { updatedPlayers, damageAnimation };
};