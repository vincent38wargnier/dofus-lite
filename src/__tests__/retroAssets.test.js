import { facing, getActorId, resolveAnimation } from '../ui/RetroAssets';

test('facing follows all four isometric neighbours', () => {
  const from = { x: 2, y: 2 };
  expect(facing(from, { x: 3, y: 2 })).toEqual({ suffix: 'R', mirror: false });
  expect(facing(from, { x: 2, y: 3 })).toEqual({ suffix: 'R', mirror: true });
  expect(facing(from, { x: 1, y: 2 })).toEqual({ suffix: 'L', mirror: true });
  expect(facing(from, { x: 2, y: 1 })).toEqual({ suffix: 'L', mirror: false });
});

test('an absent monster or animation falls back without selecting an invalid clip', () => {
  const assets = { classes: { IOP: { male: '80', female: '81' } }, monsters: { 36: '1566' } };
  expect(getActorId(assets, { classId: 'IOP' }, 'female')).toBe('81');
  expect(getActorId(assets, { isSummon: true, monsterId: 36 })).toBe('1566');
  expect(getActorId(assets, { isSummon: true, monsterId: 999999 })).toBeNull();
  const actor = { animations: ['staticR', 'walkR'] };
  expect(resolveAnimation(actor, 'walk', 'L')).toBe('walkR');
  expect(resolveAnimation(actor, 'anim999', 'L')).toBe('staticR');
  expect(resolveAnimation(null, 'walk')).toBeNull();
});
