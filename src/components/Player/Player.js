import { MAX_HP, MAX_PA, MAX_PM, CLASSES } from '../../utils/constants';

class Player {
  constructor(name, classType) {
    this.name = name;
    this.class = classType;
    this.hp = CLASSES[classType].baseHP;
    this.maxHp = CLASSES[classType].baseHP;
    this.pa = CLASSES[classType].basePA;
    this.pm = CLASSES[classType].basePM;
    this.sorts = CLASSES[classType].sorts;
    this.statusEffects = [];
    this.sortCooldowns = {};
    
    // Initialize cooldowns for all sorts
    this.sorts.forEach(sort => {
      this.sortCooldowns[sort] = 0;
    });
  }

  // Health Points Management
  getHP() {
    return this.hp;
  }

  reduceHP(amount) {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp;
  }

  increaseHP(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp;
  }

  // Action Points Management
  getPA() {
    return this.pa;
  }

  reducePA(amount) {
    this.pa = Math.max(0, this.pa - amount);
    return this.pa;
  }

  resetPA() {
    this.pa = CLASSES[this.class].basePA;
    return this.pa;
  }

  // Movement Points Management
  getPM() {
    return this.pm;
  }

  reducePM(amount) {
    this.pm = Math.max(0, this.pm - amount);
    return this.pm;
  }

  resetPM() {
    this.pm = CLASSES[this.class].basePM;
    return this.pm;
  }

  // Sort (Spell) Management
  getSorts() {
    return this.sorts;
  }

  getSortCooldown(sort) {
    return this.sortCooldowns[sort] || 0;
  }

  updateSortCooldown(sort, cooldown) {
    this.sortCooldowns[sort] = cooldown;
  }

  decrementCooldowns() {
    Object.keys(this.sortCooldowns).forEach(sort => {
      if (this.sortCooldowns[sort] > 0) {
        this.sortCooldowns[sort]--;
      }
    });
  }

  // Status Effects Management
  addStatusEffect(effect) {
    this.statusEffects.push(effect);
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
    // Process status effects at turn start
    this.processStatusEffects();
  }

  endTurn() {
    // Process status effects at turn end
    this.processStatusEffects();
  }

  processStatusEffects() {
    // Remove expired effects and apply ongoing effects
    this.statusEffects = this.statusEffects.filter(effect => {
      effect.duration--;
      if (effect.duration > 0) {
        // Apply effect
        this.applyStatusEffect(effect);
        return true;
      }
      return false;
    });
  }

  applyStatusEffect(effect) {
    switch (effect.type) {
      case 'DAMAGE_OVER_TIME':
        this.reduceHP(effect.value);
        break;
      case 'HEAL_OVER_TIME':
        this.increaseHP(effect.value);
        break;
      // Add other effect types as needed
    }
  }

  // Utility Methods
  isAlive() {
    return this.hp > 0;
  }

  canUseSort(sort) {
    return this.sortCooldowns[sort] === 0 && this.pa >= sort.cost;
  }
}

export default Player;
