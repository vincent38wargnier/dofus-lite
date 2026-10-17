// Retro client definitions for all player spell grades. Server target rules
// and summon stats are separately sourced; see spell-audit.json and README.

import { spellLibrary as LIBRARY, classData } from "./gameData";
import { isCustomSpellbookDraft, MAX_CUSTOM_SPELLS } from './customSpells';
import { isAuthoredSpell, authoredSpellErrors } from './authoredSpells';
import { spellbookBudgetErrors } from './spellBalance';
import { PARCHMENT_STAT, baseActionPoints } from './characteristicDefaults';
export const SPELL_LIBRARY = LIBRARY;

// Stable display keys for the original arena kit; targeting comes from the dump.
//   targetMode: 'enemy' | 'fighter' | 'cell' | 'freeCell' | 'self'
const SPELL_META = classData.metadata;

// A zero-duration stat bonus applies only during the current turn.
export const DEFAULT_BUFF_TURNS = 0;

// Effets qu'aucune ligne du moteur ne simule: filtrés à la construction.
const isSimulated = (e) => e.kind !== 'ignore' && !e.kind.startsWith('unknown');

export function buildSpell(raw) {
  // Les 72 sorts historiques gardent leurs clés/émojis choisis à la main
  // (les bots intégrés et les tests s'y réfèrent); les nouveaux sorts du
  // roster complet utilisent les métadonnées dérivées par l'extracteur.
  const meta = SPELL_META[raw.id] || { key: raw.key, name: raw.name, emoji: raw.emoji, targetMode: raw.targetMode };
  // Keep unimplemented probability rows: they still occupy an interval in
  // the shared draw (notably Xelor's 90% no-op / 10% AP refund).
  const effects = raw.effects.filter(e => isSimulated(e) || e.chance > 0);
  const critEffects = raw.critEffects.filter(e => isSimulated(e) || e.chance > 0);
  const main = effects.find((e) => e.kind === 'damage' || e.kind === 'lifeSteal' || e.kind === 'poison');
  return {
    key: meta.key,
    id: raw.id,
    name: meta.name,
    emoji: meta.emoji,
    targetMode: raw.rangeMax === 0 ? 'self' : raw.emptyCellOnly ? 'freeCell' : raw.targetMode,
    grade: raw.grade,
    requiredLevel: raw.requiredLevel,
    ...(isAuthoredSpell(raw) ? { authoringVersion: raw.authoringVersion, description: raw.description, visualSpellId: raw.visualSpellId,
      ...(raw.visualEffect ? { visualEffect: { ...raw.visualEffect } } : {}),
      ...(raw.iconArtworkId ? { iconArtworkId: raw.iconArtworkId, iconFile: raw.iconFile } : {}) } : {}),
    element: main ? main.element : null,
    pa: raw.pa,
    range: [raw.rangeMin, raw.rangeMax],
    lineOnly: raw.lineOnly,
    needsLos: raw.needsLos,
    emptyCellOnly: raw.emptyCellOnly,
    adjustableRange: !!raw.adjustableRange,
    critRate: raw.critRate,
    failRate: raw.failRate,
    endsTurnOnFailure: raw.endsTurnOnFailure,
    usesPerTurn: raw.maxPerTurn,
    usesPerTarget: raw.maxPerTarget || 0,
    requiredStates: raw.requiredStates || [],
    forbiddenStates: raw.forbiddenStates || [],
    cooldown: raw.cooldown,
    initialCooldown: raw.initialCooldown || 0,
    missingSummons: raw.missingSummons || [],
    auditNotes: LIBRARY.spells[raw.id]?.auditNotes || [],
    unsupportedEffects: [...new Set([...raw.effects, ...raw.critEffects]
      .filter(e => !isSimulated(e) && ![666, 149].includes(e.id)).map(e => e.id))],
    effects,
    critEffects,
  };
}

export function spellAtGrade(id, grade) {
  const entry = LIBRARY.spells[id];
  const raw = entry?.grades.find(g => g.grade === grade);
  return raw ? buildSpell({ ...raw, id: Number(id), name: entry.name }) : null;
}

export function availableSpellGrades(id, level = 100) {
  return LIBRARY.spells[id]?.grades.filter(g => g.requiredLevel <= level).map(g => g.grade) || [];
}

// Default arena preset. Explicit grades still follow the real unlock levels.
export function defaultSpellGrade(id, level = 100) {
  const desired = LIBRARY.common.includes(Number(id)) || level >= 200 ? 6 : 5;
  return availableSpellGrades(id, level).filter(grade => grade <= desired).pop();
}

export function resolveSpellLoadout(classId, loadout = {}) {
  const level = loadout.level || 100;
  const config = loadout.spells || {};
  const errors = [];
  if (config.custom !== undefined) {
    if (Array.isArray(config.custom) && config.custom.length > MAX_CUSTOM_SPELLS) {
      return { spells: {}, errors: [`Une classe personnalisée peut avoir au maximum ${MAX_CUSTOM_SPELLS} sorts. Retirez ${config.custom.length - MAX_CUSTOM_SPELLS} sort(s) avant de jouer.`], valid: false };
    }
    if (!isCustomSpellbookDraft(config.custom)) return { spells: {}, errors: ['Liste de sorts personnalisés invalide.'], valid: false };
    const budgetErrors = [...config.custom.filter(isAuthoredSpell).flatMap(raw => authoredSpellErrors(raw)), ...spellbookBudgetErrors(config.custom)];
    if (budgetErrors.length) return { spells: {}, errors: [...new Set(budgetErrors)], valid: false };
    const locked = config.custom.filter(raw => isAuthoredSpell(raw) && raw.requiredLevel > level);
    if (locked.length) return { spells: {}, errors: locked.map(raw => `${raw.name} : niveau ${raw.requiredLevel} requis pour un sort créé.`), valid: false };
    const order = config.order || [];
    const keys = new Set();
    const custom = config.custom.map(raw => {
      // Keep the public spell keys used by existing, hand-written AIs.
      const spell = { ...buildSpell(raw), monsterSummons: !!raw.monsterSummons };
      if (keys.has(spell.key)) spell.key += `_${spell.id}`;
      keys.add(spell.key);
      return spell;
    });
    custom.sort((a, b) => {
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      return (ai < 0 ? 10000 : ai) - (bi < 0 ? 10000 : bi);
    });
    return { spells: Object.fromEntries(custom.map(spell => [spell.key, spell])), errors, valid: true };
  }
  const common = [...new Set(config.common || [])];
  const ids = [...(LIBRARY.classes[classId] || []), ...common.filter(id => LIBRARY.common.includes(id))];
  if (common.some(id => !LIBRARY.common.includes(id))) errors.push('Sort commun inconnu.');
  const spells = {};
  for (const id of ids) {
    const grades = availableSpellGrades(id, level);
    if (!grades.length) continue;
    // Common spells always use their best unlocked grade, including old saved
    // loadouts that stored grade 1. Their real grade-6 threshold is level 100.
    const selected = LIBRARY.common.includes(id) ? undefined : config.grades?.[id];
    const grade = selected ?? defaultSpellGrade(id, level);
    if (!grades.includes(grade)) { errors.push(`${LIBRARY.spells[id].name} : grade inaccessible.`); continue; }
    const spell = spellAtGrade(id, grade);
    if (spells[spell.key]) spell.key += `_${spell.id}`;
    spells[spell.key] = spell;
  }
  const order = [...new Set(config.order || [])];
  const sorted = Object.values(spells).sort((a, b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? 10000 : ai) - (bi < 0 ? 10000 : bi);
  });
  return { spells: Object.fromEntries(sorted.map(s => [s.key, s])), errors, valid: !errors.length };
}

function buildSpells(classId) { return resolveSpellLoadout(classId).spells; }

export const FIGHTER_LEVEL = 100;
const BASE_HP = 55 + 5 * (FIGHTER_LEVEL - 1);
const NO_RES = { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 };

// (emoji, description, vita, stats, maxSummons)
const BUILDS = classData.builds;

const NAMES = classData.names;

export const CLASSES = {};
for (const [id, [emoji, description, vita, stats, maxSummons]] of Object.entries(BUILDS)) {
  CLASSES[id] = {
    id,
    name: NAMES[id],
    emoji,
    description,
    baseHp: BASE_HP + vita + PARCHMENT_STAT,
    basePa: baseActionPoints(FIGHTER_LEVEL),
    basePm: 4,
    stats: { ...Object.fromEntries(Object.entries(stats).map(([stat, value]) => [stat, value + PARCHMENT_STAT])), vitalite: vita + PARCHMENT_STAT },
    maxSummons,
    resistances: { ...NO_RES },
    resistancesFixed: { ...NO_RES },
    spells: buildSpells(id),
  };
}

export const CLASS_IDS = Object.keys(CLASSES);
export const DEFAULT_CLASS_ID = CLASS_IDS.includes("IOP") ? "IOP" : CLASS_IDS[0];
export const DEFAULT_OPPONENT_ID = CLASS_IDS.includes("CRA") ? "CRA" : DEFAULT_CLASS_ID;

export function getSpell(classId, spellKey) {
  return CLASSES[classId]?.spells[spellKey] || null;
}

// Monster stats/rosters come from the separate server SQL, one record per grade.
const SUMMON_GRADES = {};
export const SUMMONS = {};
for (const m of Object.values(LIBRARY.summons)) {
  SUMMON_GRADES[m.monsterId] = {};
  for (const [grade, raw] of Object.entries(m.grades)) {
    const spells = Object.fromEntries(raw.spells.map(s => {
      const spell = buildSpell(s);
      return [spell.key, spell];
    }));
    SUMMON_GRADES[m.monsterId][grade] = { ...m, ...raw, grades: undefined, spells };
  }
  SUMMONS[m.monsterId] = SUMMON_GRADES[m.monsterId][5] || Object.values(SUMMON_GRADES[m.monsterId])[0];
}

export function getSummon(monsterId, grade = 5) { return SUMMON_GRADES[monsterId]?.[grade] || null; }
export function getSummonSpell(monsterId, spellKey, grade = 5) {
  return getSummon(monsterId, grade)?.spells[spellKey] || null;
}
