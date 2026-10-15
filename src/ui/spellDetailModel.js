import { SPELL_LIBRARY, getSummon } from '../engine/classes';
import { critDivisor, effectiveStat, statBuffTotal } from '../engine/formulas';
import { getMonster } from '../engine/monsters';
import { PUNISHMENT_STATS } from '../engine/engine';
import { combatStatLabel } from './combatEffects';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
export const ELEMENT_NAMES = { neutre: 'Neutre', terre: 'Terre', feu: 'Feu', eau: 'Eau', air: 'Air' };
export const stateName = id => ({ 1: 'Saoul', 3: 'Porte un combattant', 6: 'Enraciné', 7: 'Pesanteur', 8: 'Porté' })[id] || `État ${id}`;
export const turnLabel = count => `${count} tour${count > 1 ? 's' : ''}`;
export const spellRangeLabel = spell => spell.range?.[1] === 0 ? 'Sur soi'
  : `${spell.range?.[0] === spell.range?.[1] ? spell.range[0] : spell.range?.join('–')} PO`;

// Start from the equipped/modified spell, not a catalogue's default grade.
export function inspectCombatSpell(spell, fighter) {
  if (!fighter) return spell;
  return { ...spell,
    range: [spell.range[0], Math.max(spell.range[0], spell.range[1] + (spell.adjustableRange ? statBuffTotal(fighter, 'range') : 0))],
    effectiveCritRate: fighter.effects?.some(effect => effect.kind === 'minRolls') ? 0
      : critDivisor(spell.critRate, effectiveStat(fighter, 'agilite'), statBuffTotal(fighter, 'crit') + (spell.critBonus || 0)),
    failRate: spell.failRate ? Math.max(2, spell.failRate - statBuffTotal(fighter, 'fail')) : 0,
    cooldownLeft: fighter.cooldowns?.[spell.key] || 0,
    usesLeft: spell.usesPerTurn ? Math.max(0, spell.usesPerTurn - (fighter.usedThisTurn?.[spell.key] || 0)) : Infinity,
  };
}

export function spellZoneLabel(code) {
  const size = Math.max(0, ALPHABET.indexOf(code?.[1]));
  if (!size || !code || code[0] === 'P') return '1 case';
  if (size >= 30 && ['C', 'X'].includes(code[0])) return 'Toute la carte';
  return ({ C: `Cercle · rayon ${size}`, O: `Anneau · rayon ${size}`, X: `Croix · rayon ${size}`,
    L: `Ligne · ${size + 1} cases`, T: `Ligne perpendiculaire · ${2 * size + 1} cases` })[code[0]] || '1 case';
}

export function effectTargetLabel(effect, spell) {
  if (['selfDamage', 'selfPercentDamage', 'refundPa', 'spellBoost', 'teleport'].includes(effect.kind)) return 'Lanceur';
  const mask = effect.targetMask || 0;
  if (mask & 32) return 'Lanceur';
  if (spell.targetMode === 'self' && spellZoneLabel(effect.zone) === '1 case') return 'Lanceur';
  if (spell.targetMode === 'enemy' && spellZoneLabel(effect.zone) === '1 case' && !(mask & 8)) return 'Ennemi visé';
  return [mask & 1 ? 'Ennemis' : mask & 4 ? 'Alliés' : 'Alliés et ennemis',
    mask & 2 && !(mask & 1) ? 'sauf le lanceur' : '', mask & 8 ? 'invocations uniquement' : mask & 16 ? 'hors invocations' : ''].filter(Boolean).join(' · ');
}

const specialDurations = new Set(['weaponMastery', 'damageReflection', 'spellReflection', 'ecaflipLuck', 'dodgeMelee',
  'skipTurn', 'invisibility', 'sacrifice', 'minRolls', 'maxRolls', 'apPoison', 'damageOnHit', 'delayedSpell']);
function amount(effect) {
  const min = Math.max(0, effect.min ?? effect.p1 ?? 0), max = Math.max(min, effect.max ?? min);
  return min === max ? String(min) : `${min}–${max}`;
}

// Preserve each effect's own target, probability and duration, even when a
// spell combines enemy damage and a boost for its caster (e.g. Furie).
export function describeSpellEffect(effect, spell) {
  const e = effect, value = amount(e), element = ELEMENT_NAMES[e.element] || '', stat = combatStatLabel(e.stat);
  const plus = `+${value}`, minus = `−${value}`;
  let text, note = '';
  switch (e.kind) {
    case 'damage': text = `${value} dégâts ${element}`; break;
    case 'lifeSteal': case 'fixedLifeSteal': text = `${value} vol de vie ${element}`; note = 'Rend au lanceur la moitié des PV réellement retirés.'; break;
    case 'heal': case 'fixedHeal': text = `${plus} PV${e.duration > 0 ? ' par tour' : ''}`; break;
    case 'poison': text = `${value} dégâts ${element} par tour`; note = 'Poison : agit au début du tour de la cible.'; break;
    case 'buffPa': text = `${plus} PA`; break;
    case 'buffPm': text = `${plus} PM`; break;
    case 'buffPower': text = `${plus} puissance`; break;
    case 'buffDamage': text = `${plus} dommages`; break;
    case 'buffCrit': text = `${plus} coups critiques`; break;
    case 'buffVitality': text = `${plus} vitalité`; break;
    case 'buffRange': text = `${plus} portée`; break;
    case 'buffStat': text = `${plus} ${stat}`; break;
    case 'debuffRange': text = `${minus} portée`; break;
    case 'debuffStat': text = `${minus} ${stat}`; break;
    case 'stealStat': text = `Vole ${value} ${stat}`; note = 'Retire ce bonus à la cible et le donne au lanceur.'; break;
    case 'removePa': case 'debuffPa': case 'removePm': case 'debuffPm':
      text = `${minus} ${e.kind.endsWith('Pa') ? 'PA' : 'PM'}`;
      note = e.kind.startsWith('debuff') ? 'Retrait non esquivable.' : 'Retrait esquivable : chaque point est testé séparément.'; break;
    case 'stealPa': case 'stealPm': text = `Vole ${value} ${e.kind === 'stealPa' ? 'PA' : 'PM'}`; note = 'Retrait esquivable. Les points retirés sont rendus au lanceur.'; break;
    case 'resistBuff': text = `${plus} % résistance ${element}`; break;
    case 'resistDebuff': text = `${minus} % résistance ${element}`; break;
    case 'resistAllBuff': text = `${plus} % résistances dans tous les éléments`; break;
    case 'armor': text = `Réduit les dégâts de ${value} (base)`; note = 'La réduction dépend aussi des caractéristiques et de l’élément reçu.'; break;
    case 'push': text = `Repousse de ${e.p1 || 1} case(s)`; note = 'Un obstacle peut provoquer des dégâts de poussée.'; break;
    case 'pull': text = `Attire de ${e.p1 || 1} case(s)`; break;
    case 'teleport': text = 'Se téléporte sur la case visée'; break;
    case 'swap': case 'swapAlly': case 'swapEnemy': text = 'Échange les positions avec la cible'; break;
    case 'carry': text = 'Porte la cible'; break;
    case 'throw': text = 'Lance le combattant porté sur la case visée'; break;
    case 'fear': text = 'Repousse jusqu’à la case visée'; note = 'Sans dégâts de collision.'; break;
    case 'rollback': text = 'Replace les combattants à leur position de départ'; break;
    case 'summon': case 'staticSummon': {
      const summon = (spell.monsterSummons && getMonster(e.p1, e.p2)) || getSummon(e.p1, e.p2) || getMonster(e.p1, e.p2);
      text = `Invoque ${summon?.name || 'une créature'}`; note = e.kind === 'staticSummon' ? 'Invocation immobile.' : 'L’invocation rejoint le camp du lanceur.'; break;
    }
    case 'double': text = 'Invoque un double du lanceur'; break;
    case 'revive': text = `Ressuscite le dernier allié mort avec ${e.p1} % de ses PV`; break;
    case 'dispel': text = 'Retire les boosts et malus de la cible'; note = 'Les états ne sont pas retirés.'; break;
    case 'invisibility': text = 'Rend invisible'; break;
    case 'reveal': text = 'Révèle les combattants invisibles et les pièges'; break;
    case 'dodgeMelee': text = 'Esquive les frappes au contact'; note = `Recule de ${Math.max(1, e.p2 || 1)} case(s). Une collision peut encore blesser.`; break;
    case 'sacrifice': text = 'Le lanceur prend les dégâts à la place de la cible'; break;
    case 'skipTurn': text = 'Fait passer le tour'; break;
    case 'weaponMastery': text = `+${e.p2} % dégâts de l’arme maîtrisée`; break;
    case 'damageReflection': text = `Renvoie ${value} dommages (base)`; break;
    case 'spellReflection': text = `Renvoie les sorts de grade ≤ ${e.p2}`; note = `${e.p3 > 0 ? e.p3 : 100} % de chance de renvoi.`; break;
    case 'ecaflipLuck': text = `${100 - e.p3} % de chance de transformer le coup en soin ×${e.p2}`; note = `Sinon, dégâts reçus ×${e.p1}.`; break;
    case 'minRolls': text = 'Impose les jets de dégâts minimums'; break;
    case 'maxRolls': text = 'Maximise les jets des dégâts reçus'; break;
    case 'apPoison': text = `${e.p2} dégâts Feu par tranche de ${e.p1} PA utilisés`; break;
    case 'damageOnHit': text = `${value} % des PV max perdus à chaque coup reçu`; break;
    case 'selfDamage': text = `${minus} PV au lanceur`; break;
    case 'selfPercentDamage': text = `Retire ${value} % des PV actuels du lanceur`; break;
    case 'percentLifeDamage': text = `Dégâts : ${value} % des PV actuels du lanceur`; break;
    case 'lifeTransfer': text = `Sacrifie ${value} % des PV actuels du lanceur`; note = 'Soigne chaque allié touché du montant sacrifié.'; break;
    case 'punitionDamage': text = 'Dégâts Neutre selon les PV du lanceur'; note = 'Plus efficace lorsque le lanceur est proche de la moitié de ses PV.'; break;
    case 'punishment': text = `Gagne ${combatStatLabel(PUNISHMENT_STATS[e.p1] || 'PV')} à chaque coup reçu`; note = `Gain : moitié des dégâts reçus, plafond ${e.p2 || 999} par tour. Bonus pendant ${turnLabel(e.p3 > 0 ? e.p3 : 5)}.`; break;
    case 'erosion': text = `${plus} % érosion`; break;
    case 'refundPa': text = `${plus} PA rendus au lanceur`; break;
    case 'spellBoost': text = `+${e.p3 || 0} dégâts de base pour ${SPELL_LIBRARY.spells[e.p1]?.name || 'le sort chargé'}`; break;
    case 'state': text = `Applique l’état ${stateName(e.p3)}`; break;
    case 'removeState': text = `Retire l’état ${stateName(e.p3)}`; break;
    case 'kill': text = 'Tue la cible'; break;
    case 'trap': text = 'Pose un piège'; note = 'Déclenché lorsqu’un combattant entre dans sa zone.'; break;
    case 'glyph': text = 'Pose un glyphe'; note = 'Déclenché au début du tour des combattants dans sa zone.'; break;
    case 'delayedSpell': text = `Déclenche un effet dans ${turnLabel(Math.max(1, e.p3 || 1))}`; break;
    case 'outOfCombat': case 'cosmetic': text = 'Aucun effet de combat'; break;
    default: text = 'Effet non simulé';
  }
  const duration = e.duration > 0 ? turnLabel(e.duration) : e.kind === 'state' ? 'Sans limite'
    : specialDurations.has(e.kind) ? turnLabel(Math.max(1, e.p3 || 1)) : e.kind === 'punishment' ? '5 tours'
      : /^(buff|debuff|resist)/.test(e.kind) || e.kind === 'armor' ? 'Ce tour'
        : ['trap', 'glyph'].includes(e.kind) ? 'Sans limite' : 'Immédiat';
  return { text: text.trim(), note, target: effectTargetLabel(e, spell), zone: spellZoneLabel(e.zone), duration,
    chance: e.chance > 0 ? `${e.chance} % de chance` : null, element: e.element,
    children: (e.trigger?.effects || []).map(child => describeSpellEffect(child, { ...spell, targetMode: 'cell' })) };
}

export const spellDescription = spell => spell.description || SPELL_LIBRARY.spells[spell.id]?.description || '';
export function spellCanHitAllies(spell) {
  return [...(spell.effects || []), ...(spell.critEffects || [])].some(e => ['damage', 'lifeSteal', 'poison', 'kill'].includes(e.kind)
    && !(e.targetMask & (1 | 32)) && spellZoneLabel(e.zone) !== '1 case');
}
