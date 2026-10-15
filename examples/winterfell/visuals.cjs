// New choreography and palette per ability. No client animation identifiers.
const style = (kind, color, accent, durationMs = 1000) => ({ version: 1, kind, color, accent, durationMs });
const steel = kind => style(kind, '#7b9caf', '#eff7ff', 780);
const ice = kind => style(kind, '#66bde6', '#e3fbff', 1100);
const fire = kind => style(kind, '#ed672d', '#ffe3a0', 1100);
const obsidian = kind => style(kind, '#394e75', '#b1c8fa', 950);
const effects = {
  longclaw: steel('slash'), gate: steel('shield'), oath: steel('rally'), icebreaker: ice('shatter'),
  breach: steel('thrust'), charge: steel('raven-step'), needle: steel('thrust'),
  dragonglass: obsidian('shatter'), throw: steel('arrow'), 'not-today': obsidian('raven-step'),
  opening: obsidian('shatter'), wolfstep: obsidian('rally'), ember: fire('fireball'),
  firewave: fire('fire-wave'), warmth: fire('embers'), ruby: fire('shield'), light: fire('rally'),
  flamewake: fire('fire-wave'), 'ice-lance': ice('ice-lance'), toll: ice('bell'), silence: ice('bell'),
  muster: ice('rally'), rust: style('slash', '#9b775b', '#d7c1ab', 850), shield: ice('shield'),
  'rime-arrow': ice('arrow'), pin: ice('ice-lance'), bite: ice('fang'), scent: ice('rally'), drag: ice('fang'),
};
module.exports.visual = key => {
  if (!effects[key]) throw new Error(`Missing original effect: ${key}`);
  return { ...effects[key] };
};
