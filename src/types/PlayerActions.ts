interface PlayerActions {
  // Movement
  move(position: Position): Promise<ActionResult>;
  
  // Combat
  castSpell(spellId: string, targetPosition: Position): Promise<ActionResult>;
  
  // Turn Management
  endTurn(): Promise<void>;
  
  // Information Gathering
  getAvailableMoves(): Position[];
  getSpellTargets(spellId: string): Position[];
  getValidActions(): GameAction[];
} 