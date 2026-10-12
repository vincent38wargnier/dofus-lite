import { emptyLoadout } from '../engine/equipment';
import { DRAFT_STORAGE } from '../ui/loadoutStore';
import { CREATIONS_STORAGE } from '../ui/creationsStore';
import { SETUP_STORAGE } from '../ui/playerSetupState';
import { PROFILES_STORAGE, makeProfile, persistProfiles, readProfiles, validProfiles } from '../ui/profileStore';

beforeEach(() => localStorage.clear());
test('migrates all player drafts with full settings while leaving the old data intact', () => {
  const iop = { ...emptyLoadout('IOP'), level: 200, base: { force: 100, vitalite: 300 }, parchottage: { force: 101 },
    slots: { weapon: 2416 }, spells: { order: [141, 153, 350], grades: { 141: 6 }, common: [350] }, profile: { sex: 1, alignment: 1, rank: 5 } };
  const cra = { ...emptyLoadout('CRA'), level: 150, base: {} };
  const legacy = JSON.stringify({ 'A:IOP': iop, 'A:CRA': cra, 'B:IOP': emptyLoadout('IOP') });
  localStorage.setItem(DRAFT_STORAGE, legacy);
  const { value, error } = readProfiles(localStorage);
  expect(error).toBe(''); expect(validProfiles(value)).toBe(true);
  expect(value.profiles.map(profile => profile.loadout)).toEqual([iop, cra]);
  persistProfiles(localStorage, value);
  expect(readProfiles(localStorage).value).toEqual(value);
  expect(localStorage.getItem(DRAFT_STORAGE)).toBe(legacy);
});
test('copies preserve settings without sharing mutable equipment or spell arrays', () => {
  const original = makeProfile('IOP');
  const ring = original.loadout.slots.ring1;
  original.loadout.spells = { order: [141], common: [350], grades: { 141: 6 } };
  const copy = makeProfile('IOP', original, [original]);
  copy.loadout.slots.ring1 = 2469; copy.loadout.spells.order.push(153);
  expect(copy.name).toBe('Iop (2)'); expect(copy.id).not.toBe(original.id);
  expect(original.loadout.slots.ring1).toBe(ring);
  expect(original.loadout.spells.order).toEqual([141]);
});
test('custom migration snapshots the class source, artwork and spells', () => {
  const template = { id: 'custom', name: 'Gardienne', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), artworkId: 'art', spells: { custom: [] } } };
  const raw = JSON.stringify({ version: 1, characters: [template], dungeons: [] });
  localStorage.setItem(CREATIONS_STORAGE, raw);
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ customCharacterId: 'custom' }));
  const value = readProfiles(localStorage).value;
  expect(value.profiles[0]).toMatchObject({ name: 'Gardienne', customCharacterId: 'custom', loadout: template.loadout });
  value.profiles[0].loadout.artworkId = 'another';
  expect(localStorage.getItem(CREATIONS_STORAGE)).toBe(raw);
});
test('unreadable or unsupported profiles are reported without overwriting the saved data', () => {
  for (const raw of ['bad', '{"version":2}', '{"version":1,"profiles":[]}']) {
    localStorage.setItem(PROFILES_STORAGE, raw);
    expect(readProfiles(localStorage).error).toMatch(/sauvegarde existante/);
    expect(localStorage.getItem(PROFILES_STORAGE)).toBe(raw);
  }
  expect(() => persistProfiles(localStorage, { version: 1, profiles: [] })).toThrow('Profil invalide');
});
