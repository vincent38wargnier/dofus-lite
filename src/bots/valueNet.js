// Port navigateur du réseau de VALEUR entraîné (featureVersion 3) — copie
// EXACTE des maths de scripts/rl/value_net.cjs (forward, GELU exact via erf)
// et de scripts/rl/encoder.cjs (encodeSampleV3). Zéro dépendance moteur: tout
// se lit depuis la vue. La parité bit-à-bit avec les originaux est verrouillée
// par src/__tests__/valueNet.test.js — toute divergence = corruption silencieuse
// du jugement, donc ne modifier AUCUNE constante sans refaire la parité.
// Chargement: buildValueModel(shapes, weightsArrayBuffer) — les poids viennent
// d'un fetch (navigateur) ou de fs (tests Node), le module n'en sait rien.

// ---- forward "value-v1" (copie de scripts/rl/value_net.cjs) ---------------

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
const gelu = (x) => 0.5 * x * (1 + erf(x / Math.SQRT2));

function readLayers(shapes, raw) {
  const layers = {};
  let off = 0;
  for (const spec of shapes.layers) {
    const size = spec.shape.reduce((a, b) => a * b, 1);
    const W = new Float32Array(raw.buffer, raw.byteOffset + off, size);
    off += size * 4;
    const b = new Float32Array(raw.buffer, raw.byteOffset + off, spec.shape[0]);
    off += spec.shape[0] * 4;
    layers[spec.name] = { W, b, shape: spec.shape };
  }
  if (off !== raw.byteLength) throw new Error(`weights: ${raw.byteLength} octets, lu ${off}`);
  return layers;
}

function linear(layer, x, out, activate) {
  const [nout, nin] = layer.shape;
  const { W, b } = layer;
  for (let o = 0; o < nout; o++) {
    let s = b[o];
    const base = o * nin;
    for (let i = 0; i < nin; i++) s += W[base + i] * x[i];
    out[o] = activate ? gelu(s) : s;
  }
  return out;
}

function conv2d(layer, x, out, H, W2, activate) {
  const cells = H * W2;
  const [nout, nin, k] = layer.shape;
  const pad = (k - 1) >> 1;
  const { W: Wt, b } = layer;
  for (let o = 0; o < nout; o++) {
    for (let y = 0; y < H; y++) {
      for (let xx = 0; xx < W2; xx++) {
        let s = b[o];
        for (let i = 0; i < nin; i++) {
          const wBase = (o * nin + i) * k * k;
          const cBase = i * cells;
          for (let ky = 0; ky < k; ky++) {
            const sy = y + ky - pad;
            if (sy < 0 || sy >= H) continue;
            for (let kx = 0; kx < k; kx++) {
              const sx = xx + kx - pad;
              if (sx < 0 || sx >= W2) continue;
              s += Wt[wBase + ky * k + kx] * x[cBase + sy * W2 + sx];
            }
          }
        }
        out[o * cells + y * W2 + xx] = activate ? gelu(s) : s;
      }
    }
  }
  return out;
}

// weightsBytes: Uint8Array (ou Buffer) sur le contenu de weights.bin.
export function buildValueModel(shapes, weightsBytes) {
  if (shapes.arch !== 'value-v1') throw new Error(`arch inattendue: ${shapes.arch}`);
  const raw = weightsBytes instanceof Uint8Array ? weightsBytes : new Uint8Array(weightsBytes);
  const L = readLayers(shapes, raw);
  const { n: NP, h: H, w: W2 } = shapes.planes;
  const cells = H * W2;
  const planeDim = NP * cells;
  const ch = shapes.ch;
  const gdim = shapes.gdim;
  const b1 = new Float32Array(ch * cells);
  const b2 = new Float32Array(ch * cells);
  const pooled = new Float32Array(ch);
  const g128 = new Float32Array(128);
  const g = new Float32Array(gdim);
  const cat = new Float32Array(ch + gdim);
  const hid = new Float32Array(128);
  const out1 = new Float32Array(1);
  const forward = (obs) => {
    conv2d(L.conv1, obs.subarray(0, planeDim), b1, H, W2, true);
    conv2d(L.conv2, b1, b2, H, W2, true);
    conv2d(L.conv3, b2, b1, H, W2, true);
    for (let c = 0; c < ch; c++) {
      let s = 0;
      const base = c * cells;
      for (let i = 0; i < cells; i++) s += b1[base + i];
      pooled[c] = s / cells;
    }
    linear(L.g1, obs.subarray(planeDim), g128, true);
    linear(L.g2, g128, g, true);
    cat.set(pooled, 0);
    cat.set(g, ch);
    linear(L.h1, cat, hid, true);
    linear(L.h2, hid, out1, false);
    return Math.tanh(out1[0]);
  };
  return { shapes, forward };
}

// ---- encodeur V3 (copie de scripts/rl/encoder.cjs, chemin fv3 seul) -------

const MAX_W = 15;
const MAX_H = 14;
const CELLS = MAX_W * MAX_H;
const ALLY_SLOTS = 5;
const ENEMY_SLOTS = 6;
const N_PLANES = 7;

const CLASS_LIST = ['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP',
  'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA'];
const ELEMENTS = ['neutre', 'terre', 'feu', 'eau', 'air'];
const TARGET_MODES = ['enemy', 'ally', 'fighter', 'freeCell', 'cell', 'self'];

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

const FIGHTER_EFFECT_BUCKETS = ['buff:pa', 'buff:pm', 'buff:power', 'buff:range', 'buff:other',
  'armor', 'state', 'apPoison', 'damageOnHit', 'regeneration', 'punishment', 'other'];

const F_ENT = 13 + (CLASS_LIST.length + 1) + 5
  + ELEMENTS.length * 2
  + FIGHTER_EFFECT_BUCKETS.length * 2 + 2; // = 67
const F_SPELL = 15 + ELEMENTS.length + (TARGET_MODES.length + 1)
  + EFFECT_GROUP_LIST.length * 2 + 2; // = 75
const N_GLOBAL = 8;

const F_ENT_V2 = F_ENT + FIGHTER_EFFECT_BUCKETS.length; // = 79
export const FEATURE_VERSION_V3 = 3;
const SPELL_SLOTS_V3 = 24; // par camp; slot 23 = arme
const F_SPELL_V3 = F_SPELL + 2; // + (boostValue, boostTurns)
export const OBS_DIM_V3 = N_PLANES * CELLS + (1 + ALLY_SLOTS + ENEMY_SLOTS) * F_ENT_V2
  + 2 * SPELL_SLOTS_V3 * F_SPELL_V3 + N_GLOBAL;

const cellIdx = (p) => p.y * MAX_W + p.x;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function mergeSpell(s, catalog) {
  if (!s) return null;
  if (s.effects !== undefined) return s;
  const statics = catalog?.spells?.[`${s.key}:${s.grade}`];
  return statics ? { ...statics, ...s } : s;
}

function effectMagnitudeV3(e) {
  if (typeof e.min === 'number' && typeof e.max === 'number') return Math.abs((e.min + e.max) / 2);
  const p1 = typeof e.p1 === 'number' ? e.p1 : 0;
  const p2 = typeof e.p2 === 'number' && e.p2 >= 0 ? e.p2 : p1; // p2=−1 = sentinelle, pas une borne
  return Math.abs((p1 + p2) / 2);
}

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

function writeSpellV3(out, base, spell, owner) {
  out[base + 0] = 1;
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

export function encodeSampleV3({ view, board }, catalog, out) {
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
  for (let i = 0; i < Math.min(spells.length, SPELL_SLOTS_V3 - 1); i++) {
    writeSpellV3(out, base + i * F_SPELL_V3, spells[i], you);
  }
  const weapon = mergeSpell(you.weaponSpell, catalog);
  if (weapon) writeSpellV3(out, base + (SPELL_SLOTS_V3 - 1) * F_SPELL_V3, weapon, you);
  base += SPELL_SLOTS_V3 * F_SPELL_V3;

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

// ---- juge prêt à brancher dans searchBrain --------------------------------
// netV(state, meId, counters) → V ∈ [−1,1] du point de vue de meId.
// getView est injecté pour garder ce module 100% pur (testable partout).
export function makeStateEvaluator(model, getView) {
  if (model.shapes.featureVersion !== FEATURE_VERSION_V3) {
    throw new Error(`featureVersion ${model.shapes.featureVersion} ≠ ${FEATURE_VERSION_V3}`);
  }
  if (model.shapes.obsDim !== OBS_DIM_V3) {
    throw new Error(`obsDim ${model.shapes.obsDim} ≠ encodeur V3 (${OBS_DIM_V3})`);
  }
  const buf = new Float32Array(OBS_DIM_V3);
  return (state, meId, counters) => {
    const view = getView(state, meId);
    encodeSampleV3({ view, board: view.board }, null, buf);
    if (counters) counters.applies++;
    return model.forward(buf);
  };
}
