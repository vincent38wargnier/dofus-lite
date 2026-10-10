import { castAnimation, facing, resolveAnimation } from './retroAnimation';
import { resolveSound } from './RetroSound';

const audible = (names, assets) => (names || []).filter(name => resolveSound(assets?.audio, name));

// PNG actors have no Flash timeline to dispatch their model's casting cue.
export function customActorCastSound(actor, pose, suffix, assets) {
  if (!pose?.startsWith('anim')) return null;
  return audible(actor?.sounds?.[resolveAnimation(actor, pose, suffix)], assets)[0] || null;
}

export function movementSounds(actor, fighter, assets) {
  // Take the creature's own authored footsteps first, including sounds from
  // its running animation when the walking export is silent.
  for (const pose of ['walkR', 'walkL', 'runR', 'runL']) {
    const names = audible(actor?.sounds?.[pose], assets);
    if (names.length) return names;
  }
  // Several client sprites have no footstep calls. These are explicit
  // simulator fallbacks using client recordings, not invented native timing.
  const name = fighter.name || '';
  const fallback = /blop/i.test(name) ? 'BLOP_STEP'
    : /gelée|larve/i.test(name) ? 'SLOP'
      : /craqueleur/i.test(name) ? 'KRAK_STEP'
        : /tofu|corbac|kwak/i.test(name) ? 'BAT_AILES' : 'PAS_HOMME_NORMAL';
  return audible([fallback], assets);
}

export function castFallbackSound(event, spell, actor, assets, direction = { suffix: 'R', mirror: false }) {
  const info = assets?.spells?.[event.visualSpellId ?? event.spellId];
  // Until metadata has loaded, don't overlay an unknown native animation.
  if (!actor?.sounds) return null;
  const pose = castAnimation(event, assets);
  if (pose === null) return null;
  const label = resolveAnimation(actor, pose, facing(event.from, event.target, direction).suffix);
  if (audible(actor.sounds[label], assets).length || audible(info?.sounds, assets).length) return null;
  const effects = event.crit && spell?.critEffects?.length ? spell.critEffects : spell?.effects || [];
  const kinds = effects.map(effect => effect.kind);
  // The original Tofu invocation, Guérison and Puissance supply distinct
  // feedback for silent summon/healing/boost animations respectively.
  const cue = kinds.some(k => ['summon', 'staticSummon', 'double', 'resurrect'].includes(k)) ? 'CROCKETTE_206'
    : kinds.some(k => ['heal', 'fixedHeal', 'healPercent'].includes(k)) ? 'GUERISON'
      : kinds.some(k => ['damage', 'lifeSteal', 'fixedLifeSteal', 'punitionDamage', 'kill'].includes(k)) ? 'PUNCH'
        : 'GONFLE';
  return audible([cue], assets)[0] || null;
}

export function criticalSound(event, assets) {
  // Client GA301/304 uses BIP; GA302/305 uses COUP_CRITIQUE, despite its name.
  if (event.t === 'cast' && event.crit) return assets?.audio?.combat?.criticalHit;
  if (event.t === 'spell_fail') return assets?.audio?.combat?.criticalFailure;
  return null;
}
