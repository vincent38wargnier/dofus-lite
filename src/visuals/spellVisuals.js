// Original, declarative visuals. These identifiers select our SVG choreography,
// never a client SWF, script, URL or damage rule.
export const ORIGINAL_EFFECTS = ['slash', 'thrust', 'arrow', 'ice-lance', 'shatter', 'fireball',
  'fire-wave', 'shield', 'embers', 'raven-step', 'fang', 'rally', 'bell'];
export function validSpellVisual(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && value.version === 1
    && Object.keys(value).every(k => ['version', 'kind', 'color', 'accent', 'durationMs'].includes(k))
    && ORIGINAL_EFFECTS.includes(value.kind)
    && ['color', 'accent'].every(k => /^#[0-9a-f]{6}$/i.test(value[k]))
    && Number.isInteger(value.durationMs) && value.durationMs >= 250 && value.durationMs <= 1500;
}
