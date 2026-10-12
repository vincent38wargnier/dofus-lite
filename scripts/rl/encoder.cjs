// Encodeur vue → tenseur, UNIQUE source de vérité (featureVersion 1).
// Utilisé par encode_dataset.cjs (entraînement) ET par le bot d'inférence —
// le même code trace les mêmes features, donc pas de drift Python/JS.
//
// Observation (Float32, obsDim fixe):
//   [planes 7×210] obstacles move/los, occupation alliée/ennemie, hazards
//                  (tous / à moi), position de « you » (one-hot)
//   [12 jetons combattants × F_ENT] you + 5 alliés + 6 ennemis
//   [24 jetons sorts × F_SPELL]     le kit de « you » (slot 23 = arme)
//   [globals]
//
// Actions (index plat, actionDim = 1 + 210 + 24×210 = 5251):
//   0 = PASS ; 1+cell = MOVE ; 211 + slot×210 + cell = CAST.
// Une cell = y*15 + x (cartes paddées à 15×14).

const MAX_W = 15;
const MAX_H = 14;
const CELLS = MAX_W * MAX_H;
const ALLY_SLOTS = 5;
const ENEMY_SLOTS = 6;
const SPELL_SLOTS = 24; // slot 23 réservé à l'arme équipée
const WEAPON_SLOT = SPELL_SLOTS - 1;
const N_PLANES = 7;

const CLASS_LIST = ['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP',
  'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA'];
const ELEMENTS = ['neutre', 'terre', 'feu', 'eau', 'air'];
const TARGET_MODES = ['enemy', 'ally', 'fighter', 'freeCell', 'cell', 'self'];

// Groupes de kinds d'effets de sorts (vocabulaire figé; le reste → 'other').
const EFFECT_GROUPS = {
  damage: ['damage', 'fixedLifeSteal', 'punitionDamage', 'punishment', 'erosion', 'kill'],
  lifeSteal: ['lifeSteal'],
  heal: ['heal', 'fixedHeal', 'lifeTransfer', 'regeneration', 'revive'],
  buffPa: ['buffPa', 'refundPa'],
  buffPm: ['buffPm'],
  removePa: ['removePa', 'debuffPa', 'apPoison'],
  removePm: ['removePm', 'debuffPm'],
  buffStat: ['buffStat', 'buffPower', 'buffDamage', 'buffCrit', 'buffVitality', 'buffRange', 'resistBuff', 'resistAllBuff'],
  debuffStat: ['debuffStat', 'debuffRange', 'resistDebuff', 'stealStat'],
  armor: ['armor'],
  push: ['push'],
  pull: ['pull'],
  moveSelf: ['teleport', 'swap', 'swapAlly', 'rollback', 'fear'],
  trap: ['trap'],
  glyph: ['glyph'],
  summon: ['summon', 'staticSummon', 'double'],
  invisibility: ['invisibility'],
  damageOnHit: ['damageOnHit'],
  delayedSpell: ['delayedSpell'],
  dispel: ['dispel', 'removeState'],
  carryThrow: ['carry', 'throw'],
  state: ['state'],
  other: [],
};
const EFFECT_GROUP_LIST = Object.keys(EFFECT_GROUPS);
const KIND_TO_GROUP = {};
for (const [group, kinds] of Object.entries(EFFECT_GROUPS)) {
  for (const k of kinds) KIND_TO_GROUP[k] = group;
}

// Effets ACTIFS sur un combattant (f.effects) → buckets (valeur, tours).
const FIGHTER_EFFECT_BUCKETS = ['buff:pa', 'buff:pm', 'buff:power', 'buff:range', 'buff:other',
  'armor', 'state', 'apPoison', 'damageOnHit', 'regeneration', 'punishment', 'other'];

const F_ENT = 13 /* scalaires */ + (CLASS_LIST.length + 1) + 5 /* stats */
  + ELEMENTS.length * 2 /* résistances % et fixes */
  + FIGHTER_EFFECT_BUCKETS.length * 2 + 2 /* carried/carrying */; // = 67
const F_SPELL = 15 + ELEMENTS.length + (TARGET_MODES.length + 1)
  + EFFECT_GROUP_LIST.length * 2 + 2; // = 75
const N_GLOBAL = 8;

const OBS_DIM = N_PLANES * CELLS + (1 + ALLY_SLOTS + ENEMY_SLOTS) * F_ENT
  + SPELL_SLOTS * F_SPELL + N_GLOBAL;
const ACTION_DIM = 1 + CELLS + SPELL_SLOTS * CELLS;

const cellIdx = (p) => p.y * MAX_W + p.x;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Un sort « slim » (dataset) n'a que les champs dynamiques; on le recolle à
// ses statiques du catalogue. Une vue live est déjà complète.
function mergeSpell(s, catalog) {
  if (!s) return null;
  if (s.effects !== undefined) return s;
  const statics = catalog?.spells?.[`${s.key}:${s.grade}`];
  return statics ? { ...statics, ...s } : s;
}

function effectMagnitude(e) {
  const p1 = typeof e.p1 === 'number' ? e.p1 : 0;
  const p2 = typeof e.p2 === 'number' ? e.p2 : p1;
  return Math.abs((p1 + p2) / 2);
}

function writeEntity(out, base, f, you) {
  out[base + 0] = 1; // present
  out[base + 1] = f.id === you.id ? 1 : 0;
  out[base + 2] = f.pos.x / (MAX_W - 1);
  out[base + 3] = f.pos.y / (MAX_H - 1);
  out[base + 4] = f.maxHp > 0 ? clamp01(f.hp / f.maxHp) : 0;
  out[base + 5] = clamp01(f.hp / 3000);
  out[base + 6] = clamp01(f.maxHp / 3000);
  out[base + 7] = clamp01(f.pa / 12);
  out[base + 8] = clamp01(f.pm / 8);
  out[base + 9] = f.team === you.team ? 1 : 0;
  out[base + 10] = f.isSummon ? 1 : 0;
  out[base + 11] = f.hidden ? 1 : 0;
  out[base + 12] = clamp01((f.level || 0) / 200);
  let o = base + 13;
  const ci = CLASS_LIST.indexOf(f.classId);
  out[o + (ci >= 0 ? ci : CLASS_LIST.length)] = 1; // dernier slot: monstre/inconnu
  o += CLASS_LIST.length + 1;
  const stats = f.stats || {};
  for (const k of ['force', 'intelligence', 'chance', 'agilite', 'sagesse']) {
    out[o++] = clamp01((stats[k] || 0) / 800);
  }
  const res = f.resistances || {};
  const resFixed = f.resistancesFixed || {};
  for (const el of ELEMENTS) out[o++] = clamp01((res[el] || 0) / 50);
  for (const el of ELEMENTS) out[o++] = clamp01((resFixed[el] || 0) / 100);
  // Buckets d'effets actifs: (somme des valeurs normalisée, max tours restants).
  const buckets = {};
  for (const e of f.effects || []) {
    let key = e.kind === 'buff' ? `buff:${['pa', 'pm', 'power', 'range'].includes(e.stat) ? e.stat : 'other'}` : e.kind;
    if (!FIGHTER_EFFECT_BUCKETS.includes(key)) key = 'other';
    const b = buckets[key] ||= { value: 0, turns: 0 };
    b.value += Math.abs(e.value || 0);
    b.turns = Math.max(b.turns, Math.min(e.turnsLeft || 0, 10));
  }
  for (const key of FIGHTER_EFFECT_BUCKETS) {
    out[o++] = clamp01((buckets[key]?.value || 0) / 300);
    out[o++] = (buckets[key]?.turns || 0) / 10;
  }
  out[o++] = f.carriedBy ? 1 : 0;
  out[o++] = f.carrying ? 1 : 0;
}

function writeSpell(out, base, spell) {
  out[base + 0] = 1; // present
  out[base + 1] = clamp01((spell.pa || 0) / 8);
  out[base + 2] = clamp01((spell.range?.[0] || 0) / (MAX_W - 1));
  out[base + 3] = clamp01((spell.range?.[1] || 0) / (MAX_W - 1));
  out[base + 4] = spell.adjustableRange ? 1 : 0;
  out[base + 5] = clamp01((spell.cooldownLeft || 0) / 5);
  out[base + 6] = (spell.cooldownLeft || 0) > 0 ? 1 : 0;
  out[base + 7] = clamp01(Math.min(spell.usesLeft ?? 99, 3) / 3);
  out[base + 8] = (spell.usesLeft ?? 99) >= 99 ? 1 : 0;
  out[base + 9] = clamp01((spell.usesPerTurn || 0) / 3);
  out[base + 10] = clamp01((spell.critRate || 0) / 100);
  out[base + 11] = clamp01((spell.failRate || 0) / 100);
  out[base + 12] = spell.needsLos ? 1 : 0;
  out[base + 13] = spell.lineOnly ? 1 : 0;
  out[base + 14] = spell.isWeapon ? 1 : 0;
  let o = base + 15;
  const ei = ELEMENTS.indexOf(spell.element);
  if (ei >= 0) out[o + ei] = 1;
  o += ELEMENTS.length;
  const ti = TARGET_MODES.indexOf(spell.targetMode);
  out[o + (ti >= 0 ? ti : TARGET_MODES.length)] = 1;
  o += TARGET_MODES.length + 1;
  const groups = {};
  let hasZone = 0;
  for (const e of spell.effects || []) {
    const g = KIND_TO_GROUP[e.kind] || 'other';
    groups[g] = Math.max(groups[g] || 0, effectMagnitude(e));
    if (e.zone) hasZone = 1;
  }
  for (const g of EFFECT_GROUP_LIST) {
    out[o++] = groups[g] !== undefined ? 1 : 0;
    out[o++] = clamp01((groups[g] || 0) / 200);
  }
  out[o++] = hasZone;
  out[o++] = clamp01((spell.flatDamage || 0) / 100);
}

// sample = { view, board } — board: vue live → view.board,
// dataset → catalog.maps[row.map]. catalog requis pour les sorts slim.
function encodeSample({ view, board }, catalog, out) {
  out.fill(0);
  const you = view.you;
  const W = board.width;
  const H = board.height;
  // Planes.
  for (const ob of board.obstacles || []) {
    const c = ob.y * MAX_W + ob.x;
    if (ob.blocksMove) out[c] = 1;
    if (ob.blocksLos) out[CELLS + c] = 1;
  }
  const occAlly = 2 * CELLS;
  const occEnemy = 3 * CELLS;
  for (const f of [you, ...view.allies]) if (f.hp > 0) out[occAlly + cellIdx(f.pos)] = 1;
  for (const f of view.enemies) if (f.hp > 0 && !f.hidden) out[occEnemy + cellIdx(f.pos)] = 1;
  for (const h of view.hazards || []) {
    for (const c of h.cells || [h.center].filter(Boolean)) {
      out[4 * CELLS + cellIdx(c)] = 1;
      if (h.owner === you.id || h.team === you.team) out[5 * CELLS + cellIdx(c)] = 1;
    }
  }
  out[6 * CELLS + cellIdx(you.pos)] = 1;

  // Jetons combattants: you, alliés (tri par id), ennemis (tri par id).
  let base = N_PLANES * CELLS;
  writeEntity(out, base, you, you);
  base += F_ENT;
  const sorted = (list) => [...list].filter((f) => f.hp > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  const allies = sorted(view.allies);
  for (let i = 0; i < ALLY_SLOTS; i++, base += F_ENT) {
    if (allies[i]) writeEntity(out, base, allies[i], you);
  }
  const enemies = sorted(view.enemies);
  for (let i = 0; i < ENEMY_SLOTS; i++, base += F_ENT) {
    if (enemies[i]) writeEntity(out, base, enemies[i], you);
  }

  // Jetons sorts.
  const spells = (you.spells || []).map((s) => mergeSpell(s, catalog));
  for (let i = 0; i < Math.min(spells.length, SPELL_SLOTS - 1); i++) {
    writeSpell(out, base + i * F_SPELL, spells[i]);
  }
  const weapon = mergeSpell(you.weaponSpell, catalog);
  if (weapon) writeSpell(out, base + WEAPON_SLOT * F_SPELL, weapon);
  base += SPELL_SLOTS * F_SPELL;

  // Globals.
  out[base + 0] = view.maxTurns ? clamp01(view.turn / view.maxTurns) : 0;
  out[base + 1] = you.team === 'A' ? 1 : 0;
  out[base + 2] = allies.length / ALLY_SLOTS;
  out[base + 3] = enemies.length / ENEMY_SLOTS;
  out[base + 4] = Math.max(0, enemies.length - ENEMY_SLOTS) / 4;
  out[base + 5] = W / MAX_W;
  out[base + 6] = H / MAX_H;
  out[base + 7] = clamp01((view.hazards || []).length / 5);
  return out;
}

// Action → index plat (ou -1 si non encodable: sort hors kit, cible absente).
function actionToLabel(act, view) {
  if (!act || act.type === 'PASS') return 0;
  if (act.type === 'MOVE') {
    if (!act.to) return -1;
    return 1 + cellIdx(act.to);
  }
  if (act.type === 'CAST') {
    let slot = (view.you.spells || []).findIndex((s) => s.key === act.spell);
    if (slot >= SPELL_SLOTS - 1) return -1;
    if (slot < 0) {
      if (view.you.weaponSpell?.key === act.spell) slot = WEAPON_SLOT;
      else return -1;
    }
    const target = act.target || view.you.pos;
    return 1 + CELLS + slot * CELLS + cellIdx(target);
  }
  return -1;
}

// Index plat → action jouable (pour l'inférence).
function labelToAction(label, view) {
  if (label <= 0) return { type: 'PASS' };
  if (label <= CELLS) {
    const c = label - 1;
    return { type: 'MOVE', to: { x: c % MAX_W, y: Math.floor(c / MAX_W) } };
  }
  const rest = label - 1 - CELLS;
  const slot = Math.floor(rest / CELLS);
  const c = rest % CELLS;
  const spell = slot === WEAPON_SLOT ? view.you.weaponSpell : (view.you.spells || [])[slot];
  if (!spell) return { type: 'PASS' };
  return { type: 'CAST', spell: spell.key, target: { x: c % MAX_W, y: Math.floor(c / MAX_W) } };
}


// ======================= featureVersion 2 =======================
// Corrige deux trous prouvés de la v1 (revue externe 2026-10-11):
// 1) effets actifs en |abs| → un buff +40 et un débuff −40 étaient identiques;
//    v2 sépare sommes positives et négatives par bucket (+12 features/entité).
// 2) sorts ENNEMIS absents → prêt/en-cooldown/portée effective invisibles;
//    v2 encode le kit du leader ennemi (12 jetons, mêmes features writeSpell,
//    portée déjà effective dans la vue: bonus/malus de PO visibles).
// La v1 reste intacte (Synapse/BC/PPO la consomment, parité testée).
const FEATURE_VERSION_V2 = 2;
const F_ENT_V2 = F_ENT + FIGHTER_EFFECT_BUCKETS.length; // = 79
const ENEMY_SPELL_SLOTS = 12;
const OBS_DIM_V2 = N_PLANES * CELLS + (1 + ALLY_SLOTS + ENEMY_SLOTS) * F_ENT_V2
  + (SPELL_SLOTS + ENEMY_SPELL_SLOTS) * F_SPELL + N_GLOBAL;

function writeEntityV2(out, base, f, you) {
  out[base + 0] = 1;
  out[base + 1] = f.id === you.id ? 1 : 0;
  out[base + 2] = f.pos.x / (MAX_W - 1);
  out[base + 3] = f.pos.y / (MAX_H - 1);
  out[base + 4] = f.maxHp > 0 ? clamp01(f.hp / f.maxHp) : 0;
  out[base + 5] = clamp01(f.hp / 3000);
  out[base + 6] = clamp01(f.maxHp / 3000);
  out[base + 7] = clamp01(f.pa / 12);
  out[base + 8] = clamp01(f.pm / 8);
  out[base + 9] = f.team === you.team ? 1 : 0;
  out[base + 10] = f.isSummon ? 1 : 0;
  out[base + 11] = f.hidden ? 1 : 0;
  out[base + 12] = clamp01((f.level || 0) / 200);
  let o = base + 13;
  const ci = CLASS_LIST.indexOf(f.classId);
  out[o + (ci >= 0 ? ci : CLASS_LIST.length)] = 1;
  o += CLASS_LIST.length + 1;
  const stats = f.stats || {};
  for (const k of ['force', 'intelligence', 'chance', 'agilite', 'sagesse']) {
    out[o++] = clamp01((stats[k] || 0) / 800);
  }
  const res = f.resistances || {};
  const resFixed = f.resistancesFixed || {};
  for (const el of ELEMENTS) out[o++] = clamp01((res[el] || 0) / 50);
  for (const el of ELEMENTS) out[o++] = clamp01((resFixed[el] || 0) / 100);
  // Buckets SIGNÉS: (somme positive, somme négative, tours max).
  const buckets = {};
  for (const e of f.effects || []) {
    let key = e.kind === 'buff' ? `buff:${['pa', 'pm', 'power', 'range'].includes(e.stat) ? e.stat : 'other'}` : e.kind;
    if (!FIGHTER_EFFECT_BUCKETS.includes(key)) key = 'other';
    const b = buckets[key] ||= { pos: 0, neg: 0, turns: 0 };
    const v = e.value || 0;
    if (v >= 0) b.pos += v; else b.neg += -v;
    b.turns = Math.max(b.turns, Math.min(e.turnsLeft || 0, 10));
  }
  for (const key of FIGHTER_EFFECT_BUCKETS) {
    out[o++] = clamp01((buckets[key]?.pos || 0) / 300);
    out[o++] = clamp01((buckets[key]?.neg || 0) / 300);
    out[o++] = (buckets[key]?.turns || 0) / 10;
  }
  out[o++] = f.carriedBy ? 1 : 0;
  out[o++] = f.carrying ? 1 : 0;
}

function encodeSampleV2({ view, board }, catalog, out) {
  out.fill(0);
  const you = view.you;
  const W = board.width;
  const H = board.height;
  for (const ob of board.obstacles || []) {
    const c = ob.y * MAX_W + ob.x;
    if (ob.blocksMove) out[c] = 1;
    if (ob.blocksLos) out[CELLS + c] = 1;
  }
  const occAlly = 2 * CELLS;
  const occEnemy = 3 * CELLS;
  for (const f of [you, ...view.allies]) if (f.hp > 0) out[occAlly + cellIdx(f.pos)] = 1;
  for (const f of view.enemies) if (f.hp > 0 && !f.hidden) out[occEnemy + cellIdx(f.pos)] = 1;
  for (const h of view.hazards || []) {
    for (const c of h.cells || [h.center].filter(Boolean)) {
      out[4 * CELLS + cellIdx(c)] = 1;
      if (h.owner === you.id || h.team === you.team) out[5 * CELLS + cellIdx(c)] = 1;
    }
  }
  out[6 * CELLS + cellIdx(you.pos)] = 1;

  let base = N_PLANES * CELLS;
  writeEntityV2(out, base, you, you);
  base += F_ENT_V2;
  const sorted = (list) => [...list].filter((f) => f.hp > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  const allies = sorted(view.allies);
  for (let i = 0; i < ALLY_SLOTS; i++, base += F_ENT_V2) {
    if (allies[i]) writeEntityV2(out, base, allies[i], you);
  }
  const enemies = sorted(view.enemies);
  for (let i = 0; i < ENEMY_SLOTS; i++, base += F_ENT_V2) {
    if (enemies[i]) writeEntityV2(out, base, enemies[i], you);
  }

  const spells = (you.spells || []).map((sp) => mergeSpell(sp, catalog));
  for (let i = 0; i < Math.min(spells.length, SPELL_SLOTS - 1); i++) {
    writeSpell(out, base + i * F_SPELL, spells[i]);
  }
  const weapon = mergeSpell(you.weaponSpell, catalog);
  if (weapon) writeSpell(out, base + WEAPON_SLOT * F_SPELL, weapon);
  base += SPELL_SLOTS * F_SPELL;

  // Jetons sorts ENNEMIS (leader): readiness/cooldown/portée effective.
  const enemyKit = ((view.enemy && view.enemy.spells) || []).map((sp) => mergeSpell(sp, catalog));
  for (let i = 0; i < Math.min(enemyKit.length, ENEMY_SPELL_SLOTS - 1); i++) {
    writeSpell(out, base + i * F_SPELL, enemyKit[i]);
  }
  const enemyWeapon = view.enemy ? mergeSpell(view.enemy.weaponSpell, catalog) : null;
  if (enemyWeapon) writeSpell(out, base + (ENEMY_SPELL_SLOTS - 1) * F_SPELL, enemyWeapon);
  base += ENEMY_SPELL_SLOTS * F_SPELL;

  out[base + 0] = view.maxTurns ? clamp01(view.turn / view.maxTurns) : 0;
  out[base + 1] = you.team === 'A' ? 1 : 0;
  out[base + 2] = allies.length / ALLY_SLOTS;
  out[base + 3] = enemies.length / ENEMY_SLOTS;
  out[base + 4] = Math.max(0, enemies.length - ENEMY_SLOTS) / 4;
  out[base + 5] = W / MAX_W;
  out[base + 6] = H / MAX_H;
  out[base + 7] = clamp01((view.hazards || []).length / 5);
  return out;
}

// ======================= featureVersion 3 =======================
// Corrige les trous V2 prouvés par l'audit expert (F05):
// 1) 12 slots ennemis pour 21 sorts CRA → 10 sorts ennemis INVISIBLES
//    (tir_puissant, harcelante, cinglante…): v3 = 24 slots par camp (arme au
//    slot 23, symétrique au kit propre) — le kit entier tient.
// 2) magnitude d'effet sur p1/p2 bruts (p2=−1 sentinelle) → min/max
//    normalisés du moteur quand présents, sentinelle gardée sinon.
// 3) identité du sort boosté: chaque jeton sort porte (valeur, tours) des
//    spellBoost actifs de SON porteur qui le ciblent (e.boostSpell === id).
// V1/V2 restent intactes (modèles existants, parité testée).
const FEATURE_VERSION_V3 = 3;
const SPELL_SLOTS_V3 = 24; // par camp; slot 23 = arme
const F_SPELL_V3 = F_SPELL + 2; // + (boostValue, boostTurns)
const OBS_DIM_V3 = N_PLANES * CELLS + (1 + ALLY_SLOTS + ENEMY_SLOTS) * F_ENT_V2
  + 2 * SPELL_SLOTS_V3 * F_SPELL_V3 + N_GLOBAL;

function effectMagnitudeV3(e) {
  if (typeof e.min === 'number' && typeof e.max === 'number') return Math.abs((e.min + e.max) / 2);
  const p1 = typeof e.p1 === 'number' ? e.p1 : 0;
  const p2 = typeof e.p2 === 'number' && e.p2 >= 0 ? e.p2 : p1; // p2=−1 = sentinelle, pas une borne
  return Math.abs((p1 + p2) / 2);
}

function writeSpellV3(out, base, spell, owner) {
  out[base + 0] = 1; // present
  out[base + 1] = clamp01((spell.pa || 0) / 8);
  out[base + 2] = clamp01((spell.range?.[0] || 0) / (MAX_W - 1));
  out[base + 3] = clamp01((spell.range?.[1] || 0) / (MAX_W - 1));
  out[base + 4] = spell.adjustableRange ? 1 : 0;
  out[base + 5] = clamp01((spell.cooldownLeft || 0) / 5);
  out[base + 6] = (spell.cooldownLeft || 0) > 0 ? 1 : 0;
  out[base + 7] = clamp01(Math.min(spell.usesLeft ?? 99, 3) / 3);
  out[base + 8] = (spell.usesLeft ?? 99) >= 99 ? 1 : 0;
  out[base + 9] = clamp01((spell.usesPerTurn || 0) / 3);
  out[base + 10] = clamp01((spell.critRate || 0) / 100);
  out[base + 11] = clamp01((spell.failRate || 0) / 100);
  out[base + 12] = spell.needsLos ? 1 : 0;
  out[base + 13] = spell.lineOnly ? 1 : 0;
  out[base + 14] = spell.isWeapon ? 1 : 0;
  let o = base + 15;
  const ei = ELEMENTS.indexOf(spell.element);
  if (ei >= 0) out[o + ei] = 1;
  o += ELEMENTS.length;
  const ti = TARGET_MODES.indexOf(spell.targetMode);
  out[o + (ti >= 0 ? ti : TARGET_MODES.length)] = 1;
  o += TARGET_MODES.length + 1;
  const groups = {};
  let hasZone = 0;
  for (const e of spell.effects || []) {
    const g = KIND_TO_GROUP[e.kind] || 'other';
    groups[g] = Math.max(groups[g] || 0, effectMagnitudeV3(e));
    if (e.zone) hasZone = 1;
  }
  for (const g of EFFECT_GROUP_LIST) {
    out[o++] = groups[g] !== undefined ? 1 : 0;
    out[o++] = clamp01((groups[g] || 0) / 200);
  }
  out[o++] = hasZone;
  out[o++] = clamp01((spell.flatDamage || 0) / 100);
  // Boost actif ciblant CE sort (identité du sort boosté, audit F05).
  let bv = 0; let bt = 0;
  if (owner && spell.id != null) {
    for (const e of owner.effects || []) {
      if (e.kind === 'spellBoost' && e.boostSpell === spell.id) {
        bv += e.value || 0;
        bt = Math.max(bt, Math.min(e.turnsLeft || 0, 10));
      }
    }
  }
  out[o++] = clamp01(bv / 100);
  out[o++] = bt / 10;
}

function encodeSampleV3({ view, board }, catalog, out) {
  out.fill(0);
  const you = view.you;
  const W = board.width;
  const H = board.height;
  for (const ob of board.obstacles || []) {
    const c = ob.y * MAX_W + ob.x;
    if (ob.blocksMove) out[c] = 1;
    if (ob.blocksLos) out[CELLS + c] = 1;
  }
  const occAlly = 2 * CELLS;
  const occEnemy = 3 * CELLS;
  for (const f of [you, ...view.allies]) if (f.hp > 0) out[occAlly + cellIdx(f.pos)] = 1;
  for (const f of view.enemies) if (f.hp > 0 && !f.hidden) out[occEnemy + cellIdx(f.pos)] = 1;
  for (const h of view.hazards || []) {
    for (const c of h.cells || [h.center].filter(Boolean)) {
      out[4 * CELLS + cellIdx(c)] = 1;
      if (h.owner === you.id || h.team === you.team) out[5 * CELLS + cellIdx(c)] = 1;
    }
  }
  out[6 * CELLS + cellIdx(you.pos)] = 1;

  let base = N_PLANES * CELLS;
  writeEntityV2(out, base, you, you);
  base += F_ENT_V2;
  const sorted = (list) => [...list].filter((f) => f.hp > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  const allies = sorted(view.allies);
  for (let i = 0; i < ALLY_SLOTS; i++, base += F_ENT_V2) {
    if (allies[i]) writeEntityV2(out, base, allies[i], you);
  }
  const enemies = sorted(view.enemies);
  for (let i = 0; i < ENEMY_SLOTS; i++, base += F_ENT_V2) {
    if (enemies[i]) writeEntityV2(out, base, enemies[i], you);
  }

  // Kit PROPRE: 24 slots, arme au 23.
  const spells = (you.spells || []).map((sp) => mergeSpell(sp, catalog));
  for (let i = 0; i < Math.min(spells.length, SPELL_SLOTS_V3 - 1); i++) {
    writeSpellV3(out, base + i * F_SPELL_V3, spells[i], you);
  }
  const weapon = mergeSpell(you.weaponSpell, catalog);
  if (weapon) writeSpellV3(out, base + (SPELL_SLOTS_V3 - 1) * F_SPELL_V3, weapon, you);
  base += SPELL_SLOTS_V3 * F_SPELL_V3;

  // Kit ENNEMI (leader): 24 slots symétriques — readiness/cooldown/usages/
  // portée effective/boosts de TOUT le kit, plus 11 sorts invisibles (F05).
  const enemyKit = ((view.enemy && view.enemy.spells) || []).map((sp) => mergeSpell(sp, catalog));
  for (let i = 0; i < Math.min(enemyKit.length, SPELL_SLOTS_V3 - 1); i++) {
    writeSpellV3(out, base + i * F_SPELL_V3, enemyKit[i], view.enemy);
  }
  const enemyWeapon = view.enemy ? mergeSpell(view.enemy.weaponSpell, catalog) : null;
  if (enemyWeapon) writeSpellV3(out, base + (SPELL_SLOTS_V3 - 1) * F_SPELL_V3, enemyWeapon, view.enemy);
  base += SPELL_SLOTS_V3 * F_SPELL_V3;

  out[base + 0] = view.maxTurns ? clamp01(view.turn / view.maxTurns) : 0;
  out[base + 1] = you.team === 'A' ? 1 : 0;
  out[base + 2] = allies.length / ALLY_SLOTS;
  out[base + 3] = enemies.length / ENEMY_SLOTS;
  out[base + 4] = Math.max(0, enemies.length - ENEMY_SLOTS) / 4;
  out[base + 5] = W / MAX_W;
  out[base + 6] = H / MAX_H;
  out[base + 7] = clamp01((view.hazards || []).length / 5);
  return out;
}

module.exports = {
  FEATURE_VERSION: 1,
  MAX_W, MAX_H, CELLS, ALLY_SLOTS, ENEMY_SLOTS, SPELL_SLOTS, WEAPON_SLOT,
  N_PLANES, F_ENT, F_SPELL, N_GLOBAL, OBS_DIM, ACTION_DIM,
  FEATURE_VERSION_V2, F_ENT_V2, ENEMY_SPELL_SLOTS, OBS_DIM_V2, encodeSampleV2,
  FEATURE_VERSION_V3, SPELL_SLOTS_V3, F_SPELL_V3, OBS_DIM_V3, encodeSampleV3,
  CLASS_LIST, ELEMENTS, TARGET_MODES, EFFECT_GROUP_LIST,
  encodeSample, actionToLabel, labelToAction, mergeSpell, cellIdx,
};
