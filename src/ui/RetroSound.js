const SETTINGS_KEY = 'dofus-lite-sound';

export function readSoundSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return { enabled: saved?.enabled !== false,
      volume: Number.isFinite(saved?.volume) ? Math.max(0, Math.min(1, saved.volume)) : .35 };
  } catch { return { enabled: true, volume: .35 }; }
}

export function saveSoundSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Private browsing may disable storage. */ }
}

export function resolveSound(audio, name) {
  // SOMA.playSound in the client normalizes these characters before looking
  // up AUEC. Monster clips often use spaces/hyphens instead of alias names.
  const alias = String(name).replace(/ /g, '_').replace(/é/g, 'e').replace(/à/g, 'a').replace(/-/g, '_').toUpperCase();
  const cue = audio?.cues?.[alias];
  if (cue) return cue;
  const url = audio?.effects?.[name];
  return url ? { url, volume: 1, offset: 0 } : null;
}

// The Flash timelines supply timing; this mixer only resolves and plays their
// cues. Keeping each voice scoped to its movie prevents sounds surviving a
// changed spell preview, map, or screen.
export function createSoundPlayer(base, makeAudio = url => new Audio(url)) {
  const voices = new Set();
  let library;
  let settings = { enabled: false, volume: .35 };
  const stop = voice => {
    voice.audio.pause();
    voice.audio.onended = null;
    voice.audio.onerror = null;
    voices.delete(voice);
  };
  const stopScope = scope => {
    for (const voice of voices) if (scope === undefined || voice.scope === scope) stop(voice);
  };
  return {
    setLibrary(value) { library = value; },
    configure(value) {
      settings = value;
      if (!settings.enabled || settings.volume === 0) stopScope();
      else for (const voice of voices) voice.audio.volume = Math.min(1, settings.volume * voice.gain);
    },
    stopScope,
    play(name, scope) {
      if (!settings.enabled || settings.volume === 0) return;
      const cue = resolveSound(library, name);
      if (!cue) return;
      if (voices.size >= 12) stop(voices.values().next().value);
      const audio = makeAudio(base + cue.url);
      const voice = { audio, scope, gain: cue.volume ?? 1 };
      audio.volume = Math.max(0, Math.min(1, settings.volume * voice.gain));
      if (cue.offset > 0) audio.currentTime = cue.offset;
      audio.onended = audio.onerror = () => stop(voice);
      voices.add(voice);
      audio.play()?.catch(() => stop(voice));
    },
  };
}
