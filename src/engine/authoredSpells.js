/* global globalThis */
import LIBRARY from './spellLibrary.json';
import { validSpellVisual } from '../visuals/spellVisuals';
import { spellBalance, spellBudgetErrors, MAX_SPELL_SCORE } from './spellBalance';

// Version one deliberately uses declarative effects already handled by combat
// and the generic AI. Visual references never become a spell's mechanical ID.
export const AUTHORING_VERSION = 1;
export const AUTHORED_LEVEL = 200;
export const EFFECT_TYPES = {
  damage: { label: 'Dégâts directs', element: true, max: 300, value: 18 },
  lifeSteal: { label: 'Vol de vie', element: true, max: 150, value: 12 },
  heal: { label: 'Soin', max: 150, value: 15 },
  buffDamage: { label: 'Bonus dommages', timed: true, max: 100, value: 8 },
  buffPower: { label: 'Puissance', timed: true, max: 500, value: 60 },
  buffStat: { label: 'Bonus caractéristique', stat: true, timed: true, max: 500, value: 50 },
  buffPa: { label: 'Bonus PA', timed: true, max: 6, value: 1 },
  buffPm: { label: 'Bonus PM', timed: true, max: 6, value: 1 },
  buffRange: { label: 'Bonus portée', timed: true, max: 6, value: 2 },
  buffCrit: { label: 'Bonus critiques', timed: true, max: 50, value: 5 },
  buffVitality: { label: 'Vitalité temporaire', timed: true, max: 500, value: 100 },
  armor: { label: 'Armure', timed: true, max: 100, value: 8 },
  resistBuff: { label: 'Résistance (%)', element: true, timed: true, max: 50, value: 10 },
  removePa: { label: 'Retrait PA (esquivable)', timed: true, max: 6, value: 1 },
  removePm: { label: 'Retrait PM (esquivable)', timed: true, max: 6, value: 1 },
  debuffRange: { label: 'Malus portée', timed: true, max: 6, value: 2 },
  resistDebuff: { label: 'Vulnérabilité (%)', element: true, timed: true, max: 50, value: 10 },
  push: { label: 'Poussée', movement: true, max: 6, value: 1 },
  pull: { label: 'Attirance', movement: true, max: 6, value: 1 },
  teleport: { label: 'Téléportation', max: 0, value: 0 },
};
export const ELEMENTS = { neutre: 'Neutre', terre: 'Terre', feu: 'Feu', eau: 'Eau', air: 'Air' };
export const EFFECT_STATS = { force: 'Force', intelligence: 'Intelligence', chance: 'Chance', agilite: 'Agilité', sagesse: 'Sagesse' };
export const EFFECT_ZONES = { Pa: 'Une case', Cb: 'Cercle · rayon 1', Cc: 'Cercle · rayon 2',
  Xb: 'Croix · rayon 1', Xc: 'Croix · rayon 2', Lb: 'Ligne · 2 cases', Lc: 'Ligne · 3 cases', Tb: 'Bâton · 3 cases' };
export const EFFECT_RECIPIENTS = { 0: 'Tous (alliés compris)', 1: 'Ennemis', 4: 'Alliés et soi', 6: 'Alliés hors soi', 32: 'Soi uniquement' };
export const SPELL_TARGETS = { enemy: 'Un ennemi', fighter: 'Un combattant', cell: 'Une case (même vide)', freeCell: 'Une case libre', self: 'Soi-même' };
export const isAuthoredSpell = raw => raw?.authoringVersion !== undefined;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const has = (values, key) => Object.prototype.hasOwnProperty.call(values, key);
const copy = value => JSON.parse(JSON.stringify(value));

export function newAuthoredSpellId(existingIds = []) {
  const excluded = new Set(existingIds);
  const random = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(random);
  else random[0] = Math.floor(Math.random() * 4294967296);
  let id = Date.now() * 1000 + random[0] % 1000;
  while (excluded.has(id)) id++;
  return id;
}

export function newAuthoredEffect(kind = 'damage') {
  const type = EFFECT_TYPES[kind];
  return { kind, id: 0, zone: 'Pa', targetMask: kind === 'teleport' || kind.startsWith('buff') || kind === 'armor' || kind === 'resistBuff' ? 32 : kind === 'heal' ? 4 : 1,
    min: type.value, max: type.value, duration: type.timed ? 1 : 0, chance: 0,
    p1: type.value, p2: type.value, p3: 0,
    ...(type.element ? { element: 'feu' } : {}), ...(type.stat ? { stat: 'intelligence' } : {}) };
}

export function newAuthoredSpell(existingIds = [], preset = 'attack') {
  const id = newAuthoredSpellId(existingIds);
  const spell = { authoringVersion: AUTHORING_VERSION, id, key: `custom_${id}`, name: 'Nouveau sort', description: '',
    grade: 6, requiredLevel: AUTHORED_LEVEL, emoji: '✨', visualSpellId: 161,
    pa: 3, rangeMin: 1, rangeMax: 6, targetMode: 'enemy', needsLos: true, lineOnly: false,
    emptyCellOnly: false, adjustableRange: false, maxPerTurn: 2, maxPerTarget: 2, cooldown: 0,
    initialCooldown: 0, critRate: 0, failRate: 0, endsTurnOnFailure: false,
    requiredStates: [], forbiddenStates: [1, 3, 18, 19, 41], effects: [newAuthoredEffect()], critEffects: [] };
  if (preset === 'heal') Object.assign(spell, { targetMode: 'fighter', rangeMin: 0, rangeMax: 4, visualSpellId: 121, effects: [newAuthoredEffect('heal')] });
  if (preset === 'boost') Object.assign(spell, { targetMode: 'self', rangeMin: 0, rangeMax: 0, visualSpellId: 153,
    pa: 2, maxPerTurn: 1, maxPerTarget: 1, cooldown: 3, effects: [newAuthoredEffect('buffPower')] });
  if (preset === 'debuff') Object.assign(spell, { pa: 2, maxPerTurn: 1, maxPerTarget: 1, visualSpellId: 50, effects: [newAuthoredEffect('removePm')] });
  if (preset === 'teleport') Object.assign(spell, { pa: 4, rangeMax: 4, targetMode: 'freeCell', emptyCellOnly: true,
    maxPerTurn: 1, maxPerTarget: 1, cooldown: 3, visualSpellId: 142, effects: [newAuthoredEffect('teleport')] });
  return normalizeAuthoredSpell(spell);
}

// Only redundant engine fields are derived. User mistakes remain visible and
// are rejected, rather than being silently clamped into a different spell.
export function normalizeAuthoredSpell(raw) {
  const normalize = effect => ({ ...effect, p1: effect.kind === 'teleport' ? raw.rangeMax : effect.min,
    p2: effect.max, p3: 0, id: 0, chance: 0 });
  return { ...raw, name: raw.name.trim(), description: raw.description.trim(),
    emptyCellOnly: raw.targetMode === 'freeCell',
    effects: raw.effects.map(normalize), critEffects: raw.critEffects.map(normalize) };
}

export function duplicateAuthoredSpell(raw, existingIds) {
  const id = newAuthoredSpellId(existingIds);
  return { ...copy(raw), id, key: `custom_${id}`, name: `${raw.name.slice(0, 70)} — copie` };
}

export function authoredSpellErrors(raw, { forStorage = false } = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return ['Sort créé invalide.'];
  const check = (valid, message) => { if (!valid) errors.push(message); };
  check(raw.authoringVersion === AUTHORING_VERSION, 'Version du sort non prise en charge.');
  check(integer(raw.id, 1000000000000, Number.MAX_SAFE_INTEGER) && raw.key === `custom_${raw.id}`, 'Identité du sort invalide.');
  check(typeof raw.name === 'string' && raw.name.trim().length >= 1 && raw.name.length <= 80, 'Donnez un nom au sort (80 caractères maximum).');
  check(typeof raw.description === 'string' && raw.description.length <= 800, 'Description : 800 caractères maximum.');
  check(raw.grade === 6 && raw.requiredLevel === AUTHORED_LEVEL, 'Les nouveaux sorts utilisent le grade 6 au niveau 200.');
  check(raw.visualEffect != null ? validSpellVisual(raw.visualEffect)
    : integer(raw.visualSpellId, 1, 1000000) && !!LIBRARY.spells[raw.visualSpellId], 'Choisissez un visuel valide (animation originale ou catalogue).');
  check(integer(raw.pa, 1, 8), 'Coût : de 1 à 8 PA.');
  check(integer(raw.rangeMin, 0, 12) && integer(raw.rangeMax, 0, 12) && raw.rangeMin <= raw.rangeMax, 'Portée : de 0 à 12, avec minimum ≤ maximum.');
  check(has(SPELL_TARGETS, raw.targetMode), 'Choisissez une cible valide.');
  check(raw.targetMode !== 'self' || (raw.rangeMin === 0 && raw.rangeMax === 0), 'Un sort sur soi doit avoir une portée de 0 à 0.');
  check(raw.targetMode === 'self' || raw.rangeMax > 0, 'Une portée maximale de 0 exige un ciblage sur soi.');
  check(raw.targetMode !== 'enemy' || raw.rangeMin >= 1, 'Un sort visant un ennemi commence à 1 PO.');
  for (const field of ['needsLos', 'lineOnly', 'adjustableRange', 'emptyCellOnly', 'endsTurnOnFailure']) check(typeof raw[field] === 'boolean', `Option ${field} invalide.`);
  check(raw.emptyCellOnly === (raw.targetMode === 'freeCell'), 'La condition de case libre doit correspondre au ciblage.');
  check(integer(raw.maxPerTurn, 1, 3), 'Limite : de 1 à 3 lancers par tour.');
  check(integer(raw.maxPerTarget, 0, 3) && raw.maxPerTarget <= raw.maxPerTurn, 'La limite par cible doit être comprise entre 0 et la limite par tour.');
  check(integer(raw.cooldown, 0, 10) && raw.initialCooldown === 0, 'Relance : de 0 à 10 tours, sans relance initiale.');
  check(raw.critRate === 0 || integer(raw.critRate, 2, 100), 'Critique : désactivé ou 1 chance sur 2 à 100.');
  check(raw.failRate === 0 || integer(raw.failRate, 2, 1000), 'Échec critique : désactivé ou 1 chance sur 2 à 1 000.');
  check(Array.isArray(raw.requiredStates) && !raw.requiredStates.length && JSON.stringify(raw.forbiddenStates) === '[1,3,18,19,41]', 'Les conditions d’état ne sont pas modifiables dans cette version.');
  for (const [list, title] of [[raw.effects, 'Effets normaux'], [raw.critEffects, 'Effets critiques']]) {
    const isCritical = title === 'Effets critiques';
    if (!Array.isArray(list)) { errors.push(`${title} : liste invalide.`); continue; }
    check(list.length >= (isCritical && !raw.critRate ? 0 : 1) && list.length <= 4, `${title} : de 1 à 4 effets requis.`);
    if (isCritical && !raw.critRate) check(list.length === 0, 'Désactivez les effets critiques lorsque le critique est désactivé.');
    list.forEach((effect, index) => {
      const prefix = `${title}, effet ${index + 1} : `;
      const type = effect && EFFECT_TYPES[effect.kind];
      if (!type) { errors.push(`${prefix}action non prise en charge.`); return; }
      check(integer(effect.min, effect.kind === 'teleport' ? 0 : 1, type.max) && integer(effect.max, effect.min, type.max), `${prefix}valeurs entre ${effect.kind === 'teleport' ? 0 : 1} et ${type.max}, minimum ≤ maximum.`);
      check(!type.movement || effect.min === effect.max, `${prefix}la distance doit être fixe.`);
      check(integer(effect.duration, 0, type.timed ? 5 : 0), `${prefix}${type.timed ? 'durée de 0 à 5 tours.' : 'effet instantané uniquement.'}`);
      check(has(EFFECT_ZONES, effect.zone) && has(EFFECT_RECIPIENTS, effect.targetMask), `${prefix}zone ou destinataires invalides.`);
      check(!type.element || has(ELEMENTS, effect.element), `${prefix}choisissez un élément.`);
      check(!type.stat || has(EFFECT_STATS, effect.stat), `${prefix}choisissez une caractéristique.`);
      check(effect.id === 0 && effect.chance === 0 && effect.p3 === 0 && effect.p1 === (effect.kind === 'teleport' ? raw.rangeMax : effect.min) && effect.p2 === effect.max,
        `${prefix}paramètres incohérents.`);
      check(!Object.keys(effect).some(key => !['kind', 'id', 'zone', 'targetMask', 'min', 'max', 'duration', 'chance', 'p1', 'p2', 'p3', 'element', 'stat'].includes(key)), `${prefix}paramètre non pris en charge.`);
      if (effect.targetMask === 32) check(effect.zone === 'Pa', `${prefix}un effet sur soi utilise une seule case.`);
      if (effect.kind === 'teleport') check(list.length === 1 && raw.targetMode === 'freeCell' && !raw.adjustableRange && effect.targetMask === 32 && effect.zone === 'Pa', `${prefix}la téléportation doit être seule, sur une case libre, avec une portée fixe.`);
      if (raw.targetMode === 'self' && effect.zone === 'Pa') check([0, 4, 32].includes(effect.targetMask), `${prefix}ces destinataires ne peuvent pas recevoir un effet sur soi.`);
      if (raw.targetMode === 'enemy' && effect.zone === 'Pa') check([0, 1, 32].includes(effect.targetMask), `${prefix}ces destinataires ne correspondent pas à une cible ennemie.`);
      if (raw.targetMode === 'freeCell' && effect.zone === 'Pa' && effect.kind !== 'teleport') check(effect.targetMask === 32, `${prefix}une case libre ne contient aucun combattant. Choisissez une zone ou un autre ciblage.`);
      if (type.movement) check(effect.targetMask !== 32 && raw.targetMode !== 'self', `${prefix}la poussée et l’attirance déplacent un autre combattant.`);
    });
  }
  if (!errors.length && !forStorage) errors.push(...authoredCriticalErrors(raw), ...spellBudgetErrors(raw));
  return [...new Set(errors)];
}

// An authored critical is a stronger variant of the same action. Original
// client spells keep their own special critical mechanics.
export function authoredCriticalErrors(raw) {
  if (!raw.critRate) return [];
  const errors = [];
  if (raw.effects.length !== raw.critEffects.length) errors.push('Le critique doit conserver tous les effets du lancer normal.');
  raw.effects.forEach((effect, index) => {
    const critical = raw.critEffects[index];
    if (!critical) return;
    if (['kind', 'element', 'stat', 'zone', 'targetMask'].some(key => critical[key] !== effect[key])) {
      errors.push(`Critique, effet ${index + 1} : conservez l’action, l’élément, les destinataires et la zone du lancer normal.`);
    }
    if (critical.min < effect.min || critical.max < effect.max || critical.duration < effect.duration) {
      errors.push(`Critique, effet ${index + 1} : les valeurs et la durée ne peuvent pas être inférieures au lancer normal.`);
    }
  });
  return errors;
}

export function alignAuthoredCriticals(raw) {
  if (!raw.critRate) return raw;
  return normalizeAuthoredSpell({ ...raw, critEffects: raw.effects.map((effect, index) => {
    const critical = raw.critEffects[index];
    const same = critical && ['kind', 'element', 'stat', 'zone', 'targetMask'].every(key => critical[key] === effect[key]);
    return { ...effect, min: Math.max(effect.min, same ? critical.min : effect.min),
      max: Math.max(effect.max, same ? critical.max : effect.max), duration: Math.max(effect.duration, same ? critical.duration : effect.duration) };
  }) });
}

// Reviewable repair: only the editor invokes this, never the save reader.
// Keep identity, artwork, targeting and effect order; reduce values first,
// increasing AP only if the minimum values still exceed the budget.
export function rebalanceAuthoredSpell(raw) {
  let original = alignAuthoredCriticals(raw);
  const paGains = [...original.effects, ...original.critEffects].filter(effect => effect.kind === 'buffPa');
  if (paGains.length) original = { ...original, maxPerTurn: 1, maxPerTarget: 1,
    cooldown: Math.max(original.cooldown, ...paGains.map(effect => effect.duration + 1)) };
  const scaled = (factor, pa) => normalizeAuthoredSpell({ ...original, pa,
    ...Object.fromEntries(['effects', 'critEffects'].map(key => [key, original[key].map(effect => {
      if (effect.kind === 'teleport') return { ...effect };
      return { ...effect, min: Math.max(1, Math.floor(effect.min * factor)), max: Math.max(1, Math.floor(effect.max * factor)) };
    })])) });
  for (let pa = raw.pa; pa <= 8; pa++) {
    let low = 0, high = 1;
    const acceptable = candidate => authoredSpellErrors(candidate).length === 0 && spellBalance(candidate).score <= MAX_SPELL_SCORE;
    if (!acceptable(scaled(0, pa))) continue;
    if (acceptable(scaled(1, pa))) return scaled(1, pa);
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (acceptable(scaled(middle, pa))) low = middle; else high = middle;
    }
    return scaled(low, pa);
  }
  return original;
}

export function authoredSpellWarnings(raw, kit = []) {
  const warnings = [];
  const effects = [...raw.effects, ...raw.critEffects];
  const damage = raw.effects.filter(e => ['damage', 'lifeSteal'].includes(e.kind));
  const area = damage.some(e => e.zone !== 'Pa');
  for (const [list, critical] of [[raw.effects, false], [raw.critEffects, true]]) {
    const rows = list.filter(e => ['damage', 'lifeSteal'].includes(e.kind));
    const ratio = rows.reduce((sum, e) => sum + (Number(e.min) + Number(e.max)) / 2, 0) / raw.pa;
    if (ratio > (rows.some(e => e.zone !== 'Pa') ? 5 : raw.rangeMax <= 2 ? 8 : 6)) warnings.push(`${critical ? 'Dégâts critiques' : 'Dégâts bruts'} par PA élevés pour cette portée et cette zone. Prévoyez une contrainte ou une relance.`);
  }
  if (damage.length > 1) warnings.push('Chaque ligne reçoit les dommages fixes : testez ce sort avec un équipement +dommages.');
  if (area && effects.some(e => e.targetMask === 1)) warnings.push('La zone épargne les alliés : cet avantage doit être compensé.');
  if (effects.some(e => e.kind === 'buffPa')) warnings.push('Le gain de PA est immédiat : testez les chaînes de sorts et le cumul avec les autres boosts.');
  if (effects.some(e => e.duration > 0 && e.kind !== 'removePa' && e.kind !== 'removePm' && raw.cooldown <= e.duration)) warnings.push('Les bonus et malus peuvent se cumuler avant leur expiration. Une relance plus longue limite ce cumul.');
  if (effects.some(e => (e.kind === 'buffDamage' && e.max > 10) || (e.kind === 'buffPower' && e.max > 80) || (e.kind === 'buffPm' && e.max > 2))) warnings.push('Boost élevé : vérifiez le gain sur un tour complet, avec équipement.');
  if (effects.some(e => e.kind === 'armor')) warnings.push('L’armure est amplifiée par les caractéristiques du bénéficiaire. Testez-la sur un personnage équipé.');
  if (effects.some(e => e.kind === 'lifeSteal')) warnings.push('Le vol de vie rend la moitié des PV réellement retirés. Il cumule attaque et soin.');
  if (raw.targetMode === 'fighter' && effects.some(e => [4, 6].includes(e.targetMask))) warnings.push('Le lancer accepte aussi une cible ennemie, mais les effets réservés aux alliés ne lui feront rien. Les PA restent dépensés.');
  if (damage.length && kit.some(s => s.id !== raw.id && s.effects?.some(e => ['buffDamage', 'buffPower', 'buffPa', 'buffStat', 'resistDebuff'].includes(e.kind)))) warnings.push('Votre classe possède des boosts ou vulnérabilités : comparez aussi les dégâts après leur application.');
  if (raw.critRate && raw.critEffects.some(e => e.kind === 'teleport') !== raw.effects.some(e => e.kind === 'teleport')) warnings.push('Le critique change le déplacement du lanceur. Vérifiez ce comportement en combat.');
  return warnings;
}
