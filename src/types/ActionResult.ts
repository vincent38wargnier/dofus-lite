interface ActionResult {
  success: boolean;
  type: 'MOVE' | 'SPELL' | 'END_TURN';
  changes: {
    affectedPlayers: string[];
    newPositions?: Record<string, Position>;
    damageDealt?: Record<string, number>;
    statusEffects?: StatusEffect[];
  };
  error?: string;
} 