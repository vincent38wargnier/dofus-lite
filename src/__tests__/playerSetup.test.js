import { readPlayerSetup, loadoutAtLevel } from '../ui/playerSetupState';
import { allocatedPoints, emptyLoadout, equipSet, focusCharacteristics, resolveLoadout } from '../engine/equipment';
import { availableSpellGrades } from '../engine/classes';

describe('Player preparation', () => {
  test('restores the selected classes and map without touching saved builds', () => {
    const saved = { playerClass: 'SADIDA', botClass: 'FECA', botId: 'custom-bot', mapId: 'canyon' };
    expect(readPlayerSetup({ getItem: () => JSON.stringify(saved) })).toEqual({ ...saved, customCharacterId: null, playerBotId: 'maison', mode: 'duel', monsterGrade: 5, bossId: 147, bossGrade: 5 });
  });

  test('unavailable, damaged or obsolete settings recover valid defaults', () => {
    const defaults = readPlayerSetup({ getItem: () => null });
    for (const raw of ['{bad json', 'null', '[]', '{"playerClass":"constructor","botClass":"ENIRIPSA","mapId":"toString"}']) {
      const next = readPlayerSetup({ getItem: () => raw });
      expect(next.playerClass).toBe('IOP'); expect(next.mapId).toBe(defaults.mapId);
    }
    expect(readPlayerSetup({ getItem: () => { throw new Error('blocked'); } })).toEqual(defaults);
  });

  test('raising the level preserves custom allocation, equipment, rolls and spell order', () => {
    const draft = { ...equipSet(emptyLoadout('IOP'), 1), level: 100, base: { force: 100, vitalite: 150 },
      rollMode: 'random', rollSeed: 47, spells: { common: [350], order: [350, 141], grades: { 350: 3 } } };
    const next = loadoutAtLevel('IOP', draft, 150);
    expect(next).toEqual({ ...draft, level: 150 });
    expect(draft.level).toBe(100);
  });

  test('lowering the level keeps the allocation, blocks excess capital and removes only inaccessible grades', () => {
    const draft = { ...emptyLoadout('SACRIEUR'), level: 150, base: focusCharacteristics('SACRIEUR', 'vitalite', 150),
      spells: { common: [350], order: [350], grades: { 350: 6 } } };
    const next = loadoutAtLevel('SACRIEUR', draft, 20);
    expect(next.base).toEqual(draft.base);
    expect(allocatedPoints('SACRIEUR', next.base)).toBe(745);
    expect(resolveLoadout('SACRIEUR', next).valid).toBe(false);
    expect(resolveLoadout('SACRIEUR', next).errors).toContain('Caractéristiques : 95 points disponibles.');
    expect(availableSpellGrades(350, 20)).not.toContain(6);
    expect(next.spells).toEqual({ common: [350], order: [350], grades: {} });
    expect(draft.spells.grades[350]).toBe(6);
  });

  test('a level decrease retains gear and exposes invalid requirements for the player to correct', () => {
    const draft = equipSet(emptyLoadout('IOP'), 55);
    const next = loadoutAtLevel('IOP', draft, 100);
    expect(next.slots).toEqual(draft.slots);
    expect(resolveLoadout('IOP', next).valid).toBe(false);
  });
});
