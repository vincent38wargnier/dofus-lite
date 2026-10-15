import { newAdventure, addAdventureHero, validAdventure, adventureErrors, adventureTeam, defaultAdventureChoice } from '../engine/adventures';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { KANOJEDO_MAP_ID, POUTCH_ID } from '../engine/monsters';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { customDungeonErrors } from '../engine/customDungeons';
import { validCreations, emptyCreations } from '../ui/creationsStore';

const hero = (name = 'Gardien', classId = 'IOP') => ({ name, classId,
  loadout: { ...emptyLoadout(classId), level: 200, slots: { weapon: 2416 }, base: { vitalite: 100 } } });
const room = () => ({ id: 'adventure', name: 'La porte des brumes', mapId: KANOJEDO_MAP_ID,
  members: [{ monsterId: POUTCH_ID, grade: 1, count: 1 }],
  adventure: addAdventureHero(addAdventureHero(newAdventure(), hero(), 'guardian'), hero('Éclaireur', 'CRA'), 'scout') });
const pass = { name: 'Test', decide: () => ({ type: 'PASS' }) };

test('an optional adventure owns full independent snapshots; ordinary dungeons remain free', () => {
  const original = hero(); const rules = addAdventureHero(newAdventure(), original, 'hero');
  original.loadout.level = 1; original.loadout.slots.weapon = null;
  expect(rules.heroes[0].character.loadout.level).toBe(200);
  expect(rules.heroes[0].character.loadout.slots.weapon).toBe(2416);
  const dungeon = room();
  expect(customDungeonErrors(dungeon)).toEqual([]);
  const team = adventureTeam(dungeon);
  team[0].loadout.level = 1;
  expect(adventureTeam(dungeon)[0].loadout.level).toBe(200);
  delete dungeon.adventure;
  expect(customDungeonErrors(dungeon)).toEqual([]);
});

test.each([
  rules => ({ ...rules, version: 2 }),
  rules => ({ ...rules, partySize: 0 }),
  rules => ({ ...rules, partySize: 9 }),
  rules => ({ ...rules, allowAI: 'yes' }),
  rules => ({ ...rules, damageMultiplier: 10 }),
  rules => ({ ...rules, heroes: [...rules.heroes, rules.heroes[0]] }),
  rules => ({ ...rules, heroes: Array.from({ length: 9 }, (_, i) => ({ ...rules.heroes[0], id: `h${i}` })) }),
  rules => ({ ...rules, heroes: [{ ...rules.heroes[0], character: { ...hero(), classId: 'INVENTED' } }] }),
])('unsupported or malformed rules are rejected instead of becoming a free dungeon', change => {
  const dungeon = room(); dungeon.adventure = change(dungeon.adventure);
  expect(validAdventure(dungeon.adventure)).toBe(false);
  expect(validCreations({ ...emptyCreations(), dungeons: [dungeon] })).toBe(false);
  expect(() => adventureTeam(dungeon, { heroIds: [], automatic: false })).toThrow();
});

test('an empty or unfinished adventure saves as a draft, but cannot launch', () => {
  const dungeon = room(); dungeon.adventure = newAdventure();
  expect(validCreations({ ...emptyCreations(), dungeons: [dungeon] })).toBe(true);
  expect(adventureErrors(dungeon)).toEqual(['Ajoutez au moins un héros prêt à jouer.']);
  expect(() => new LiveMatch({ mode: 'custom', dungeon, seed: 1 })).toThrow(/héros/);
});

test('hero choices require exact count, unique allowed IDs, and obey the AI option', () => {
  const dungeon = room(); dungeon.adventure.mode = 'choice';
  expect(adventureTeam(dungeon, { heroIds: ['scout'] })[0].classId).toBe('CRA');
  for (const heroIds of [[], ['outsider'], ['scout', 'scout'], ['guardian', 'scout']]) {
    expect(() => adventureTeam(dungeon, { heroIds })).toThrow(/Choisissez/);
  }
  dungeon.adventure.allowAI = false;
  expect(() => adventureTeam(dungeon, { heroIds: ['guardian'], automatic: true })).toThrow(/manuellement/);
  dungeon.adventure.partySize = 3;
  expect(adventureErrors(dungeon)).toContain('Proposez assez de héros pour constituer l’équipe.');
});

test('manual launch derives both teams, map, level and equipment from the package, never caller overrides', () => {
  const dungeon = room(), initial = JSON.stringify(dungeon);
  const match = new LiveMatch({ mode: 'custom', dungeon, seed: 2, mapId: 'arene', playerClass: 'FECA',
    team: [{ kind: 'character', ...hero('Hors règles', 'FECA'), controller: 'player' }],
    opponents: [{ kind: 'monster', monsterId: POUTCH_ID, grade: 5 }],
    loadouts: { A: { ...hero().loadout, level: 1 } } });
  expect(Object.keys(match.state.fighters)).toEqual(['A', 'A2', 'B']);
  expect(match.state.fighters.A.name).toBe('Gardien');
  expect(match.state.fighters.A2.classId).toBe('CRA');
  expect(match.state.fighters.A.loadout).toEqual(dungeon.adventure.heroes[0].character.loadout);
  expect(match.state.fighters.A.hp).toBe(resolveLoadout('IOP', hero().loadout).hp);
  expect(match.humanIds).toEqual(new Set(['A', 'A2']));
  expect(match.state.fighters.B.hp).toBe(100);
  expect(JSON.stringify(dungeon)).toBe(initial);
});

test('automatic simulation selects the same provided hero and cannot bypass a manual-only adventure', () => {
  const dungeon = room(); dungeon.adventure.mode = 'choice';
  const config = { mode: 'custom', dungeon, classes: { A: 'FECA', B: 'IOP' }, bots: { A: pass, B: pass },
    adventureChoice: { heroIds: ['scout'] }, opponents: [{ kind: 'character', ...hero('Triche') }], seed: 1 };
  const result = runMatch(config);
  expect(result.frames[0].state.fighters.A.classId).toBe('CRA');
  expect(Object.values(result.frames[0].state.fighters).filter(f => f.team === 'A')).toHaveLength(1);
  expect(result.frames[0].state.fighters.B.hp).toBe(100);
  dungeon.adventure.allowAI = false;
  expect(() => runMatch(config)).toThrow(/manuellement/);
});

test('invalid equipment and spellbooks also block the supplied heroes', () => {
  const dungeon = room(); dungeon.adventure.heroes[0].character.loadout.slots.weapon = 999999;
  expect(adventureErrors(dungeon).length).toBeGreaterThan(0);
  expect(() => adventureTeam(dungeon, defaultAdventureChoice(dungeon))).toThrow();
});
