// Retro client definitions for all player spell grades. Server target rules
// and summon stats are separately sourced; see spell-audit.json and README.

import LIBRARY from './spellLibrary.json';
import { isCustomSpellbook, MAX_CUSTOM_SPELLS } from './customSpells';
import { isAuthoredSpell } from './authoredSpells';
import { PARCHMENT_STAT, baseActionPoints } from './characteristicDefaults';
export const SPELL_LIBRARY = LIBRARY;

// Stable display keys for the original arena kit; targeting comes from the dump.
//   targetMode: 'enemy' | 'fighter' | 'cell' | 'freeCell' | 'self'
const SPELL_META = {
  // Féca
  3: { key: 'attaque_naturelle', name: 'Attaque Naturelle', emoji: '🌿', targetMode: 'enemy' },
  2: { key: 'aveuglement', name: 'Aveuglement', emoji: '🌫️', targetMode: 'enemy' },
  9: { key: 'attaque_nuageuse', name: 'Attaque Nuageuse', emoji: '☁️', targetMode: 'enemy' },
  19: { key: 'bulle', name: 'Bulle', emoji: '🫧', targetMode: 'enemy' },
  11: { key: 'teleportation_feca', name: 'Téléportation', emoji: '🌀', targetMode: 'freeCell' },
  6: { key: 'armure_terrestre', name: 'Armure Terrestre', emoji: '🛡️', targetMode: 'self' },
  // Osamodas
  34: { key: 'invocation_tofu', name: 'Invocation de Tofu', emoji: '🐤', targetMode: 'freeCell' },
  35: { key: 'invocation_bouftou', name: 'Invocation de Bouftou', emoji: '🐏', targetMode: 'freeCell' },
  21: { key: 'griffe_spectrale', name: 'Griffe Spectrale', emoji: '🐾', targetMode: 'enemy' },
  30: { key: 'fouet', name: 'Fouet', emoji: '🪢', targetMode: 'enemy' },
  24: { key: 'corbeau', name: 'Corbeau', emoji: '🐦‍⬛', targetMode: 'enemy' },
  25: { key: 'soin_animal', name: 'Soin Animal', emoji: '💚', targetMode: 'fighter' },
  // Enutrof
  51: { key: 'lancer_de_pieces', name: 'Lancer de Pièces', emoji: '🪙', targetMode: 'enemy' },
  49: { key: 'pelle_fantomatique', name: 'Pelle Fantomatique', emoji: '👻', targetMode: 'enemy' },
  53: { key: 'force_de_lage', name: "Force de l'Âge", emoji: '⏳', targetMode: 'enemy' },
  50: { key: 'maladresse', name: 'Maladresse', emoji: '🦶', targetMode: 'enemy' },
  56: { key: 'pelle_du_jugement', name: 'Pelle du Jugement', emoji: '⚖️', targetMode: 'enemy' },
  55: { key: 'acceleration', name: 'Accélération', emoji: '💨', targetMode: 'self' },
  // Sram
  61: { key: 'sournoiserie', name: 'Sournoiserie', emoji: '🗡️', targetMode: 'enemy' },
  66: { key: 'poison_insidieux', name: 'Poison Insidieux', emoji: '☠️', targetMode: 'enemy' },
  63: { key: 'coup_sournois', name: 'Coup Sournois', emoji: '🔪', targetMode: 'enemy' },
  76: { key: 'attaque_mortelle', name: 'Attaque Mortelle', emoji: '💀', targetMode: 'enemy' },
  62: { key: 'concentration_chakra', name: 'Concentration de Chakra', emoji: '🧘', targetMode: 'self' },
  75: { key: 'pulsion_de_chakra', name: 'Pulsion de Chakra', emoji: '✨', targetMode: 'self' },
  // Xélor
  81: { key: 'ralentissement', name: 'Ralentissement', emoji: '🐌', targetMode: 'enemy' },
  83: { key: 'aiguille', name: 'Aiguille', emoji: '🕰️', targetMode: 'enemy' },
  84: { key: 'gelure', name: 'Gelure', emoji: '🧊', targetMode: 'enemy' },
  88: { key: 'teleportation_xelor', name: 'Téléportation', emoji: '🌀', targetMode: 'freeCell' },
  91: { key: 'frappe_de_xelor', name: 'Frappe de Xélor', emoji: '⏰', targetMode: 'enemy' },
  98: { key: 'vol_du_temps', name: 'Vol du Temps', emoji: '⌛', targetMode: 'enemy' },
  // Ecaflip
  102: { key: 'pile_ou_face', name: 'Pile ou Face', emoji: '🪙', targetMode: 'fighter' },
  109: { key: 'bluff', name: 'Bluff', emoji: '🃏', targetMode: 'enemy' },
  107: { key: 'topkaj', name: 'Topkaj', emoji: '⚡', targetMode: 'enemy' },
  110: { key: 'griffe_joueuse', name: 'Griffe Joueuse', emoji: '🐱', targetMode: 'enemy' },
  104: { key: 'trefle', name: 'Trèfle', emoji: '🍀', targetMode: 'self' },
  105: { key: 'bond_du_felin', name: 'Bond du Félin', emoji: '🐈', targetMode: 'freeCell' },
  // Eniripsa
  122: { key: 'mot_blessant', name: 'Mot Blessant', emoji: '🗯️', targetMode: 'enemy' },
  121: { key: 'mot_curatif', name: 'Mot Curatif', emoji: '💚', targetMode: 'self' },
  128: { key: 'mot_frayeur', name: 'Mot de Frayeur', emoji: '😱', targetMode: 'enemy' },
  126: { key: 'mot_stimulant', name: 'Mot Stimulant', emoji: '⚡', targetMode: 'self' },
  134: { key: 'mot_vampirique', name: 'Mot Vampirique', emoji: '🧛', targetMode: 'enemy' },
  123: { key: 'mot_drainant', name: 'Mot Drainant', emoji: '🌀', targetMode: 'enemy' },
  // Iop
  143: { key: 'intimidation', name: 'Intimidation', emoji: '😤', targetMode: 'enemy' },
  141: { key: 'pression', name: 'Pression', emoji: '👊', targetMode: 'enemy' },
  146: { key: 'epee_destin', name: 'Épée du Destin', emoji: '🗡️', targetMode: 'cell' },
  159: { key: 'colere', name: 'Colère de Iop', emoji: '💥', targetMode: 'enemy' },
  142: { key: 'bond', name: 'Bond', emoji: '🦘', targetMode: 'freeCell' },
  153: { key: 'puissance', name: 'Puissance', emoji: '🔥', targetMode: 'self' },
  // Cra
  161: { key: 'fleche_magique', name: 'Flèche Magique', emoji: '✨', targetMode: 'enemy' },
  169: { key: 'fleche_recul', name: 'Flèche de Recul', emoji: '💨', targetMode: 'enemy' },
  165: { key: 'fleche_enflammee', name: 'Flèche Enflammée', emoji: '🔥', targetMode: 'cell' },
  171: { key: 'fleche_punitive', name: 'Flèche Punitive', emoji: '☄️', targetMode: 'enemy' },
  177: { key: 'fleche_ralentissante', name: 'Flèche Ralentissante', emoji: '🐌', targetMode: 'cell' },
  170: { key: 'fleche_immobilisation', name: "Flèche d'Immobilisation", emoji: '🕸️', targetMode: 'enemy' },
  // Sadida
  183: { key: 'ronce', name: 'Ronce', emoji: '🌵', targetMode: 'enemy' },
  198: { key: 'sacrifice_poupesque', name: 'Sacrifice Poupesque', emoji: '🪆', targetMode: 'enemy' },
  191: { key: 'ronces_multiples', name: 'Ronces Multiples', emoji: '🌿', targetMode: 'enemy' },
  185: { key: 'herbe_folle', name: 'Herbe Folle', emoji: '🍃', targetMode: 'enemy' },
  184: { key: 'feu_de_brousse', name: 'Feu de Brousse', emoji: '🔥', targetMode: 'enemy' },
  193: { key: 'la_bloqueuse', name: 'La Bloqueuse', emoji: '🎎', targetMode: 'freeCell' },
  // Sacrieur
  432: { key: 'pied_du_sacrieur', name: 'Pied du Sacrieur', emoji: '🦵', targetMode: 'enemy' },
  434: { key: 'attirance', name: 'Attirance', emoji: '🧲', targetMode: 'enemy' },
  436: { key: 'assaut', name: 'Assaut', emoji: '⚔️', targetMode: 'enemy' },
  442: { key: 'absorption', name: 'Absorption', emoji: '🩸', targetMode: 'enemy' },
  447: { key: 'furie', name: 'Furie', emoji: '😡', targetMode: 'enemy' },
  448: { key: 'epee_volante', name: 'Épée Volante', emoji: '🗡️', targetMode: 'freeCell' },
  // Pandawa
  687: { key: 'poing_enflamme', name: 'Poing Enflammé', emoji: '🔥', targetMode: 'enemy' },
  690: { key: 'souffle_alcoolise', name: 'Souffle Alcoolisé', emoji: '🍺', targetMode: 'enemy' },
  700: { key: 'vague_a_lame', name: 'Vague à Lame', emoji: '🌊', targetMode: 'enemy' },
  702: { key: 'flasque_explosive', name: 'Flasque Explosive', emoji: '🧨', targetMode: 'cell' },
  703: { key: 'pandatak', name: 'Pandatak', emoji: '🐼', targetMode: 'enemy' },
  704: { key: 'pandanlku', name: 'Pandanlku', emoji: '🏃', targetMode: 'self' },
};

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
    if (!isCustomSpellbook(config.custom)) return { spells: {}, errors: ['Liste de sorts personnalisés invalide.'], valid: false };
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
const BUILDS = {
  FECA: ['🛡️', 'Tortue de guerre : armures, feu et téléportation.', 280,
    { force: 40, intelligence: 180, chance: 0, agilite: 60, sagesse: 110 }, 1],
  OSAMODAS: ['🐾', 'Dompteur : ses invocations se battent toutes seules.', 240,
    { force: 0, intelligence: 140, chance: 40, agilite: 90, sagesse: 80 }, 2],
  ENUTROF: ['⛏️', 'Vieux radin : pièces à 12 cases, pelles et retraits de PM.', 230,
    { force: 0, intelligence: 60, chance: 220, agilite: 60, sagesse: 110 }, 1],
  SRAM: ['🗡️', 'Assassin : terre, critiques, exécution au contact.', 250,
    { force: 220, intelligence: 0, chance: 0, agilite: 130, sagesse: 60 }, 1],
  XELOR: ['⏰', 'Maître du temps : ronge les PA, téléporte, frappe.', 220,
    { force: 0, intelligence: 200, chance: 40, agilite: 60, sagesse: 140 }, 1],
  ECAFLIP: ['🎲', 'Parieur : pile ou face, critiques et griffes.', 270,
    { force: 60, intelligence: 0, chance: 170, agilite: 140, sagesse: 50 }, 1],
  ENIRIPSA: ['🧚', "Soigneur offensif : use l'adversaire, vampirise, draine.", 210,
    { force: 0, intelligence: 140, chance: 120, agilite: 60, sagesse: 120 }, 1],
  IOP: ['⚔️', 'Brute de mêlée : Bond pour coller, Colère pour conclure.', 300,
    { force: 260, intelligence: 60, chance: 0, agilite: 60, sagesse: 60 }, 1],
  CRA: ['🏹', 'Archer feu : crible à 11 cases, recule, ralentit, punit.', 220,
    { force: 0, intelligence: 240, chance: 60, agilite: 120, sagesse: 60 }, 1],
  SADIDA: ['🌱', 'Invocateur végétal : ronces, poupée bloqueuse, feu de brousse.', 260,
    { force: 190, intelligence: 80, chance: 0, agilite: 60, sagesse: 90 }, 1],
  SACRIEUR: ['🩸', 'Berserker : montagne de PV, attire au corps à corps, absorbe.', 420,
    { force: 190, intelligence: 0, chance: 40, agilite: 60, sagesse: 40 }, 1],
  PANDAWA: ['🐼', 'Bagarreur éthylique : souffle, vagues et explosions.', 280,
    { force: 110, intelligence: 160, chance: 60, agilite: 60, sagesse: 70 }, 1],
};

const NAMES = {
  FECA: 'Féca', OSAMODAS: 'Osamodas', ENUTROF: 'Enutrof', SRAM: 'Sram',
  XELOR: 'Xélor', ECAFLIP: 'Ecaflip', ENIRIPSA: 'Eniripsa', IOP: 'Iop',
  CRA: 'Cra', SADIDA: 'Sadida', SACRIEUR: 'Sacrieur', PANDAWA: 'Pandawa',
};

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
