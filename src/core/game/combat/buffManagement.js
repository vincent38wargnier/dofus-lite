export const updateBuffsAndCooldowns = (players, nextPlayer) => {
  return players.map(player => {
    // Reduce buff durations and remove expired buffs
    const updatedBuffs = player.activeBuffs.filter(buff => buff.turnsLeft > 1)
      .map(buff => ({ ...buff, turnsLeft: buff.turnsLeft - 1 }));
    
    // Remove expired buff effects
    const removedBuffs = player.activeBuffs.filter(buff => buff.turnsLeft <= 1);
    let updatedStats = { ...player };
    removedBuffs.forEach(buff => {
      updatedStats[buff.type] -= buff.value;
    });

    // Reduce cooldowns
    const updatedSpells = player.spells.map(spell => ({
      ...spell,
      cooldownLeft: Math.max(0, spell.cooldownLeft - 1),
      usesLeft: player.id === nextPlayer ? spell.usesPerTurn : spell.usesLeft
    }));

    return {
      ...updatedStats,
      activeBuffs: updatedBuffs,
      spells: updatedSpells
    };
  });
};