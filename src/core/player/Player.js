import { INITIAL_STATS } from '../../utils/constants';

class Player {
    constructor(id, characterClass) {
        this.id = id;
        this.class = characterClass;
        this.hp = INITIAL_STATS.hp;
        this.pa = INITIAL_STATS.pa;
        this.pm = INITIAL_STATS.pm;
        this.spells = [];
        this.activeBuffs = [];
    }

    // Movement methods
    canMove(distance) {
        return this.pm >= distance;
    }

    move(distance) {
        if (!this.canMove(distance)) return false;
        this.pm -= distance;
        return true;
    }

    // Spell methods
    canCastSpell(spell) {
        return this.pa >= spell.pa && 
               spell.cooldownLeft === 0 && 
               spell.usesLeft > 0;
    }

    castSpell(spell) {
        if (!this.canCastSpell(spell)) return false;
        
        this.pa -= spell.pa;
        spell.usesLeft--;
        spell.cooldownLeft = spell.cooldown;
        return true;
    }

    // Resource management
    resetTurnResources() {
        this.pa = INITIAL_STATS.pa;
        this.pm = INITIAL_STATS.pm;

        // Apply active buffs
        this.activeBuffs.forEach(buff => {
            if (buff.type === 'pa') this.pa += buff.value;
            if (buff.type === 'pm') this.pm += buff.value;
        });

        // Reset spell cooldowns and uses
        this.spells.forEach(spell => {
            if (spell.cooldownLeft > 0) spell.cooldownLeft--;
            spell.usesLeft = spell.usesPerTurn;
        });
    }

    // Buff management
    addBuff(buff) {
        this.activeBuffs.push(buff);
        if (buff.type === 'pa') this.pa += buff.value;
        if (buff.type === 'pm') this.pm += buff.value;
    }

    updateBuffs() {
        // Remove expired buffs
        const expiredBuffs = this.activeBuffs.filter(buff => buff.turnsLeft <= 1);
        this.activeBuffs = this.activeBuffs.filter(buff => buff.turnsLeft > 1);

        // Remove buff effects
        expiredBuffs.forEach(buff => {
            if (buff.type === 'pa') this.pa -= buff.value;
            if (buff.type === 'pm') this.pm -= buff.value;
        });

        // Decrease duration of remaining buffs
        this.activeBuffs.forEach(buff => buff.turnsLeft--);
    }

    // Health management
    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        return this.hp === 0;
    }

    heal(amount) {
        this.hp = Math.min(INITIAL_STATS.hp, this.hp + amount);
    }

    getPlayerState() {
        return {
            id: this.id,
            class: this.class,
            hp: this.hp,
            pa: this.pa,
            pm: this.pm,
            spells: this.spells.map(spell => ({...spell})),
            activeBuffs: this.activeBuffs.map(buff => ({...buff}))
        };
    }
}

export default Player;