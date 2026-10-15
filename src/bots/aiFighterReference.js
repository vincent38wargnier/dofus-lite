import { spellsOf } from '../engine/engine';
import { CLASSES, getSummon } from '../engine/classes';
import { getMonster } from '../engine/monsters';
import { critDivisor, effectiveStat, statBuffTotal } from '../engine/formulas';
import { describeSpellEffect, spellDescription } from '../ui/spellDetailModel';

const SPELL_KEYS = ['key', 'id', 'name', 'grade', 'description', 'pa', 'range', 'adjustableRange', 'lineOnly',
  'needsLos', 'emptyCellOnly', 'targetMode', 'cooldown', 'usesPerTurn', 'usesPerTarget', 'critRate', 'critBonus',
  'flatDamage', 'flatHeal', 'failRate', 'endsTurnOnFailure', 'unsupportedEffects', 'auditNotes', 'missingSummons',
  'requiredStates', 'forbiddenStates', 'isWeapon', 'weaponType', 'monsterSummons', 'effects', 'critEffects'];

function spellReference(spell, fighter) {
  return {
    ...Object.fromEntries(SPELL_KEYS.filter(key => spell[key] !== undefined).map(key => [key, spell[key]])),
    description: spellDescription(spell),
    effectiveCritRate: critDivisor(spell.critRate, effectiveStat(fighter, 'agilite'), statBuffTotal(fighter, 'crit') + (spell.critBonus || 0)),
    readableEffects: (spell.effects || []).map(e => describeSpellEffect(e, spell)),
    readableCriticalEffects: (spell.critEffects || []).map(e => describeSpellEffect(e, spell)),
  };
}

function fighterReference(fighter, spells) {
  return {
    name: fighter.name, classId: fighter.classId, level: fighter.level, hp: fighter.maxHp,
    pa: fighter.pa, pm: fighter.pm, stats: fighter.stats, permanent: fighter.permanent || {},
    summonLimit: Math.max(0, (fighter.maxSummons ?? CLASSES[fighter.classId]?.maxSummons ?? 1) + statBuffTotal(fighter, 'summons')),
    spellModifiers: fighter.spellModifiers || {}, resistances: fighter.resistances, resistancesFixed: fighter.resistancesFixed,
    spells: spells.map(s => spellReference(s, fighter)),
  };
}

const nestedEffects = effects => (effects || []).flatMap(e => [e, ...nestedEffects(e.trigger?.effects)]);

// Summoning effects only contain IDs. Resolve the same template/grade/scaling
// used by applySpell so an external assistant can reason about the actual unit.
// Follow summoned summons too; a visited map prevents recursive catalogues.
export function aiFighterReference(snapshot) {
  const native = spellsOf(snapshot);
  // The public view already contains effective range and failure rate. Keep
  // those values while recovering metadata omitted from the small bot view.
  const spells = snapshot.spells.map(s => ({ ...native[s.key], ...s }));
  const result = fighterReference(snapshot, spells), summons = new Map();
  const queue = [{ fighter: snapshot, spells, ref: 'fighter' }];
  for (let i = 0; i < queue.length; i++) {
    const owner = queue[i];
    for (const spell of owner.spells) for (const variant of ['effects', 'critEffects']) {
      for (const e of nestedEffects(spell[variant]).filter(e => ['summon', 'staticSummon', 'double'].includes(e.kind))) {
        const isDouble = e.kind === 'double';
        const monster = !isDouble && (owner.fighter.isMonster || spell.monsterSummons) ? getMonster(e.p1, e.p2) : null;
        const template = isDouble ? { name: 'Double', hp: owner.fighter.maxHp, pa: 0, pm: owner.fighter.basePm,
          stats: owner.fighter.stats, resistances: owner.fighter.resistances } : monster
          ? { ...monster, hp: monster.baseHp, pa: Math.max(0, monster.basePa), pm: Math.max(0, monster.basePm) }
          : getSummon(e.p1, e.p2);
        const scale = isDouble || owner.fighter.isMonster || spell.monsterSummons ? 1 : 1 + owner.fighter.level / 100;
        const level = monster ? monster.level : owner.fighter.level;
        const ref = isDouble ? `${owner.ref}:double`
          : `${monster ? 'monster' : 'summon'}:${e.p1}:${e.p2}:${level}:${scale}:${e.kind}`;
        const source = { caster: owner.ref, spellKey: spell.key, variant };
        if (summons.has(ref)) { summons.get(ref).sources.push(source); continue; }
        if (!template) {
          summons.set(ref, { ref, monsterId: e.p1, grade: e.p2, sources: [source], unavailable: 'Données manquantes : ne pas construire une stratégie sur cette invocation.' });
          continue;
        }
        const fighter = {
          ...template, classId: owner.fighter.classId, level, isMonster: !!monster, isSummon: true,
          isDouble, staticSummon: e.kind === 'staticSummon', summonGrade: e.p2, monsterGrade: monster?.grade,
          maxHp: Math.floor(template.hp * scale),
          basePm: template.pm, effects: [], permanent: monster ? { dodgePa: monster.dodgePa, dodgePm: monster.dodgePm } : {},
          stats: Object.fromEntries(Object.entries(template.stats).map(([key, value]) => [key, Math.floor(value * scale)])),
          resistancesFixed: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 },
        };
        const book = Object.values(spellsOf(fighter));
        summons.set(ref, { ref, monsterId: template.monsterId || null, grade: e.p2, sources: [source],
          static: fighter.staticSummon, countsTowardSummonLimit: !fighter.staticSummon,
          statAndHpMultiplier: scale, ...fighterReference(fighter, book) });
        queue.push({ fighter, spells: book, ref });
      }
    }
  }
  return { ...result, summons: [...summons.values()] };
}

export function aiBehaviorExample(snapshot) {
  const summon = snapshot?.spells.find(s => s.effects.some(e => e.kind === 'summon'));
  return summon
    ? `Jouer en invocateur de soutien. Ouvrir avec ${summon.name} si le placement est utile, puis renforcer mes invocations. Garder mes distances et laisser un passage aux alliés. Soigner un allié sous 45 % de PV si possible. Viser les invocateurs ennemis en priorité, sauf si une invocation menace de tuer un allié. Si invoquer ou aider ne sert à rien, choisir une attaque ou un déplacement utile.`
    : 'Mettre la pression sans me surexposer. Préparer un boost seulement s’il améliore les attaques suivantes. Finir les ennemis dangereux déjà blessés. Garder une distance adaptée à mes sorts et éviter le contact sous 35 % de PV. Si mon action prioritaire est impossible, choisir une autre action utile.';
}
