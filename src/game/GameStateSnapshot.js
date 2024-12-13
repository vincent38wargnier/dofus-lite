import BoardEngine from '../components/Board/BoardEngine';
import Player from '../components/Player/Player';

export class GameStateSnapshot {
  constructor(gameState) {
    this.board = this.captureBoard(gameState.board);
    this.players = this.capturePlayers(gameState.players);
    this.turnInfo = this.captureTurnInfo(gameState);
    this.timestamp = Date.now();
    this.actionHistory = gameState.actionHistory || [];
    this.spellEffects = this.captureSpellEffects(gameState);
  }

  captureBoard(board) {
    return {
      cells: board.cells.map(row => row.map(cell => ({
        ...cell,
        occupant: cell.occupant ? cell.occupant.id : null,
        obstacle: cell.obstacle ? { ...cell.obstacle } : null
      }))),
      dimensions: { ...board.dimensions },
      obstacles: board.obstacles.map(obs => ({ ...obs }))
    };
  }

  capturePlayers(players) {
    return players.map(player => ({
      id: player.id,
      position: { ...player.position },
      stats: { ...player.stats },
      spells: player.spells.map(spell => ({
        id: spell.id,
        cooldown: spell.cooldown,
        currentCooldown: spell.currentCooldown
      })),
      statusEffects: player.statusEffects.map(effect => ({ ...effect })),
      actionPoints: player.actionPoints,
      movementPoints: player.movementPoints,
      health: player.health,
      maxHealth: player.maxHealth
    }));
  }

  captureTurnInfo(gameState) {
    return {
      turnNumber: gameState.turnNumber,
      currentPlayerId: gameState.currentPlayer?.id,
      phase: gameState.phase,
      remainingTime: gameState.remainingTime
    };
  }

  captureSpellEffects(gameState) {
    return (gameState.activeEffects || []).map(effect => ({
      type: effect.type,
      duration: effect.duration,
      source: effect.source.id,
      target: effect.target.id,
      value: effect.value
    }));
  }

  // Create a new game state from this snapshot
  restore() {
    const board = new BoardEngine();
    board.grid = this.restoreGrid(this.board.cells);
    
    const players = this.restorePlayers();
    const effects = this.restoreEffects();
    
    return {
      board,
      players,
      activeEffects: effects,
      ...this.turnInfo
    };
  }

  restoreGrid(cells) {
    return cells.map(row => row.map(cell => ({
      ...cell,
      occupant: this.players.find(p => p.id === cell.occupant),
      obstacle: cell.obstacle
    })));
  }

  restorePlayers() {
    return this.players.map(playerData => {
      const player = new Player(playerData.id, playerData.class);
      player.position = playerData.position;
      player.stats = playerData.stats;
      player.spells = playerData.spells;
      player.statusEffects = playerData.statusEffects;
      player.actionPoints = playerData.actionPoints;
      player.movementPoints = playerData.movementPoints;
      player.health = playerData.health;
      player.maxHealth = playerData.maxHealth;
      return player;
    });
  }

  restoreEffects() {
    return this.spellEffects.map(effect => ({
      ...effect,
      source: this.players.find(p => p.id === effect.source),
      target: this.players.find(p => p.id === effect.target)
    }));
  }
} 