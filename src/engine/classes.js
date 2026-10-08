// The 12 playable classes of Dofus 1.29, built from the REAL spell data
// (src/engine/spellData.js — AncestraRemake `sorts` + `monsters` tables).
// Numbers are authentic grade values; damage scales with characteristics.

import { REAL_SPELLS, REAL_SUMMONS } from './spellData';

// Display metadata + targeting mode per spell (the dump has no target masks).
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

// Buffs whose duration is 0 in the dump last this many of the owner's turns.
export const DEFAULT_BUFF_TURNS = 2;

// Effets qu'aucune ligne du moteur ne simule: filtrés à la construction.
const isSimulated = (e) => e.kind !== 'ignore' && !e.kind.startsWith('unknown');

function buildSpell(raw) {
  // Les 72 sorts historiques gardent leurs clés/émojis choisis à la main
  // (les bots intégrés et les tests s'y réfèrent); les nouveaux sorts du
  // roster complet utilisent les métadonnées dérivées par l'extracteur.
  const meta = SPELL_META[raw.id] || { key: raw.key, name: raw.name, emoji: raw.emoji, targetMode: raw.targetMode };
  const effects = raw.effects.filter(isSimulated);
  const critEffects = raw.critEffects.filter(isSimulated);
  const main = effects.find((e) => e.kind === 'damage' || e.kind === 'lifeSteal' || e.kind === 'poison');
  return {
    key: meta.key,
    id: raw.id,
    name: meta.name,
    emoji: meta.emoji,
    targetMode: meta.targetMode,
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
    cooldown: raw.cooldown,
    effects,
    critEffects,
  };
}

function buildSpells(classId) {
  const spells = {};
  for (const raw of REAL_SPELLS[classId]) {
    const s = buildSpell(raw);
    // collision de clés dérivées (deux sorts au même nom) → suffixe par id
    if (spells[s.key]) s.key = `${s.key}_${s.id}`;
    spells[s.key] = s;
  }
  return spells;
}

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
    baseHp: BASE_HP + vita,
    basePa: 8,
    basePm: 4,
    stats,
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

// Summons: real monster stats (grade 5) + their real attack spell.
export const SUMMONS = {};
for (const m of Object.values(REAL_SUMMONS)) {
  const atk = m.attack ? {
    key: `atk_${m.key}`,
    id: m.attack.id,
    name: m.attack.name.replace('B?co', 'Béco').replace('D?coupage', 'Découpage'),
    emoji: '🫦',
    targetMode: 'enemy',
    element: (m.attack.effects.find((e) => e.kind === 'damage' || e.kind === 'lifeSteal') || {}).element || null,
    pa: m.attack.pa,
    range: [m.attack.rangeMin, m.attack.rangeMax],
    lineOnly: m.attack.lineOnly,
    needsLos: m.attack.needsLos,
    emptyCellOnly: false,
    critRate: m.attack.critRate,
    failRate: m.attack.failRate,
    endsTurnOnFailure: m.attack.endsTurnOnFailure,
    usesPerTurn: m.attack.maxPerTurn,
    cooldown: m.attack.cooldown,
    effects: m.attack.effects.filter((e) => e.kind !== 'ignore'),
    critEffects: m.attack.critEffects.filter((e) => e.kind !== 'ignore'),
  } : null;
  SUMMONS[m.monsterId] = {
    monsterId: m.monsterId,
    key: m.key,
    name: m.name,
    emoji: m.emoji,
    hp: m.hp,
    pa: m.pa,
    pm: m.pm,
    stats: { ...m.stats },
    spells: atk ? { [atk.key]: atk } : {},
  };
}

export function getSummonSpell(monsterId, spellKey) {
  return SUMMONS[monsterId]?.spells[spellKey] || null;
}
