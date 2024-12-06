export const CLASSES = {
  WARRIOR: {
    name: 'Warrior',
    emoji: '⚔️',
    description: 'A close combat fighter with high defense and HP',
    characteristics: {
      baseHP: 120,
      basePA: 6,
      basePM: 3,
      defense: 20,
      resistance: 15,
    }
  },
  MAGE: {
    name: 'Mage',
    emoji: '🧙',
    description: 'A powerful spellcaster with high damage but low HP',
    characteristics: {
      baseHP: 80,
      basePA: 7,
      basePM: 3,
      defense: 10,
      resistance: 20,
    }
  },
  ARCHER: {
    name: 'Archer',
    emoji: '🏹',
    description: 'A ranged fighter with high mobility',
    characteristics: {
      baseHP: 90,
      basePA: 6,
      basePM: 4,
      defense: 12,
      resistance: 12,
    }
  }
};