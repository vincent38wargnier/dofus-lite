import { CLASSES } from './classes';
import { resolveLoadout } from './equipment';

// Optional rules attached to a dungeon. Heroes are complete snapshots, never
// references to the author's profile, equipment library or custom class.
export const MAX_ADVENTURE_HEROES = 8;
export const newAdventure = () => ({ version: 1, mode: 'fixed', partySize: 1, allowAI: true, description: '', heroes: [] });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const copy = value => JSON.parse(JSON.stringify(value));
export const adventureEnabled = dungeon => dungeon?.adventure != null;

export function validAdventure(value) {
  return !!(record(value) && value.version === 1 && ['fixed', 'choice'].includes(value.mode)
    && Object.keys(value).every(key => ['version', 'mode', 'partySize', 'allowAI', 'description', 'heroes'].includes(key))
    && Number.isInteger(value.partySize) && value.partySize >= 1 && value.partySize <= 8
    && typeof value.allowAI === 'boolean' && typeof value.description === 'string' && value.description.length <= 1200
    && Array.isArray(value.heroes) && value.heroes.length <= MAX_ADVENTURE_HEROES
    && value.heroes.every(hero => record(hero) && Object.keys(hero).every(key => ['id', 'character'].includes(key))
      && typeof hero.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(hero.id)
      && record(hero.character) && typeof hero.character.name === 'string' && !!hero.character.name.trim() && hero.character.name.length <= 80
      && Object.prototype.hasOwnProperty.call(CLASSES, hero.character.classId) && record(hero.character.loadout))
    && new Set(value.heroes.map(hero => hero.id)).size === value.heroes.length);
}

export function adventureErrors(dungeon) {
  if (!adventureEnabled(dungeon)) return [];
  const rules = dungeon.adventure;
  if (!validAdventure(rules)) return ['Les règles de l’aventure sont invalides.'];
  const errors = [];
  if (!rules.heroes.length) errors.push('Ajoutez au moins un héros prêt à jouer.');
  if (rules.mode === 'choice' && rules.partySize > rules.heroes.length) errors.push('Proposez assez de héros pour constituer l’équipe.');
  for (const { character } of rules.heroes) {
    try { errors.push(...resolveLoadout(character.classId, character.loadout).errors.map(error => `${character.name} : ${error}`)); }
    catch (_) { errors.push(`${character.name} : équipement ou sorts invalides.`); }
  }
  return errors;
}

export function addAdventureHero(rules, character, id) {
  if (!rules || rules.heroes.length >= MAX_ADVENTURE_HEROES) return rules;
  return { ...rules, heroes: [...rules.heroes, { id, character: copy({ name: character.name, classId: character.classId,
    className: character.className || CLASSES[character.classId].name, loadout: character.loadout }) }] };
}

export function defaultAdventureChoice(dungeon) {
  const rules = dungeon.adventure;
  return { heroIds: rules.heroes.slice(0, rules.mode === 'fixed' ? rules.heroes.length : rules.partySize).map(h => h.id), automatic: false };
}

// Only IDs and control preference enter from the player's UI. All combat
// values come from the package, including levels, FM, spell grades and art.
export function adventureTeam(dungeon, choice = defaultAdventureChoice(dungeon)) {
  const errors = adventureErrors(dungeon);
  if (errors.length) throw new Error(errors.join(' '));
  const rules = dungeon.adventure;
  if (!rules) throw new Error('Ce donjon ne fournit pas de héros.');
  const ids = rules.mode === 'fixed' ? rules.heroes.map(h => h.id) : choice?.heroIds;
  if (!Array.isArray(ids) || ids.length !== (rules.mode === 'fixed' ? rules.heroes.length : rules.partySize)
    || new Set(ids).size !== ids.length || ids.some(id => !rules.heroes.some(h => h.id === id))) {
    throw new Error(`Choisissez ${rules.partySize} héros parmi ceux de l’aventure.`);
  }
  if (choice?.automatic && !rules.allowAI) throw new Error('Cette aventure se joue manuellement.');
  return ids.map(id => ({ kind: 'character', ...copy(rules.heroes.find(h => h.id === id).character),
    controller: choice?.automatic ? 'ai' : 'player', botId: 'maison' }));
}

export function adventureSelectionErrors(dungeon, choice) {
  try { adventureTeam(dungeon, choice); return []; } catch (error) { return [error.message]; }
}
