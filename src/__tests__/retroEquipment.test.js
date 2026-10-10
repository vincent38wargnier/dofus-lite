import { fighterAccessories, withAccessoryImports } from '../ui/retroEquipment';
import { getActorId } from '../ui/RetroAssets';
import { createGame } from '../engine/engine';

const assets = { classes: { IOP: { male: '80', female: '81' } }, monsters: { 147: '152' }, accessories: { symbols: {
  '16_41': 'clips/sprites/accessories/a1.swf', '17_147': 'clips/sprites/accessories/a2.swf',
  '18_1': 'clips/sprites/accessories/a3.swf', '18_14': 'clips/sprites/accessories/a3.swf',
} } };
const loadout = { version: 1, level: 200, base: {}, rollMode: 'max', slots: { hat: 2411, cape: 8876, pet: 1728 } };

test('each combat snapshot links its own equipped graphics, including a different pet and sex on the same class', () => {
  const { state } = createGame({ fighters: [
    { id: 'A', classId: 'IOP', loadout },
    { id: 'B', classId: 'IOP', team: 'B', loadout: { ...loadout, profile: { sex: 1 }, slots: { pet: 7519 } } },
  ] });
  expect(fighterAccessories(state.fighters.A, assets).parameters).toEqual({ accessory1: '16_41', accessory2: '17_147', accessory3: '18_1' });
  expect(fighterAccessories(state.fighters.B, assets).parameters).toEqual({ accessory3: '18_14' });
  expect(getActorId(assets, state.fighters.B, 'male')).toBe('81');
  expect(getActorId(assets, { classId: 'IOP' }, 'female')).toBe('81');
  expect(getActorId(assets, { classId: 'IOP', loadout: { profile: { sex: 0 } } }, 'female')).toBe('80');
});

test.each([{ isMonster: true }, { isSummon: true }])('a monster or summon does not borrow its owner’s equipment: %j', flags => {
  expect(fighterAccessories({ ...flags, loadout }, assets)).toEqual({ parameters: {}, imports: [] });
});

test('mount certificates, invalid slot types and missing client graphics do not become pets or inventory icons on the field', () => {
  for (const slots of [{ pet: 7870 }, { pet: 2411 }, { hat: 1728 }, { hat: 11049 }, { cape: 999999 }, {}]) {
    expect(fighterAccessories({ loadout: { slots } }, assets)).toEqual({ parameters: {}, imports: [] });
  }
  expect(fighterAccessories({ loadout }, null)).toEqual({ parameters: {}, imports: [] });
});

function swfTags(data) {
  const view = new DataView(data.buffer), result = [];
  let offset = 8 + Math.ceil((5 + 4 * (data[8] >> 3)) / 8) + 4;
  while (offset < data.length) {
    const head = view.getUint16(offset, true); offset += 2;
    let size = head & 63;
    if (size === 63) { size = view.getUint32(offset, true); offset += 4; }
    result.push({ code: head >> 6, payload: [...data.slice(offset, offset + size)] }); offset += size;
  }
  return result;
}

test('linking gear preserves the actor’s timeline and reserves IDs above its original definitions', async () => {
  // Minimal FWS with a DefineSprite at ID 60000, original actions and a frame.
  const source = Uint8Array.from([70, 87, 83, 8, 42, 0, 0, 0, 8, 0, 0, 60, 1, 0,
    198, 9, 96, 234, 1, 0, 0, 0,
    // ImportAssets (57): lib "x", one existing imported symbol at ID 60010.
    72, 14, 120, 0, 1, 0, 106, 234, 121, 0,
    2, 3, 7, 0, 64, 0, 0, 0]);
  const imports = fighterAccessories({ loadout }, assets).imports;
  const result = new Uint8Array(await withAccessoryImports(source.buffer, [...imports, imports[0]]));
  const tags = swfTags(result), links = tags.filter(t => t.code === 71);
  expect(tags.filter(t => ![71, 56].includes(t.code))).toEqual(swfTags(source));
  expect(links).toHaveLength(3);
  links.forEach((link, index) => {
    const payload = Buffer.from(link.payload), end = payload.indexOf(0);
    expect(payload.toString('ascii', 0, end)).toBe(imports[index].url);
    expect([...payload.slice(end + 1, end + 3)]).toEqual([1, 0]);
    expect(payload.readUInt16LE(end + 3)).toBe(1);
    expect(payload.readUInt16LE(end + 5)).toBe(60011 + index);
    expect(payload.toString('ascii', end + 7, -1 + payload.length)).toBe(imports[index].name);
  });
  expect(new DataView(result.buffer).getUint32(4, true)).toBe(result.length);
  expect(await withAccessoryImports(source.buffer, [])).toBe(source.buffer);
});
