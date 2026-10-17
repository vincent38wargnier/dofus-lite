import { monsterData as DATA } from './gameData';
import { buildSpell } from './classes';

export const KANOJEDO_MAP_ID = 'amakna_534';
export const POUTCH_ID = 494;
export const POUTCH_GRADES = Object.values(DATA.monsters[POUTCH_ID]?.grades || {});
export const DEFAULT_BOSS_ID = 147;
export const BOSSES = DATA.bosses.map(id => DATA.monsters[id])
  .sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id - b.id);
export const UNAVAILABLE_BOSSES = DATA.unavailableBosses;
export function monsterGrades(id) { return Object.values(DATA.monsters[id]?.grades || {}); }
export function defaultMonsterGrade(id) { return monsterGrades(id).at(-1)?.grade; }

const MONSTERS = Object.fromEntries(Object.values(DATA.monsters).map(monster => [monster.id,
  Object.fromEntries(Object.values(monster.grades).map(raw => [raw.grade, {
    ...raw, monsterId: monster.id, name: monster.name, emoji: monster.emoji, behavior: monster.behavior,
    boss: monster.boss, maxSummons: monster.behavior === 'poutch' ? 0 : 8,
    stats: { force: 0, intelligence: 0, chance: 0, agilite: 0, sagesse: 0, vitalite: 0, ...raw.stats },
    spells: Object.fromEntries(raw.spells.map(rawSpell => {
      const spell = buildSpell(rawSpell);
      return [spell.key, spell];
    })),
  }])),
]));

export function getMonster(id, grade = 5) { return MONSTERS[id]?.[grade] || null; }

// Poutchs never walk or chase. A real AP buff can unlock their client spell.
export function monsterDecide(view, api, decide) {
  if (getMonster(view.you.monsterId, view.you.monsterGrade)?.behavior !== 'poutch') {
    // A low-level boss should still engage a powerful player. The PvP brain's
    // default threat avoidance can otherwise keep melee monsters out of reach.
    return decide(view, api, { threat: 0.15, aggression: 1, lookahead: 1.4 });
  }
  for (const spell of view.you.spells) {
    if (api.canCast(spell.key, view.you.pos).ok) return api.cast(spell.key, view.you.pos);
  }
  return { type: 'PASS' };
}
