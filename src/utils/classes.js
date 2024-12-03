// Class-specific spells and characteristics
export const CLASSES = {
  SWORD: {
    name: 'Sword Master',
    icon: '🗡️',
    description: 'Close-range warrior specializing in devastating melee attacks',
    spells: [
      {
        id: 'brutal_slash',
        name: 'Brutal Slash',
        type: 'hit',
        damage: 35,
        range: 1,
        pa: 4,
        usesPerTurn: 1,
        description: 'A powerful close-range attack that deals massive damage. Once per turn.',
        emoji: '⚔️'
      },
      {
        id: 'heroic_leap',
        name: 'Heroic Leap',
        type: 'teleport',
        range: 3,
        pa: 2,
        usesPerTurn: 2,
        description: 'Jump to a target location. Can be used twice per turn.',
        emoji: '💨'
      },
      {
        id: 'battle_fury',
        name: 'Battle Fury',
        type: 'boostPa',
        boost: 3,
        duration: 2,
        range: 0,
        pa: 2,
        usesPerTurn: 1,
        description: 'Gain +3 PA for 2 turns. Once per turn.',
        emoji: '🔥'
      },
      {
        id: 'iron_will',
        name: 'Iron Will',
        type: 'heal',
        healing: 25,
        range: 0,
        pa: 3,
        usesPerTurn: 1,
        cooldown: 3,
        description: 'Powerful heal with 3 turns cooldown.',
        emoji: '💚'
      }
    ]
  },
  ARCHER: {
    name: 'Master Archer',
    icon: '🏹',
    description: 'Long-range specialist with superior mobility and control',
    spells: [
      {
        id: 'precise_shot',
        name: 'Precise Shot',
        type: 'hit',
        damage: 25,
        range: 6,
        pa: 3,
        usesPerTurn: 2,
        description: 'A precise long-range shot. Can be used twice per turn.',
        emoji: '🎯'
      },
      {
        id: 'tactical_roll',
        name: 'Tactical Roll',
        type: 'boostPm',
        boost: 2,
        duration: 2,
        range: 0,
        pa: 2,
        usesPerTurn: 1,
        description: 'Gain +2 PM for 2 turns.',
        emoji: '🌪️'
      },
      {
        id: 'shadow_step',
        name: 'Shadow Step',
        type: 'teleport',
        range: 4,
        pa: 2,
        usesPerTurn: 1,
        cooldown: 2,
        description: 'Long range teleport with 2 turns cooldown.',
        emoji: '👻'
      },
      {
        id: 'rapid_shot',
        name: 'Rapid Shot',
        type: 'boostPa',
        boost: 2,
        duration: 1,
        range: 0,
        pa: 1,
        usesPerTurn: 1,
        description: 'Quick PA boost for immediate use.',
        emoji: '⚡'
      }
    ]
  }
};