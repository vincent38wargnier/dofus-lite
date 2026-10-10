import { CLASSES, SPELL_LIBRARY, buildSpell } from '../engine/classes';
import MONSTER_DATA from '../engine/monsterData.json';
import { DUNGEONS } from '../engine/dungeons';
import { isCustomSpell } from '../engine/customSpells';

export const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").toLocaleLowerCase('fr');
export const MONSTER_CATALOGUE = Object.values(MONSTER_DATA.monsters).map(monster => ({ ...monster,
  rooms: DUNGEONS.filter(room => room.members.some(member => member.monsterId === monster.id)),
})).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export const ACTION_LABELS = {
  damage: 'Dégâts directs', lifeSteal: 'Vol de vie', heal: 'Soin', fixedHeal: 'Soin fixe', poison: 'Poison',
  buffPa: 'Bonus PA', buffPm: 'Bonus PM', removePa: 'Retrait PA', removePm: 'Retrait PM',
  debuffPa: 'Malus PA', debuffPm: 'Malus PM', stealPa: 'Vol PA', stealPm: 'Vol PM',
  armor: 'Armure', buffPower: 'Puissance', buffDamage: 'Dommages', buffStat: 'Caractéristique',
  debuffStat: 'Malus caractéristique', stealStat: 'Vol de caractéristique', buffCrit: 'Coups critiques',
  buffVitality: 'Vitalité', buffRange: 'Portée', debuffRange: 'Malus portée', resistBuff: 'Résistance',
  resistDebuff: 'Vulnérabilité', summon: 'Invocation', staticSummon: 'Invocation statique', double: 'Double',
  push: 'Poussée', pull: 'Attirance', teleport: 'Téléportation', swap: 'Échange de place',
  state: 'État', removeState: 'Retrait état', spellBoost: 'Charge de sort', percentLifeDamage: 'Dégâts en % de vie',
  selfDamage: 'Sacrifice de PV', selfPercentDamage: 'Sacrifice de PV en %', erosion: 'Érosion',
  fixedLifeSteal: 'Vol de vie fixe', invisibility: 'Invisibilité', reveal: 'Détection', weaponMastery: 'Maîtrise',
  carry: 'Porter', throw: 'Lancer', fear: 'Peur', rollback: 'Retour aux positions',
  spellReflection: 'Renvoi de sort', damageReflection: 'Renvoi de dommages', ecaflipLuck: 'Chance d’Ecaflip',
  sacrifice: 'Sacrifice', minRolls: 'Jets minimisés', maxRolls: 'Jets maximisés', skipTurn: 'Tour passé',
  dodgeMelee: 'Esquive au contact', apPoison: 'Poison par PA', damageOnHit: 'Perte de vie par coup',
  lifeTransfer: 'Transfert de vie', revive: 'Résurrection', delayedSpell: 'Effet différé',
  outOfCombat: 'Hors combat', cosmetic: 'Apparence', kill: 'Mort', resistAllBuff: 'Résistances élémentaires',
  punishment: 'Châtiment', punitionDamage: 'Punition', trap: 'Piège', glyph: 'Glyphe',
  refundPa: 'Remboursement PA', dispel: 'Désenvoûtement',
};
export const ROLE_LABELS = { damage: 'Attaque', boost: 'Boost / protection', heal: 'Soin', summon: 'Invocation',
  placement: 'Placement', debuff: 'Retrait / malus', utility: 'Utilitaire' };
const ROLE_KINDS = {
  damage: ['damage', 'lifeSteal', 'fixedLifeSteal', 'poison', 'apPoison', 'percentLifeDamage', 'punitionDamage', 'kill'],
  boost: ['armor', 'weaponMastery', 'spellBoost', 'punishment', 'invisibility', 'dodgeMelee', 'spellReflection', 'damageReflection', 'ecaflipLuck', 'sacrifice', 'maxRolls'],
  heal: ['heal', 'fixedHeal', 'lifeTransfer', 'lifeSteal', 'fixedLifeSteal'],
  summon: ['summon', 'staticSummon', 'double', 'revive'],
  placement: ['push', 'pull', 'teleport', 'swap', 'carry', 'throw', 'fear', 'rollback'],
  debuff: ['removePa', 'removePm', 'stealPa', 'stealPm', 'stealStat', 'resistDebuff', 'minRolls', 'skipTurn', 'dispel', 'erosion'],
};
export function allSpellEffects(raw) {
  return [...(raw.effects || []), ...(raw.critEffects || [])].flatMap(effect => [effect,
    ...(effect.trigger ? allSpellEffects(effect.trigger) : [])]);
}
export function spellFacets(raw) {
  const effects = allSpellEffects(raw);
  const actions = [...new Set(effects.map(effect => effect.kind).filter(kind => ACTION_LABELS[kind]))];
  const roles = Object.entries(ROLE_KINDS).filter(([role, kinds]) => actions.some(kind => kinds.includes(kind)
    || (role === 'boost' && /^(buff|resist.*Buff)/.test(kind)) || (role === 'debuff' && kind.startsWith('debuff')))).map(([role]) => role);
  const elements = [...new Set(effects.flatMap(effect => ROLE_KINDS.damage.includes(effect.kind)
    ? [effect.element || (effect.kind === 'apPoison' ? 'feu' : effect.kind === 'punitionDamage' ? 'neutre' : null)].filter(Boolean) : []))];
  return { actions, roles: roles.length ? roles : ['utility'], elements,
    area: effects.some(effect => effect.zone && !['Pa', 'Ca', 'Xa'].includes(effect.zone)),
    delayed: effects.some(effect => ['poison', 'apPoison', 'trap', 'glyph', 'delayedSpell'].includes(effect.kind)) };
}

function catalogue() {
  const entries = new Map();
  const add = (raw, source, description = '') => {
    if (!isCustomSpell(raw)) return;
    let entry = entries.get(raw.id);
    if (!entry) { entry = { id: raw.id, name: raw.name, description, grades: [], sources: [] }; entries.set(raw.id, entry); }
    if (!entry.grades.some(grade => grade.grade === raw.grade)) entry.grades.push(raw);
    if (!entry.sources.some(existing => existing.id === source.id)) entry.sources.push(source);
  };
  for (const [classId, ids] of Object.entries(SPELL_LIBRARY.classes)) for (const id of ids) {
    const entry = SPELL_LIBRARY.spells[id];
    for (const grade of entry.grades) add({ ...grade, id: entry.id, name: entry.name }, { id: `class:${classId}`, name: CLASSES[classId].name, type: 'class' }, entry.description);
  }
  for (const id of SPELL_LIBRARY.common) {
    const entry = SPELL_LIBRARY.spells[id];
    for (const grade of entry.grades) add({ ...grade, id: entry.id, name: entry.name }, { id: 'common', name: 'Sorts communs', type: 'class' }, entry.description);
  }
  for (const monster of Object.values(MONSTER_DATA.monsters)) for (const grade of Object.values(monster.grades)) {
    for (const raw of grade.spells) add({ ...raw, monsterSummons: true }, { id: `monster:${monster.id}`, name: monster.name, type: 'monster' });
  }
  for (const summon of Object.values(SPELL_LIBRARY.summons)) for (const grade of Object.values(summon.grades)) {
    for (const raw of grade.spells) add(raw, { id: `monster:${summon.monsterId}`, name: summon.name, type: 'monster' });
  }
  return [...entries.values()].map(entry => {
    entry.grades.sort((a, b) => a.grade - b.grade);
    const raw = entry.grades.at(-1);
    const facets = spellFacets(raw);
    return { ...entry, ...facets, search: fold(`${entry.id} ${entry.name} ${entry.sources.map(source => source.name).join(' ')} ${facets.roles.map(role => ROLE_LABELS[role]).join(' ')} ${facets.actions.map(action => ACTION_LABELS[action]).join(' ')} ${facets.elements.join(' ')}`) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id - b.id);
}
export const CREATION_SPELLS = catalogue();
export const CREATION_SPELLS_BY_ID = Object.fromEntries(CREATION_SPELLS.map(entry => [entry.id, entry]));
export const SPELL_SOURCES = [...new Map(CREATION_SPELLS.flatMap(entry => entry.sources).map(source => [source.id, source])).values()]
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export function filterCreationSpells(entries, { query = '', source = '', origin = '', role = '', action = '', element = '', area = '', sort = 'name' } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const result = entries.filter(entry => words.every(word => entry.search.includes(word))
    && (!source || entry.sources.some(value => value.id === source))
    && (!origin || entry.sources.some(value => value.type === origin))
    && (!role || entry.roles.includes(role)) && (!action || entry.actions.includes(action))
    && (!element || (element === 'multi' ? entry.elements.length > 1 : element === 'none' ? !entry.elements.length : entry.elements.includes(element)))
    && (!area || (area === 'area' ? entry.area : !entry.area)));
  return result.sort((a, b) => (sort === 'pa' ? a.grades.at(-1).pa - b.grades.at(-1).pa
    : sort === 'range' ? b.grades.at(-1).rangeMax - a.grades.at(-1).rangeMax
    : sort === 'action' ? (ACTION_LABELS[a.actions[0]] || 'Utilitaire').localeCompare(ACTION_LABELS[b.actions[0]] || 'Utilitaire', 'fr')
    : sort === 'element' ? (a.elements.join(', ') || 'Sans dégâts').localeCompare(b.elements.join(', ') || 'Sans dégâts', 'fr')
    : sort === 'role' ? ROLE_LABELS[a.roles[0]].localeCompare(ROLE_LABELS[b.roles[0]], 'fr') : 0)
    || a.name.localeCompare(b.name, 'fr') || a.id - b.id);
}

export function spellLimitations(raw) {
  const built = buildSpell(raw);
  return [built.unsupportedEffects.length ? 'Certains effets ne sont pas simulés.' : '',
    built.missingSummons.length ? 'Certaines invocations ne sont pas disponibles.' : '',
    ...(built.auditNotes || []),
    raw.requiredStates?.length ? `Nécessite les états : ${raw.requiredStates.join(', ')}.` : '',
  ].filter(Boolean);
}
