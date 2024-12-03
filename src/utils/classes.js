// Class-specific spells and characteristics
export const CLASSES = {
  SWORD: {
    name: 'Sword',
    icon: '🗡️',
    description: 'Close-range warrior with powerful melee attacks',
    spells: [
      {
        id: 'sword_slash',
        name: 'Slash',
        damage: 30,
        range: 1,
        pa: 4,
        description: 'A powerful melee attack',
        emoji: '⚔️'
      },
      {
        id: 'charge',
        name: 'Charge',
        damage: 20,
        range: 2,
        pa: 3,
        description: 'Rush towards enemy and attack',
        emoji: '💨'
      },
      {
        id: 'armor_up',
        name: 'Shield Up',
        boost: { armor: 15 },
        range: 0,
        pa: 2,
        description: 'Increase defense temporarily',
        emoji: '🛡️'
      },
      {
        id: 'battle_heal',
        name: 'Second Wind',
        healing: 15,
        range: 0,
        pa: 3,
        description: 'Regain some health',
        emoji: '💚'
      }
    ]
  },
  ARCHER: {
    name: 'Archer',
    icon: '🏹',
    description: 'Long-range fighter specializing in distance attacks',
    spells: [
      {
        id: 'precise_shot',
        name: 'Precise Shot',
        damage: 20,
        range: 5,
        pa: 3,
        description: 'Long-range accurate arrow shot',
        emoji: '🎯'
      },
      {
        id: 'rain_of_arrows',
        name: 'Arrow Rain',
        damage: 15,
        range: 4,
        aoe: true, // Area of effect
        pa: 4,
        description: 'Attack multiple cells in an area',
        emoji: '☔'
      },
      {
        id: 'jump_back',
        name: 'Jump Back',
        boost: { movement: 2 },
        range: 0,
        pa: 2,
        description: 'Jump away from enemies',
        emoji: '↩️'
      },
      {
        id: 'healing_arrow',
        name: 'Healing Arrow',
        healing: 10,
        range: 0,
        pa: 3,
        description: 'Self-healing arrow',
        emoji: '💝'
      }
    ]
  }
};