import { CLASSES } from '../../constants/classes';
import { WARRIOR_SORTS } from '../../constants/sorts/warriorSorts';
import { MAGE_SORTS } from '../../constants/sorts/mageSorts';
import { ARCHER_SORTS } from '../../constants/sorts/archerSorts';

// Map class types to their sorts
const CLASS_SORTS = {
  WARRIOR: WARRIOR_SORTS,
  MAGE: MAGE_SORTS,
  ARCHER: ARCHER_SORTS
};

class Player {
  constructor(name, classType) {
    this.name = name;
    this.class = classType;
    const classInfo = CLASSES[classType];
    
    // Load stats from characteristics
    this.hp = classInfo.characteristics.baseHP;
    this.maxHp = classInfo.characteristics.baseHP;
    this.pa = classInfo.characteristics.basePA;
    this.pm = classInfo.characteristics.basePM;
    
    // Load sorts from constants
    this.sorts = CLASS_SORTS[classType];
    
    this.statusEffects = [];
    this.sortCooldowns = {};
    
    // Initialize all cooldowns to 0
    this.resetAllCooldowns();
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
    this.pa = CLASSES[this.class].characteristics.basePA;
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
    this.pm = CLASSES[this.class].characteristics.basePM;
    return this.pm;
  }

  // Sort (Spell) Management
  getSorts() {
    return this.sorts;
  }

  getSortCooldown(sortKey) {
    return this.sortCooldowns[sortKey] || 0;
  }

  setSortCooldown(sortKey, cooldown) {
    // Only set cooldown if the spell has one defined
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
    this.processStatusEffects();
  }

  endTurn() {
    this.processStatusEffects();
  }

  processStatusEffects() {
    this.statusEffects = this.statusEffects.filter(effect => {
      effect.duration--;
      if (effect.duration > 0) {
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
      case 'BUFF':
        if (effect.pa_bonus) this.pa += effect.pa_bonus;
        if (effect.pm_bonus) this.pm += effect.pm_bonus;
        break;
      case 'DEBUFF':
        if (effect.pa_reduction) this.pa = Math.max(0, this.pa - effect.pa_reduction);
        if (effect.pm_reduction) this.pm = Math.max(0, this.pm - effect.pm_reduction);
        break;
    }
  }

  // Utility Methods
  isAlive() {
    return this.hp > 0;
  }

  canUseSort(sortKey) {
    const sort = this.sorts[sortKey];
    if (!sort) return false;
    
    return (
      this.getSortCooldown(sortKey) === 0 && // Sort is not on cooldown
      this.getPA() >= sort.cost // Player has enough PA
    );
  }
}

export default Player;