import { newAuthoredSpell, newAuthoredEffect, normalizeAuthoredSpell, authoredSpellErrors,
  alignAuthoredCriticals, rebalanceAuthoredSpell } from '../engine/authoredSpells';
import { spellBalance, spellbookBalance, spellbookBudgetErrors, classBalanceReference } from '../engine/spellBalance';
import { resolveSpellLoadout } from '../engine/classes';
import { emptyLoadout } from '../engine/equipment';
import { createGame, applyAction } from '../engine/engine';
import { isCustomSpellbookDraft } from '../engine/customSpells';
import { emptyCreations, persistCreations, readCreations } from '../ui/creationsStore';
import { validateContentManifest, packageExample } from '../content/contentPackage';

const edit = (raw, fields) => normalizeAuthoredSpell({ ...raw, ...fields });
const attack = (value = 18, fields = {}) => edit(newAuthoredSpell(), {
  effects: [{ ...newAuthoredEffect(), min: value, max: value }], ...fields });
const loadout = spells => ({ ...emptyLoadout('IOP'), level: 200, base: {}, spells: { custom: spells } });
// Reproduce the saved configuration (not a hand-picked simplified damage line).
const russian = () => attack(150, { name: 'Argent russe', pa: 1, rangeMax: 12, needsLos: false,
  adjustableRange: true, targetMode: 'cell', maxPerTurn: 3, maxPerTarget: 3, critRate: 2,
  effects: [{ ...newAuthoredEffect('lifeSteal'), min: 149, max: 150, zone: 'Cc' },
    ...Array.from({ length: 3 }, () => ({ ...newAuthoredEffect(), min: 149, max: 150 }))],
  critEffects: [newAuthoredEffect()] });

test('the reported normal/critical exploit stays editable but cannot enter combat', () => {
  const raw = russian(), saved = { ...emptyCreations(), characters: [{ id: 'hoty', name: 'Hoty', classId: 'IOP', loadout: loadout([raw]) }] };
  expect(authoredSpellErrors(raw).join(' ')).toMatch(/critique.*score/i);
  expect(spellBalance(raw).score).toBeGreaterThan(1000);
  persistCreations(localStorage, saved);
  expect(readCreations(localStorage)).toEqual({ value: saved, error: '' });
  expect(isCustomSpellbookDraft([raw])).toBe(true);
  expect(resolveSpellLoadout('IOP', loadout([raw])).valid).toBe(false);
  expect(() => createGame({ mapId: 'arene', fighters: [{ id: 'A', classId: 'IOP', loadout: loadout([raw]) }, { id: 'B', classId: 'CRA' }] })).toThrow('score');
});

test.each([
  ['PA cost', s => ({ ...s, pa: 6 }), -1],
  ['cooldown', s => ({ ...s, cooldown: 4 }), -1],
  ['one cast per turn', s => ({ ...s, maxPerTurn: 1, maxPerTarget: 1 }), -1],
  ['one point target per turn', s => ({ ...s, maxPerTarget: 1 }), -1],
  ['line only', s => ({ ...s, lineOnly: true }), -1],
  ['maximum range', s => ({ ...s, rangeMax: 12 }), 1],
  ['no line of sight', s => ({ ...s, needsLos: false }), 1],
  ['adjustable range', s => ({ ...s, adjustableRange: true }), 1],
  ['larger area', s => ({ ...s, effects: s.effects.map(e => ({ ...e, zone: 'Cc' })) }), 1],
  ['life steal', s => ({ ...s, effects: s.effects.map(e => ({ ...e, kind: 'lifeSteal' })) }), 1],
  ['multiple lines and fixed damage', s => ({ ...s, effects: Array(2).fill({ ...s.effects[0], min: 9, max: 9 }) }), 1],
])('%s changes the budget in the correct direction', (_name, change, direction) => {
  const raw = attack();
  expect(Math.sign(spellBalance(change(raw)).score - spellBalance(raw).score)).toBe(direction);
});

test('area aiming cannot buy a per-victim discount using maxPerTarget', () => {
  const raw = attack(15, { targetMode: 'cell', effects: [{ ...newAuthoredEffect(), zone: 'Cc' }] });
  expect(spellBalance({ ...raw, maxPerTarget: 1 }).score).toBe(spellBalance(raw).score);
});

test('a ten-turn cooldown cannot buy unlimited burst and rare criticals cannot hide it', () => {
  const raw = attack(300, { pa: 8, cooldown: 10 });
  expect(authoredSpellErrors(raw).join()).toContain('score');
  const critical = attack(10, { critRate: 100, critEffects: raw.effects });
  expect(authoredSpellErrors(critical).join()).toContain('score');
  expect(spellBalance(critical).score).toBe(spellBalance({ ...critical, critRate: 2 }).score);
});

test('all lines and both variants count, including immediate boosts before damage', () => {
  const raw = attack(), boost = { ...newAuthoredEffect('buffDamage'), min: 8, max: 8, duration: 0 };
  const before = edit(raw, { effects: [boost, ...raw.effects] });
  const after = edit(raw, { effects: [...raw.effects, boost] });
  expect(spellBalance(before).score).toBeGreaterThan(spellBalance(after).score);
  expect(spellBalance(after).score).toBeGreaterThan(spellBalance(raw).score);
  const split = attack(10, { pa: 2, maxPerTurn: 1, maxPerTarget: 1, cooldown: 2, targetMode: 'self', rangeMin: 0, rangeMax: 0,
    effects: Array(2).fill({ ...newAuthoredEffect('buffPa'), min: 1, max: 1, duration: 1 }) });
  expect(authoredSpellErrors(split).join()).toContain('gain total inférieur');
});

test('duration and repeatable stacking spend more budget; PA loops can be repaired', () => {
  const raw = newAuthoredSpell([], 'boost');
  expect(spellBalance(edit(raw, { effects: raw.effects.map(e => ({ ...e, duration: 5 })) })).score).toBeGreaterThan(spellBalance(raw).score);
  expect(spellBalance({ ...raw, cooldown: 0 }).score).toBeGreaterThan(spellBalance(raw).score);
  const loop = edit(raw, { pa: 1, cooldown: 0, effects: [newAuthoredEffect('buffPa')] });
  expect(authoredSpellErrors(loop).length).toBeGreaterThan(0);
  expect(authoredSpellErrors(rebalanceAuthoredSpell(loop))).toEqual([]);
});

test('individually legal PA generators cannot build an unchecked AP engine across ten spell identities', () => {
  const generators = Array.from({ length: 10 }, (_, i) => edit(newAuthoredSpell([], 'boost'), {
    id: 1000000000100 + i, key: `custom_${1000000000100 + i}`,
    pa: 2, cooldown: 2, effects: [newAuthoredEffect('buffPa')],
  }));
  expect(generators.every(s => authoredSpellErrors(s).length === 0)).toBe(true);
  expect(spellbookBudgetErrors(generators).join()).toContain('Classe : score');
  expect(spellbookBalance([newAuthoredSpell([], 'boost')]).synergy).toBeGreaterThan(0);
});

test.each([
  ['lost rows', s => { s.effects.push(newAuthoredEffect('buffPower')); }],
  ['smaller maximum', s => { s.critEffects[0].max = 17; s.critEffects[0].min = 17; }],
  ['different element', s => { s.critEffects[0].element = 'air'; }],
  ['smaller zone', s => { s.effects[0].zone = 'Cc'; }],
  ['missing healing', s => { s.effects[0].kind = 'lifeSteal'; }],
])('weak critical: %s is rejected and explicit alignment restores the complete variant', (_name, mutate) => {
  const raw = attack(18, { critRate: 2, critEffects: [newAuthoredEffect()] }); mutate(raw);
  const next = normalizeAuthoredSpell(raw);
  expect(authoredSpellErrors(next).join()).toMatch(/critique/i);
  const aligned = alignAuthoredCriticals(next);
  expect(aligned.critEffects).toHaveLength(aligned.effects.length);
  aligned.effects.forEach((effect, index) => {
    expect(aligned.critEffects[index].kind).toBe(effect.kind);
    expect(aligned.critEffects[index].min).toBeGreaterThanOrEqual(effect.min);
    expect(aligned.critEffects[index].max).toBeGreaterThanOrEqual(effect.max);
  });
});

test('a saved over-budget kit can be reduced without erasing unrelated creations', () => {
  const spells = Array.from({ length: 10 }, () => attack(30));
  expect(spells.every(s => spellBalance(s).valid)).toBe(true);
  expect(spellbookBalance(spells).score).toBeGreaterThan(650);
  expect(spellbookBudgetErrors(spells).join()).toContain('Classe : score');
  expect(resolveSpellLoadout('IOP', loadout(spells)).valid).toBe(false);
  expect(resolveSpellLoadout('IOP', loadout(spells.slice(0, 6))).valid).toBe(true);
});

test('kit counts damage/PA boosts and rotating independent burst spells', () => {
  const plain = [attack(30), attack(30)], boost = newAuthoredSpell([], 'boost');
  expect(spellbookBalance([...plain, boost]).synergy).toBeGreaterThan(0);
  const burst = attack(110, { pa: 6, cooldown: 3, rangeMax: 2 });
  const report = spellbookBalance([burst, { ...burst, id: burst.id + 1, key: `custom_${burst.id + 1}` }]);
  expect(report.rotation).toBeGreaterThan(0);
  expect(report.score).toBe(report.sum + report.synergy + report.rotation);
});

test('all 264 grade-six originals have scores and retain their full native spellbooks', () => {
  const references = classBalanceReference();
  expect(references).toHaveLength(264);
  for (const ref of references) expect(Number.isFinite(ref.balance.score)).toBe(true);
  for (const classId of new Set(references.map(s => s.classId))) expect(resolveSpellLoadout(classId, { level: 200 }).valid).toBe(true);
  const wrath = references.find(s => s.id === 159);
  expect(spellBalance({ ...wrath, cooldown: 0 }).score).toBeGreaterThan(wrath.balance.score);
  const whip = references.find(s => s.id === 30);
  expect(spellBalance({ ...whip, effects: whip.effects.map(e => ({ ...e, targetMask: 1 })) }).score).toBeGreaterThan(100);
});

test('ZIP and graphical authoring share critical, individual and total budget gates', () => {
  const example = packageExample('class');
  expect(validateContentManifest(example).errors).toEqual([]);
  const spell = example.class.spells[0];
  spell.critRate = 2; spell.critEffects = spell.effects.map(e => ({ ...e, min: 1, max: 1 }));
  expect(validateContentManifest(example).errors.join()).toMatch(/critique/i);
  spell.critRate = 0; spell.critEffects = [];
  spell.effects[0].min = spell.effects[0].max = 30;
  example.class.spells = Array.from({ length: 10 }, (_, i) => ({ ...spell, key: `spell${i}` }));
  expect(validateContentManifest(example).errors.join()).toContain('Classe : score');
});

test('rebalanced reported spell executes matching full normal and critical casts with the same PA cost', () => {
  const raw = russian(), original = JSON.stringify(raw), repaired = rebalanceAuthoredSpell(raw);
  expect(JSON.stringify(raw)).toBe(original);
  expect(authoredSpellErrors(repaired)).toEqual([]);
  expect(repaired.id).toBe(raw.id); expect(repaired.effects).toHaveLength(4);
  const hits = [];
  for (let seed = 1; seed <= 16; seed++) {
    const { state } = createGame({ mapId: 'arene', seed, fighters: [
      { id: 'A', classId: 'IOP', loadout: loadout([repaired]) }, { id: 'B', monsterId: 494, monsterGrade: 5 },
    ] });
    state.currentIndex = state.order.indexOf('A'); state.board.obstacles = {};
    Object.assign(state.fighters.A, { pos: { x: 3, y: 3 }, pa: 15, hp: 500, stats: {}, equipmentBonuses: {} });
    state.fighters.B.pos = { x: 5, y: 3 };
    const result = applyAction(state, { type: 'CAST', spell: repaired.key, target: state.fighters.B.pos });
    expect(result.ok).toBe(true);
    const event = result.events.find(e => e.t === 'cast');
    const rows = result.events.filter(e => e.t === 'damage');
    expect(rows).toHaveLength(4); expect(result.events.some(e => e.t === 'heal')).toBe(true);
    expect(result.state.fighters.A.pa).toBe(15 - repaired.pa);
    hits.push({ crit: event.crit, total: rows.reduce((sum, e) => sum + e.amount, 0) });
  }
  expect(hits.some(h => h.crit)).toBe(true); expect(hits.some(h => !h.crit)).toBe(true);
  expect(new Set(hits.map(h => h.total)).size).toBe(1);
});
