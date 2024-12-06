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
    this.basePA = classInfo.characteristics.basePA;  // Store base PA
    this.basePM = classInfo.characteristics.basePM;  // Store base PM
    this.pa = this.basePA;  // Current PA
    this.pm = this.basePM;  // Current PM
    
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
    return this.pa;
  }

  resetPA() {
    this.pa = this.basePA;
    return this.getPA();  // Return total including effects
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
    return this.pm;
  }

  resetPM() {
    this.pm = this.basePM;
    return this.getPM();  // Return total including effects
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
    if (!effect.duration) effect.duration = 1;
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
    const remainingEffects = [];
    this.statusEffects.forEach(effect => {
      effect.duration--;
      if (effect.duration > 0) {
        remainingEffects.push(effect);
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
    
    return (
      this.getSortCooldown(sortKey) === 0 && // Sort is not on cooldown
      this.getPA() >= sort.cost // Player has enough PA
    );
  }
}

export default Player;