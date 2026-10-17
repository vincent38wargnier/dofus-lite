import { storageKey } from '../platform/config';
import { DEFAULT_CLASS_ID } from '../engine/classes';
import { CLASSES } from '../engine/classes';
import { emptyLoadout, equipSet } from '../engine/equipment';
import { DRAFT_STORAGE, isLoadout } from './loadoutStore';
import { readCreations, cloneCreation, newCreationId } from './creationsStore';
import { readPlayerSetup } from './playerSetupState';

export const PROFILES_STORAGE = storageKey('dofus-lite-profiles-v1');
const ownsClass = id => Object.prototype.hasOwnProperty.call(CLASSES, id);
export const profileName = name => String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);

export function makeProfile(classId, template, existing = []) {
  if (!ownsClass(classId)) throw new Error('Classe inconnue.');
  const baseName = profileName(template?.name) || CLASSES[classId].name;
  const names = new Set(existing.map(profile => profile.name));
  let name = baseName, suffix = 2;
  while (names.has(name)) name = `${baseName.slice(0, 72)} (${suffix++})`;
  return { id: newCreationId(), name, classId,
    className: template?.className || template?.name || CLASSES[classId].name,
    customCharacterId: template?.customCharacterId || (template?.loadout?.spells?.custom ? template.id : null),
    loadout: cloneCreation(template?.loadout || equipSet(emptyLoadout(classId), 1)) };
}

export function validProfiles(value) {
  return value?.version === 1 && Array.isArray(value.profiles) && value.profiles.length > 0
    && value.profiles.every(profile => profile && typeof profile.id === 'string' && profile.id
      && typeof profile.name === 'string' && profileName(profile.name) === profile.name && profile.name
      && ownsClass(profile.classId) && typeof profile.className === 'string'
      && (profile.customCharacterId == null || typeof profile.customCharacterId === 'string') && isLoadout(profile.loadout))
    && new Set(value.profiles.map(profile => profile.id)).size === value.profiles.length
    && value.profiles.some(profile => profile.id === value.activeId);
}

export function readProfiles(storage) {
  try {
    const raw = storage.getItem(PROFILES_STORAGE);
    if (raw) {
      const value = JSON.parse(raw);
      if (!validProfiles(value)) throw new Error('format');
      return { value, error: '' };
    }
    // Copy the existing preparation; legacy stuffs and class drafts stay intact.
    const setup = readPlayerSetup(storage);
    const custom = readCreations(storage).value.characters.find(entry => entry.id === setup.customCharacterId);
    let drafts;
    try { drafts = JSON.parse(storage.getItem(DRAFT_STORAGE)); } catch (_) { /* A default is still usable. */ }
    const old = drafts?.[`A:${setup.playerClass}`];
    const profile = makeProfile(custom?.classId || setup.playerClass, custom || (isLoadout(old) ? { loadout: old } : null));
    const previousProfiles = Object.entries(drafts || {}).filter(([key, loadout]) => key.startsWith('A:') && ownsClass(key.slice(2))
      && isLoadout(loadout) && (custom || key !== `A:${profile.classId}`))
      .map(([key, loadout]) => makeProfile(key.slice(2), { loadout }));
    return { value: { version: 1, profiles: [profile, ...previousProfiles], activeId: profile.id }, error: '' };
  } catch (_) {
    const profile = makeProfile(DEFAULT_CLASS_ID);
    return { value: { version: 1, profiles: [profile], activeId: profile.id },
      error: 'Impossible de lire les profils. La sauvegarde existante est conservée.' };
  }
}

export function persistProfiles(storage, value) {
  if (!validProfiles(value)) throw new Error('Profil invalide.');
  storage.setItem(PROFILES_STORAGE, JSON.stringify(value));
}
