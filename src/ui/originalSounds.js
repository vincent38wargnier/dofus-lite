import { readSoundSettings } from './RetroSound';

// Synthesized here, not sampled from the client. Each action has its own short
// envelope; no media downloads and no audio timing in the combat engine.
export function createOriginalSoundPlayer() {
  let context;
  const active = new Set();
  const stop = () => { for (const voice of active) { try { voice.stop(); } catch (_) { /* Already ended. */ } } active.clear(); };
  const play = kind => {
    const settings = readSoundSettings();
    if (!settings.enabled || !settings.volume) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context ||= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (active.size > 28) stop();
      const now = context.currentTime, volume = settings.volume;
      const tone = (frequency, end, seconds, gain, type = 'sine', delay = 0) => {
        const source = context.createOscillator(), envelope = context.createGain();
        source.type = type; source.frequency.setValueAtTime(frequency, now + delay);
        source.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + delay + seconds);
        envelope.gain.setValueAtTime(0, now); envelope.gain.setValueAtTime(.001, now + delay);
        envelope.gain.exponentialRampToValueAtTime(Math.max(.002, gain * volume), now + delay + .018);
        envelope.gain.exponentialRampToValueAtTime(.001, now + delay + seconds);
        source.connect(envelope); envelope.connect(context.destination); active.add(source);
        source.onended = () => { active.delete(source); source.disconnect(); envelope.disconnect(); };
        source.start(now + delay); source.stop(now + delay + seconds + .01);
      };
      const noise = (seconds, cutoff, gain) => {
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate), data = buffer.getChannelData(0);
        let seed = 8713; for (let n = 0; n < data.length; n++) { seed = (seed * 16807) % 2147483647; data[n] = (seed / 1073741824 - 1) * (1 - n / data.length) ** 2; }
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
        source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff; envelope.gain.value = gain * volume;
        source.connect(filter); filter.connect(envelope); envelope.connect(context.destination); active.add(source);
        source.onended = () => { active.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
        source.start();
      };
      if (kind === 'step') { noise(.075, 900, .12); tone(100, 55, .07, .04); }
      else if (kind === 'failure') { tone(250, 80, .22, .11, 'triangle'); }
      else if (kind === 'critical') { tone(880, 1320, .28, .07); tone(1320, 1760, .3, .05, 'sine', .08); }
      else if (kind === 'bell') { [174, 349, 481, 731].forEach((f, i) => tone(f, f * .995, .95 - i * .09, .13 / (i + 1))); }
      else if (['fireball', 'fire-wave', 'embers'].includes(kind)) { noise(.65, 2400, .26); tone(110, 48, .5, .14); if (kind === 'embers') tone(440, 660, .65, .06); }
      else if (['ice-lance', 'shatter', 'fang'].includes(kind)) { noise(.28, 6000, .11); [1640, 2340, 3120].forEach((f, i) => tone(f, f * .82, .26, .04, 'sine', i * .04)); }
      else if (kind === 'raven-step') { noise(.45, 1100, .18); tone(230, 370, .18, .04, 'triangle'); }
      else if (['shield', 'rally'].includes(kind)) { tone(196, 196, .5, .1); tone(294, 392, .55, .06, 'sine', .08); }
      else { noise(.2, 4200, .18); tone(1400, 440, .19, .06, 'triangle'); }
    } catch (_) { /* Audio unavailable: visuals and combat remain usable. */ }
  };
  return { play, stop, close() { stop(); context?.close().catch(() => {}); context = null; } };
}
