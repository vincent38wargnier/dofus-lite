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
        description: 'A powerful close-range attack that deals massive damage',
        emoji: '⚔️'
      },
      {
        id: 'heroic_leap',
        name: 'Heroic Leap',
        type: 'teleport',
        range: 3,
        pa: 2,
        description: 'Jump to a target location, giving you tactical positioning',
        emoji: '💨'
      },
      {
        id: 'battle_fury',
        name: 'Battle Fury',
        type: 'boostPa',
        boost: 4,
        range: 0,
        pa: 1,
        description: 'Channel your inner fury to gain 4 PA for devastating combos',
        emoji: '🔥'
      },
      {
        id: 'second_wind',
        name: 'Second Wind',
        type: 'heal',
        healing: 30,
        range: 0,
        pa: 3,
        description: 'Regain a significant amount of health through sheer willpower',
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
        description: 'A powerful long-range shot that pierces through defenses',
        emoji: '🎯'
      },
      {
        id: 'tactical_roll',
        name: 'Tactical Roll',
        type: 'boostPm',
        boost: 3,
        range: 0,
        pa: 1,
        description: 'Roll away gaining 3 extra PM for perfect positioning',
        emoji: '🌪️'
      },
      {
        id: 'shadow_step',
        name: 'Shadow Step',
        type: 'teleport',
        range: 4,
        pa: 2,
        description: 'Instantly teleport to outmaneuver your opponent',
        emoji: '👻'
      },
      {
        id: 'restoration_arrow',
        name: 'Restoration Arrow',
        type: 'heal',
        healing: 20,
        range: 0,
        pa: 2,
        description: 'A quick self-healing technique using magical arrows',
        emoji: '💝'
      }
    ]
  }
};