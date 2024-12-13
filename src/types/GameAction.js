export const ACTION_TYPES = {
  MOVE: 'MOVE',
  SPELL: 'SPELL',
  END_TURN: 'END_TURN'
};

export class GameAction {
  constructor(type, data) {
    this.type = type;
    this.data = data;
  }
} 