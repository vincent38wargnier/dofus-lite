import { CLASSES } from '../../constants/classes';
import { WARRIOR_SORTS } from '../../constants/sorts/warriorSorts';
import { MAGE_SORTS } from '../../constants/sorts/mageSorts';
import { ARCHER_SORTS } from '../../constants/sorts/archerSorts';
import EventEmitter from 'events';

// Map class types to their sorts
const CLASS_SORTS = {
  WARRIOR: WARRIOR_SORTS,
  MAGE: MAGE_SORTS,
  ARCHER: ARCHER_SORTS
};

const gameLogger = new EventEmitter();
export const combatEventEmitter = new EventEmitter();

class Player {
  constructor(name, classType) {
    this.name = name;
    this.class = classType;
    const classInfo = CLASSES[classType];
    
    // Load stats from characteristics
    this.hp = classInfo.characteristics.baseHP;
    this.maxHp = classInfo.characteristics.baseHP;
    this.basePA = classInfo.characteristics.basePA;
    this.basePM = classInfo.characteristics.basePM;
    this.pa = this.basePA;
    this.pm = this.basePM;
    
    // Load sorts from constants
    this.sorts = CLASS_SORTS[classType];
    
    this.statusEffects = [];
    this.sortCooldowns = {};
    
    // Initialize all cooldowns to 0
    this.resetAllCooldowns();
    
    // Add position tracking
    this.position = { x: 0, y: 0 };
    this.screenPosition = { x: 0, y: 0 };
    
    // Track previous values for change detection
    this._previousValues = {
      hp: this.hp,
      pa: this.pa,
      pm: this.pm
    };
    
    // Log player creation
    gameLogger.emit('log', `${name} (${classType}) enters the battle!`);
  }

  // Simple method to show stat changes
  showStatChange(type, value) {
    if (!this.screenPosition.x || !this.screenPosition.y) return;
    
    combatEventEmitter.emit('combatEffect', {
      type,
      value,
      position: this.screenPosition
    });
  }

  // Update position (called by the board)
  updatePosition(x, y, screenX, screenY) {
    this.position = { x, y };
    if (screenX !== undefined && screenY !== undefined) {
      this.screenPosition = { x: screenX, y: screenY };
    }
  }

  // Health Points Management
  getHP() {
    return this.hp;
  }

  reduceHP(amount) {
    this.hp = Math.max(0, this.hp - amount);
    gameLogger.emit('log', `${this.name} takes ${amount} damage. HP: ${this.hp}/${this.maxHp}`);
    this.showStatChange('damage', -amount);
    return this.hp;
  }

  increaseHP(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    gameLogger.emit('log', `${this.name} heals for ${amount}. HP: ${this.hp}/${this.maxHp}`);
    this.showStatChange('heal', amount);
    return this.hp;
  }

  // Action Points Management
  getPA() {
    // Calculate bonus PA from effects
    const bonusPA = this.statusEffects.reduce((total, effect) => {
      if (effect.pa_bonus) return total + effect.pa_bonus;
      if (effect.pa_reduction) return total - effect.pa_reduction;
      return total;
    }, 0);
    return this.pa + bonusPA;
  }

  reducePA(amount) {
    this.pa = Math.max(0, this.pa - amount);
    this.showStatChange('pa', -amount);
    return this.pa;
  }

  resetPA() {
    const oldPA = this.pa;
    this.pa = this.basePA;
    if (this.pa !== oldPA) {
      this.showStatChange('pa', this.pa - oldPA);
    }
    return this.getPA();
  }

  // Movement Points Management
  getPM() {
    // Calculate bonus PM from effects
    const bonusPM = this.statusEffects.reduce((total, effect) => {
      if (effect.pm_bonus) return total + effect.pm_bonus;
      if (effect.pm_reduction) return total - effect.pm_reduction;
      return total;
    }, 0);
    return this.pm + bonusPM;
  }

  reducePM(amount) {
    this.pm = Math.max(0, this.pm - amount);
    this.showStatChange('pm', -amount);
    return this.pm;
  }

  resetPM() {
    const oldPM = this.pm;
    this.pm = this.basePM;
    if (this.pm !== oldPM) {
      this.showStatChange('pm', this.pm - oldPM);
    }
    return this.getPM();
  }

  // Status Effects Management
  addStatusEffect(effect) {
    if (!effect.duration) effect.duration = 1;
    this.statusEffects.push(effect);
    gameLogger.emit('log', `${this.name} gains effect: ${effect.name}`);
    
    // Show PA/PM changes from effects
    if (effect.pa_bonus || effect.pa_reduction) {
      const paChange = (effect.pa_bonus || 0) - (effect.pa_reduction || 0);
      this.showStatChange('pa', paChange);
    }
    if (effect.pm_bonus || effect.pm_reduction) {
      const pmChange = (effect.pm_bonus || 0) - (effect.pm_reduction || 0);
      this.showStatChange('pm', pmChange);
    }
  }

  removeStatusEffect(effectId) {
    this.statusEffects = this.statusEffects.filter(effect => effect.id !== effectId);
  }

  getStatusEffects() {
    return this.statusEffects;
  }

  clearStatusEffects() {
    this.statusEffects = [];
  }

  // Turn Management
  startTurn() {
    this.resetPA();
    this.resetPM();
    this.decrementCooldowns();
    this.processStatusEffects();
    
    // Add turn start logging
    gameLogger.emit('log', `=== ${this.name}'s Turn Starts ===`);
    gameLogger.emit('log', `PA: ${this.getPA()}, PM: ${this.getPM()}`);
  }

  endTurn() {
    this.processStatusEffects();
    
    // Add turn end logging
    gameLogger.emit('log', `=== ${this.name}'s Turn Ends ===`);
  }

  processStatusEffects() {
    const remainingEffects = [];
    this.statusEffects.forEach(effect => {
      effect.duration--;
      if (effect.duration > 0) {
        remainingEffects.push(effect);
      } else {
        // Log when effects expire
        gameLogger.emit('log', `${this.name}'s effect ${effect.name} has expired`);
      }
    });
    this.statusEffects = remainingEffects;
  }

  // Utility Methods
  isAlive() {
    return this.hp > 0;
  }

  canUseSort(sortKey) {
    const sort = this.sorts[sortKey];
    if (!sort) return false;
    
    const canUse = this.getSortCooldown(sortKey) === 0 && this.getPA() >= sort.cost;
    
    if (!canUse) {
      if (this.getSortCooldown(sortKey) > 0) {
        gameLogger.emit('log', `${this.name} cannot use ${sort.name} - On cooldown: ${this.getSortCooldown(sortKey)} turns`);
      } else if (this.getPA() < sort.cost) {
        gameLogger.emit('log', `${this.name} cannot use ${sort.name} - Not enough PA`);
      }
    }
    
    return canUse;
  }

  // Sort (Spell) Management
  getSorts() {
    return this.sorts;
  }

  getSortCooldown(sortKey) {
    return this.sortCooldowns[sortKey] || 0;
  }

  setSortCooldown(sortKey, cooldown) {
    if (this.sorts[sortKey] && this.sorts[sortKey].cooldown > 0) {
      this.sortCooldowns[sortKey] = cooldown;
    }
  }

  resetAllCooldowns() {
    Object.keys(this.sorts).forEach(sortKey => {
      this.sortCooldowns[sortKey] = 0;
    });
  }

  decrementCooldowns() {
    Object.keys(this.sortCooldowns).forEach(sortKey => {
      if (this.sortCooldowns[sortKey] > 0) {
        this.sortCooldowns[sortKey]--;
      }
    });
  }
}

export { gameLogger };
export default Player;