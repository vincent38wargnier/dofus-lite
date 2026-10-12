import { ITEMS, emptyLoadout, equipSet, resolveLoadout, rolledEffects, weaponSpell } from '../engine/equipment';
import { MAX_ITEM_SCORE, MAX_EQUIPMENT_SCORE, EQUIPMENT_CENSUS, EQUIPMENT_REFERENCES, EQUIPMENT_FAMILIES, equipmentBalance, equipmentBudget, equipmentKitBalance, equipmentPower, equipmentStats, nativeEquipmentExclusion } from '../engine/equipmentBalance';
import { newCustomEquipment, customEquipmentItem, customEquipmentShape, validateCustomEquipment, equipCustomItem, equipmentItem, fitEquipmentBudget } from '../engine/customEquipment';
import { replaceEquipment, forgeRestriction, createForgedItem } from '../engine/forgedItems';
import { createGame, applyAction, spellsOf } from '../engine/engine';
import { runMatch } from '../arena/runner';
import { applySavedEquipment, isLoadout } from '../ui/loadoutStore';
import { canDropEquipment, dropEquipment } from '../ui/equipmentDrag';
import { readCustomEquipment, saveCustomEquipment, CUSTOM_EQUIPMENT_STORAGE } from '../ui/CustomEquipmentContext';
import { fighterAccessories } from '../ui/retroEquipment';

const definition = (ref = 7143, stats = { vitalite: 200, force: 40, damage: 5 }) => ({ ...newCustomEquipment(ref), level: 200, name: 'Création test', stats });
const naked = () => ({ ...emptyLoadout('IOP'), level: 200, base: {} });
const equip = (loadout, slot, item) => replaceEquipment(equipCustomItem(loadout, slot, item), slot, item.id);

test('census accounts for every non-Dofus and calibration never uses Dofus, admin items, ethereal items or custom gear', () => {
  expect(EQUIPMENT_CENSUS.items).toBe(6476); expect(EQUIPMENT_CENSUS.dofusExcluded).toBe(14);
  expect(EQUIPMENT_CENSUS.eligible + Object.values(EQUIPMENT_CENSUS.exclusions).reduce((a, b) => a + b, 0)).toBe(6476);
  expect(EQUIPMENT_REFERENCES.every(item => item.type !== 23 && !item.customEquipment && !item.ethereal && !nativeEquipmentExclusion(item))).toBe(true);
  expect(Object.values(ITEMS).filter(item => /Annobus/.test(item.name)).every(item => nativeEquipmentExclusion(item))).toBe(true);
  const hash = JSON.stringify(ITEMS);
  validateCustomEquipment(definition());
  expect(JSON.stringify(ITEMS)).toBe(hash);
});

test.each(EQUIPMENT_FAMILIES.map(family => [family.id, family]))('%s has finite monotonic level budgets based on client references', (_, family) => {
  const item = EQUIPMENT_REFERENCES.find(value => family.types.includes(value.type));
  let last = 0;
  for (const level of [1, 20, 50, 100, 150, 200]) {
    const b = equipmentBudget(item, level);
    expect(Number.isFinite(b.total)).toBe(true); expect(b.total).toBeGreaterThanOrEqual(last);
    if (!['pet', 'mount', 'shield'].includes(family.id)) expect(b.references.every(ref => ref.level <= level)).toBe(true);
    last = b.total;
  }
});

test('damage, PA, range and critical value increase cost; maluses cannot finance unrelated power', () => {
  const base = definition(), cost = stats => equipmentPower(customEquipmentItem({ ...base, stats })).total;
  expect(cost({ damage: 10 })).toBeGreaterThan(cost({ damage: 5 }));
  expect(cost({ pa: 1, pm: 1 })).toBeGreaterThan(cost({ pa: 1 }) + cost({ pm: 1 }));
  expect(cost({ force: 60, intelligence: -50 })).toBe(cost({ force: 60 }));
  expect(cost({ pa: 2 })).toBeGreaterThan(cost({ pa: 1 }) * 2);
  const weapon = definition(2416, {});
  const power = w => equipmentPower(customEquipmentItem({ ...weapon, weapon: w })).attack;
  expect(power({ ...weapon.weapon, pa: 2 })).toBeGreaterThan(power({ ...weapon.weapon, pa: 5 }));
  expect(power({ ...weapon.weapon, critBonus: 10 })).toBeGreaterThan(power({ ...weapon.weapon, critBonus: 0 }));
  expect(power({ ...weapon.weapon, lines: [{ id: 94, min: 10, max: 10 }] })).toBeGreaterThan(power({ ...weapon.weapon, lines: [{ id: 99, min: 10, max: 10 }] }));
  expect(power({ ...weapon.weapon, lines: [{ id: 99, min: 5, max: 5 }, { id: 99, min: 5, max: 5 }] })).toBeGreaterThan(power({ ...weapon.weapon, lines: [{ id: 99, min: 10, max: 10 }] }));
});

test('limits reject raw-stat dumping, low-level stats, duplicate PA and four enormous cheap weapon lines', () => {
  for (const candidate of [definition(7143, { force: 10000 }), definition(7143, { pa: 2 }),
    { ...definition(), level: 1 }, { ...definition(2416, {}), weapon: { pa: 2, range: [1, 1], critRate: 20, critBonus: 20,
      lines: Array.from({ length: 4 }, () => ({ id: 94, min: 79, max: 80 })) } }]) {
    expect(validateCustomEquipment(candidate).valid).toBe(false);
  }
  const strong = definition(7143, { vitalite: 500, force: 100, intelligence: 100, damage: 30, pa: 1, pm: 1 });
  const repaired = fitEquipmentBudget(strong);
  expect(validateCustomEquipment(repaired).errors).toEqual([]);
  expect(strong.stats.force).toBe(100);
});

test('strict definitions cannot inject Dofus, sets, unknown effects, visual paths, NaN or unrelated weapon properties', () => {
  const base = definition();
  for (const value of [{ ...base, referenceId: 6980 }, { ...base, set: 1 }, { ...base, type: 23 },
    { ...base, gfx: '../../../x' }, { ...base, stats: { force: NaN } }, { ...base, stats: { foo: 1 } },
    { ...base, stats: { power: -10 } }, { ...base, id: 2411 },
    { ...definition(2416, {}), weapon: { ...newCustomEquipment(2416).weapon, zone: 'Cc' } }]) {
    expect(validateCustomEquipment(value).valid).toBe(false);
  }
  expect(customEquipmentShape({ ...base, name: 'x'.repeat(81) })).toBe(false);
});

test('custom snapshots persist independently of the library and transfer between classes and replays', () => {
  const item = definition(), loaded = equip(naked(), 'hat', item);
  expect(validateCustomEquipment(item).errors).toEqual([]);
  expect(isLoadout(loaded)).toBe(true);
  saveCustomEquipment(localStorage, [item]);
  const before = resolveLoadout('IOP', loaded);
  const restored = JSON.parse(JSON.stringify(loaded));
  expect(resolveLoadout('IOP', restored).bonuses).toEqual(before.bonuses);
  localStorage.removeItem(CUSTOM_EQUIPMENT_STORAGE);
  item.stats.force = 999;
  expect(equipmentItem(restored.slots.hat, restored).effects).toContainEqual([118, 40, 0, '0d0+40']);
  const cra = applySavedEquipment({ ...emptyLoadout('CRA'), level: 200, base: {} }, restored);
  expect(resolveLoadout('CRA', cra).bonuses).toEqual(before.bonuses);
  const assets = { accessories: { symbols: { '16_123': '/hat.swf' } } };
  expect(fighterAccessories({ loadout: restored }, assets).parameters.accessory1).toBeUndefined();
  const legacy = JSON.parse(JSON.stringify(restored));
  delete legacy.customEquipment[legacy.slots.hat].appearance;
  expect(fighterAccessories({ loadout: legacy }, assets).parameters.accessory1).toBe('16_123');
});

test('custom gear is equipable and swappable by drag and rejects incompatible or invalid payloads', () => {
  const ring = definition(2469, { pa: 1 }), drag = { itemId: ring.id, customEquipment: ring };
  expect(canDropEquipment(naked(), drag, 'ring1')).toBe(true);
  expect(canDropEquipment(naked(), drag, 'hat')).toBe(false);
  const equipped = dropEquipment(naked(), drag, 'ring1');
  const swapped = dropEquipment(equipped, { ...drag, fromSlot: 'ring1' }, 'ring2');
  expect(swapped.slots.ring2).toBe(ring.id);
  expect(resolveLoadout('IOP', swapped).pa).toBe(8);
  const invalid = { ...ring, stats: { pa: 20 } };
  expect(dropEquipment(naked(), { ...drag, customEquipment: invalid }, 'ring1')).toEqual(naked());
  expect(canDropEquipment(naked(), { itemId: ring.id }, 'ring1')).toBe(false);
});

test('combat admission recomputes the definition and prohibits FM or ID spoofing', () => {
  const item = definition(), loadout = equip(naked(), 'hat', item);
  loadout.customEquipment[item.id].stats.force = 999;
  expect(resolveLoadout('IOP', loadout).valid).toBe(false);
  expect(() => createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout }, { id: 'B', classId: 'IOP' }] })).toThrow(/Budget|maximum/);
  const legal = customEquipmentItem(definition());
  expect(forgeRestriction(legal)).toMatch(/jets fixes/);
  expect(() => createForgedItem(legal, [])).toThrow(/jets fixes/);
  expect(equipmentItem(2411, { customEquipment: { 2411: item } })).toBe(ITEMS[2411]);
  expect(equipmentItem(item.id, { customEquipment: { [item.id]: { ...item, id: item.id + 1 } } })).toBeNull();
});

test('whole-outfit cap counts repeated rings, all custom pieces, PA/PM synergy and set tiers, but never Dofus', () => {
  const gear = ['hat', 'cape', 'amulet', 'ring', 'ring', 'belt', 'boots', 'weapon-7'].map(familyId => {
    const f = EQUIPMENT_FAMILIES.find(value => value.id === familyId);
    const ref = EQUIPMENT_REFERENCES.find(item => f.types.includes(item.type));
    return customEquipmentItem(definition(ref.id, { pa: 1, pm: 1 }));
  });
  const b = equipmentKitBalance(gear, 200);
  expect(b.valid).toBe(false); expect(b.score).toBeGreaterThan(MAX_EQUIPMENT_SCORE); expect(b.synergy).toBeGreaterThan(0);
  expect(equipmentKitBalance([...gear, ITEMS[6980], ITEMS[7113]], 200)).toEqual(b);
  expect(equipmentKitBalance(gear.slice(0, 1), 200).valid).toBe(true);
  expect(equipmentKitBalance(gear.slice(0, 1), 200, [[111, 1, 0, '0']]).setScore).toBeGreaterThan(0);
  const native = resolveLoadout('IOP', equipSet(naked(), 1));
  expect(native.valid).toBe(true); expect(native.equipmentBudget.enforced).toBe(false);
});

test('an optimized max-roll outfit with legal exos fits even with a custom item, while further stacking is still blocked', () => {
  // Reproduce the reported 1,606.5-point Cra without personal save metadata.
  const loadout = { ...emptyLoadout('CRA'), level: 200, base: { vitalite: 2, intelligence: 288 }, rollMode: 'max',
    slots: { hat: 11548, cape: 8876, amulet: 11546, ring1: 11544, ring2: 8877, boots: 9182,
      pet: 7830, belt: 9143, weapon: 8993, dofus1: 7114, dofus2: 737, dofus3: 7115, dofus4: 7754, dofus5: 694, dofus6: 739 },
    forgedItems: {} };
  for (const [slot, stat] of Object.entries({ hat: 'pa', cape: 'pa', amulet: 'pm', weapon: 'pa', ring1: 'pa', ring2: 'pa', belt: 'pa' })) {
    const item = ITEMS[loadout.slots[slot]], forged = createForgedItem(item, rolledEffects(item, loadout, slot));
    forged.stats[stat] = (forged.stats[stat] || 0) + 1;
    loadout.forgedItems[slot] = forged;
  }
  const native = resolveLoadout('CRA', loadout);
  expect(native.errors).toEqual([]);
  expect(native).toMatchObject({ hp: 3268, pa: 15, pm: 5 });
  expect(native.equipmentBudget).toMatchObject({ score: 1606.5, max: 1650, baseScore: 884.3, setScore: 22.2, synergy: 700 });

  const companion = definition(loadout.slots.pet, equipmentStats(ITEMS[loadout.slots.pet]));
  const itemCheck = validateCustomEquipment(companion);
  expect(itemCheck.valid).toBe(true);
  expect(itemCheck.balance.score).toBeLessThanOrEqual(MAX_ITEM_SCORE);
  const mixed = equip(loadout, 'pet', companion), summary = resolveLoadout('CRA', mixed);
  expect(summary.errors).toEqual([]);
  expect(summary.equipmentBudget).toMatchObject({ score: 1606.5, enforced: true, valid: true });
  const fighters = gear => [{ id: 'A', classId: 'CRA', loadout: gear }, { id: 'B', classId: 'IOP' }];
  expect(createGame({ fighters: fighters(mixed) }).state.fighters.A.basePa).toBe(15);
  const noDofus = { ...mixed, slots: Object.fromEntries(Object.entries(mixed.slots).filter(([slot]) => !slot.startsWith('dofus'))) };
  expect(resolveLoadout('CRA', noDofus).equipmentBudget).toEqual(summary.equipmentBudget);

  // A further legal AP exo passes FM checks but must still fail outfit admission.
  const boots = ITEMS[mixed.slots.boots], extraExo = createForgedItem(boots, rolledEffects(boots, mixed, 'boots'));
  extraExo.stats.pa = 1;
  const excessive = { ...mixed, forgedItems: { ...mixed.forgedItems, boots: extraExo } };
  const rejected = resolveLoadout('CRA', excessive);
  expect(rejected.equipmentBudget.score).toBeGreaterThan(1650);
  expect(rejected.errors).toHaveLength(1);
  expect(() => createGame({ fighters: fighters(excessive) })).toThrow(/Budget du stuff/);
  // More outfit headroom does not relax any individual item allowance.
  expect(validateCustomEquipment({ ...companion, stats: { ...companion.stats, pa: 1 } }).valid).toBe(false);
});

test('eight individually legal PA/PM pieces cannot bypass whole-outfit combat admission', () => {
  let loadout = naked();
  for (const [familyId, slot] of [['hat', 'hat'], ['cape', 'cape'], ['amulet', 'amulet'], ['ring', 'ring1'],
    ['ring', 'ring2'], ['belt', 'belt'], ['boots', 'boots'], ['weapon-7', 'weapon']]) {
    const family = EQUIPMENT_FAMILIES.find(row => row.id === familyId);
    const reference = EQUIPMENT_REFERENCES.find(item => family.types.includes(item.type));
    const item = definition(reference.id, { pa: 1, pm: 1 });
    expect(validateCustomEquipment(item).valid).toBe(true);
    loadout = equip(loadout, slot, item);
  }
  const result = resolveLoadout('IOP', loadout);
  expect(result.valid).toBe(false);
  expect(result.errors).toHaveLength(1); expect(result.errors[0]).toMatch(/Budget du stuff dépassé/);
  expect(() => createGame({ fighters: [{ id: 'A', classId: 'IOP', loadout }, { id: 'B', classId: 'IOP' }] })).toThrow(/Budget du stuff/);
});

test('new weapon normal and critical preserve all lines and use their bonuses in the real engine', () => {
  const definition = { ...newCustomEquipment(2416), level: 200, stats: { damage: 5 },
    weapon: { pa: 4, range: [1, 1], critRate: 20, critBonus: 3,
      lines: [{ id: 99, min: 8, max: 8 }, { id: 97, min: 8, max: 8 }] } };
  expect(validateCustomEquipment(definition).errors).toEqual([]);
  const loadout = equip(naked(), 'weapon', definition);
  const weapon = weaponSpell(customEquipmentItem(definition));
  expect(weapon.critEffects).toHaveLength(2);
  expect(weapon.critEffects.every((line, i) => line.min === weapon.effects[i].min + 3)).toBe(true);
  let { state } = createGame({ seed: 7, fighters: [{ id: 'A', classId: 'IOP', loadout }, { id: 'B', classId: 'IOP' }] });
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 5, y: 5 }; state.fighters.B.pos = { x: 6, y: 5 };
  expect(spellsOf(state.fighters.A).weapon.itemId).toBe(definition.id);
  state.rngState = 100; // A reproducible successful normal hit.
  const result = applyAction(state, { type: 'CAST', spell: 'weapon', target: state.fighters.B.pos });
  expect(result.state.fighters.B.hp).toBeLessThan(state.fighters.B.hp);
  expect(result.state.fighters.A.pa).toBe(state.fighters.A.pa - 4);
  expect(result.events.filter(event => event.t === 'damage')).toHaveLength(2);
  state.rngState = 1; // A successful critical with exactly the same base rolls.
  const critical = applyAction(state, { type: 'CAST', spell: 'weapon', target: state.fighters.B.pos });
  expect(critical.state.fighters.B.hp).toBeLessThan(result.state.fighters.B.hp);
  expect(critical.events.filter(event => event.t === 'damage')).toHaveLength(2);
  const bots = { A: { name: 'Test', decide: () => ({ type: 'PASS' }) }, B: { name: 'Test', decide: () => ({ type: 'PASS' }) } };
  const match = runMatch({ bots, classes: { A: 'IOP', B: 'IOP' }, loadouts: { A: loadout }, seed: 8 });
  expect(match.config.loadouts.A.customEquipment).toEqual(loadout.customEquipment);
});

test('corrupt local libraries are not overwritten and invalid new equipment cannot be stored', () => {
  localStorage.setItem(CUSTOM_EQUIPMENT_STORAGE, 'broken');
  expect(readCustomEquipment(localStorage).error).toMatch(/conservée/);
  expect(localStorage.getItem(CUSTOM_EQUIPMENT_STORAGE)).toBe('broken');
  expect(() => saveCustomEquipment(localStorage, [definition(7143, { pa: 20 })])).toThrow();
  expect(localStorage.getItem(CUSTOM_EQUIPMENT_STORAGE)).toBe('broken');
});
