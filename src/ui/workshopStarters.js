import { newAuthoredSpell, normalizeAuthoredSpell } from '../engine/authoredSpells';
import { characterShapeId } from '../visuals/customShapes';
import { newCreationId } from './creationsStore';

export const CREATURE_ROLES = {
  guard: { label: 'Gardien', description: 'Tient le passage, frappe au contact.', color: '#d89449', shape: 'guardian', reference: 106 },
  archer: { label: 'Tireur', description: 'Attaque de loin et ralentit les héros.', color: '#53a8b9', shape: 'ranger', reference: 54 },
  support: { label: 'Soigneur', description: 'Protège ses alliés et les soigne.', color: '#9d80cf', shape: 'mage', reference: 54 },
};
export function starterSpell(preset = 'attack', existing = []) {
  const raw = newAuthoredSpell(existing.map(s => s.id), preset);
  const kind = { attack: 'arrow', heal: 'embers', boost: 'rally', debuff: 'ice-lance', teleport: 'raven-step' }[preset] || 'arrow';
  const { visualSpellId, ...rest } = raw;
  return { ...rest, visualEffect: { version: 1, kind, color: '#5ca4cf', accent: '#e4f4ff', durationMs: 750 } };
}
export function newWorkshopCreature(role = 'guard') {
  const model = CREATURE_ROLES[role] || CREATURE_ROLES.guard;
  const attack = starterSpell();
  attack.name = role === 'archer' ? 'Trait précis' : role === 'support' ? 'Étincelle' : 'Coup de garde';
  attack.description = role === 'guard' ? 'Frappe un ennemi à proximité.' : 'Frappe un ennemi visible à distance.';
  if (role === 'guard') { attack.rangeMax = 1; attack.effects[0].element = 'terre'; attack.visualEffect.kind = 'slash'; }
  const utility = starterSpell(role === 'support' ? 'heal' : role === 'archer' ? 'debuff' : 'boost', [attack]);
  utility.name = role === 'support' ? 'Soin bienveillant' : role === 'archer' ? 'Flèche entravante' : 'Rallier ses forces';
  return { key: `creature-${newCreationId()}`, name: `Mon ${model.label.toLowerCase()}`, role: model.description,
    counterplay: role === 'archer' ? 'Se rapprocher à couvert.' : role === 'support' ? 'L’isoler de ses alliés.' : 'Garder ses distances.',
    reference: { monsterId: model.reference, grade: 1 }, tuning: { hpPercent: 100, statsPercent: 100, paBonus: 1, pmBonus: 0 },
    artworkId: characterShapeId(role === 'guard' ? 'warden' : role === 'support' ? 'mystic' : 'wanderer', model.color), spells: [attack, utility].map(normalizeAuthoredSpell) };
}
