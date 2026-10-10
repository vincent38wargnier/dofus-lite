import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { createSoundPlayer, readSoundSettings, saveSoundSettings } from './RetroSound';
import { ITEMS, itemIcon } from '../engine/equipment';

export const RETRO_BASE = `${process.env.PUBLIC_URL || ''}/dofus-local/`;
const AssetsContext = createContext(null);
const AppearanceContext = createContext({ appearances: { A: 'male', B: 'male' }, setAppearance: () => {} });
const SoundContext = createContext({ settings: { enabled: true, volume: .35 }, setSettings: () => {}, player: null });
let runtime;

export function loadRuffle() {
  if (!runtime) runtime = new Promise((resolve, reject) => {
    if (window.RufflePlayer?.newest) { resolve(window.RufflePlayer.newest()); return; }
    const script = document.createElement('script');
    script.src = `${process.env.PUBLIC_URL || ''}/ruffle/ruffle.js`;
    script.onload = () => resolve(window.RufflePlayer.newest());
    script.onerror = () => { runtime = null; reject(new Error('Ruffle local indisponible')); };
    document.head.appendChild(script);
  });
  return runtime;
}

export function RetroAssetsProvider({ children }) {
  const [assets, setAssets] = useState(null);
  const [appearances, setAppearances] = useState({ A: 'male', B: 'male' });
  const [settings, setSettings] = useState(readSoundSettings);
  const [soundPlayer] = useState(() => createSoundPlayer(RETRO_BASE));
  useEffect(() => {
    window.dofusLiteSound = (name, scope) => {
      const source = scope && document.getElementById(`retro-sound-${scope}`);
      // Combat screens stay mounted behind other tabs to retain their state.
      if (document.hidden || (scope && !source?.getClientRects().length)) return;
      soundPlayer.play(name, scope);
    };
    const hide = () => { if (document.hidden) soundPlayer.stopScope(); };
    document.addEventListener('visibilitychange', hide);
    return () => {
      delete window.dofusLiteSound;
      document.removeEventListener('visibilitychange', hide);
      soundPlayer.stopScope();
    };
  }, [soundPlayer]);
  useEffect(() => { soundPlayer.setLibrary(assets?.audio); }, [assets, soundPlayer]);
  useEffect(() => {
    soundPlayer.configure(settings);
    saveSoundSettings(settings);
  }, [settings, soundPlayer]);
  useEffect(() => {
    let alive = true;
    fetch(`${RETRO_BASE}manifest.json`).then(r => r.ok ? r.json() : null)
      .then(data => { if (alive && data?.version === 1) setAssets(data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const setAppearance = useCallback((side, value) => setAppearances(current => current[side] === value ? current : ({ ...current, [side]: value })), []);
  return (
    <AssetsContext.Provider value={assets}>
      <AppearanceContext.Provider value={{ appearances, setAppearance }}>
        <SoundContext.Provider value={{ settings, setSettings, player: soundPlayer }}>{children}</SoundContext.Provider>
      </AppearanceContext.Provider>
    </AssetsContext.Provider>
  );
}

export const useRetroAssets = () => useContext(AssetsContext);
export const useAppearances = () => useContext(AppearanceContext);

export function useSoundScene(scene) {
  const { player } = useContext(SoundContext);
  useEffect(() => () => player?.stopScope(), [player, scene]);
}

export function getActorId(assets, fighter, appearance = 'male') {
  if (!assets) return null;
  return fighter.isSummon ? assets.monsters[fighter.monsterId] || null
    : assets.classes[fighter.classId]?.[appearance] || null;
}

// Original clips use R for the front diagonal, L for the rear diagonal,
// and mirror horizontally for the opposite side of the map.
export function facing(from, to, fallback = { suffix: 'R', mirror: false }) {
  if (!from || !to || (from.x === to.x && from.y === to.y)) return fallback;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { suffix: dx + dy >= 0 ? 'R' : 'L', mirror: dx - dy < 0 };
}

export function resolveAnimation(actor, requested, direction = 'R') {
  if (!actor) return null;
  return [`${requested}${direction}`, `${requested}R`, `static${direction}`, 'staticR', actor.animations[0]]
    .find(name => actor.animations.includes(name));
}

export function combatAnimationMs(events, fighters, assets, appearances = {}) {
  let duration = 250;
  for (const event of events || []) {
    if (event.t === 'move') duration = Math.max(duration, event.cost * 130 + 120);
    if (event.t === 'cast') {
      const fighter = fighters[event.fighter];
      const actor = assets?.actors[getActorId(assets, fighter || {}, appearances[fighter?.team])];
      const spell = assets?.spells[event.spellId];
      const animation = resolveAnimation(actor, event.weaponAnimation != null ? `anim${event.weaponAnimation}` : spell?.animation || 'anim0');
      duration = Math.max(duration, actor?.durations?.[animation] || 1000, spell?.duration || 1000);
    }
    if (event.t === 'damage') duration = Math.max(duration, 650);
  }
  return Math.min(6000, duration + 100);
}

export function RetroMovie({ url, animation, restart = 0, className = '', style, onFailure, onReady, scriptAccess = false, parameters, soundTail }) {
  const soundScope = useId();
  const { player: soundPlayer } = useContext(SoundContext);
  const mount = useRef(null);
  const playerRef = useRef(null);
  const desired = useRef({ animation, restart });
  const failureRef = useRef(onFailure);
  const readyRef = useRef(onReady);
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;
  failureRef.current = onFailure;
  readyRef.current = onReady;
  desired.current = { animation, restart };
  useEffect(() => {
    let disposed = false;
    let timer;
    let player;
    const request = new AbortController();
    const start = async () => {
      try {
        // Fetch before creating the player. Its URL loader otherwise leaves a
        // pending Rust callback when a fast class/spell change removes the clip.
        const [ruffle, data] = await Promise.all([loadRuffle(),
          fetch(RETRO_BASE + url, { signal: request.signal }).then(response => {
            if (!response.ok) throw new Error(`Animation indisponible : ${url}`);
            return response.arrayBuffer();
          })]);
        if (disposed) return;
        player = ruffle.createPlayer();
        player.style.width = '100%';
        player.style.height = '100%';
        mount.current.appendChild(player);
        await player.ruffle().load({
          data, swfFileName: url, base: new URL(RETRO_BASE + 'raw/', window.location.href).href, autoplay: 'on', wmode: 'transparent',
          splashScreen: false, unmuteOverlay: 'hidden', contextMenu: 'off',
          allowScriptAccess: scriptAccess, allowNetworking: 'all', openUrlMode: 'deny',
          letterbox: 'off', logLevel: 'error',
          parameters: { ...parametersRef.current, soundScope },
        });
        if (disposed) return;
        player.ruffle().volume = 0;
        let attempts = 0;
        const ready = () => {
          if (disposed) return;
          if (player.ruffle().readyState === 2 && (!scriptAccess || typeof player.animate === 'function')) {
            playerRef.current = player;
            if (desired.current.animation) player.ruffle().callExternalInterface('animate', desired.current.animation);
            readyRef.current?.();
          } else if (++attempts < 200) timer = setTimeout(ready, 25);
          else failureRef.current?.();
        };
        ready();
      } catch (error) {
        if (!disposed) failureRef.current?.(error);
      }
    };
    start();
    return () => {
      disposed = true;
      request.abort();
      clearTimeout(timer);
      playerRef.current = null;
      player?.remove();
      // This is a completion flag, not a DOM ref: read its latest value.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!soundTail?.current) soundPlayer?.stopScope(soundScope);
    };
  }, [url, scriptAccess, soundPlayer, soundScope, soundTail]);
  useEffect(() => {
    if (animation) playerRef.current?.ruffle().callExternalInterface('animate', animation);
  }, [animation, restart]);
  return <span ref={mount} id={`retro-sound-${soundScope}`} className={`retro-movie ${className}`} style={style} aria-hidden="true" />;
}

export function RetroSpellEffect({ url, from, to, scale, grade = 5, duration = 2200, onComplete }) {
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const soundTail = useRef(false);
  const completed = useRef(onComplete);
  completed.current = onComplete;
  useEffect(() => {
    if (!ready) return undefined;
    // A recording can outlast its visual. Let it finish on natural completion;
    // changing spell/screen or muting still cancels it through the sound scene.
    const timer = setTimeout(() => { soundTail.current = true; setVisible(false); completed.current?.(); }, Math.max(700, duration + 250));
    return () => clearTimeout(timer);
    // Start the lifetime after loading so a cold cache cannot cut the movie short.
  }, [ready, duration]);
  return visible ? <RetroMovie url={url} scriptAccess className="retro-spell-effect" soundTail={soundTail}
    parameters={{ fromX: String((from.x - to.x) / scale), fromY: String((from.y - to.y) / scale), spellLevel: String(grade) }}
    style={{ position: 'absolute', zIndex: 600, width: 400 * scale, height: 400 * scale, left: to.x - 200 * scale, top: to.y - 200 * scale }}
    onReady={() => setReady(true)}
    onFailure={() => { setVisible(false); completed.current?.(); }} /> : null;
}

export function RetroPortrait({ classId, side = 'A', appearance, fallback = '', className = '' }) {
  const assets = useRetroAssets();
  const { appearances } = useAppearances();
  const id = assets?.classes[classId]?.[appearance || appearances[side]];
  const [failed, setFailed] = useState(null);
  return assets?.imagesReady && id && failed !== id
    ? <img className={`retro-portrait ${className}`} src={`${RETRO_BASE}portraits/${id}.png`} alt="" onError={() => setFailed(id)} />
    : <span>{fallback}</span>;
}

export function RetroSpellIcon({ spell }) {
  const assets = useRetroAssets();
  const icon = spell.itemId ? itemIcon(ITEMS[spell.itemId])
    : assets?.imagesReady && assets.renderedSpellIcons?.includes(String(spell.id)) && assets.spells[spell.id]?.icon;
  const [failed, setFailed] = useState(null);
  return icon && failed !== icon
    ? <img className="retro-spell-icon" src={spell.itemId ? icon : RETRO_BASE + icon} alt="" onError={() => setFailed(icon)} />
    : <span>{spell.emoji}</span>;
}

export function AppearanceSelect({ side, value, onChange }) {
  const assets = useRetroAssets();
  const { appearances, setAppearance } = useAppearances();
  if (!assets) return null;
  return (
    <label className="field">
      Apparence {side === 'A' ? 'du joueur' : 'adverse'}
      <select aria-label={`Apparence ${side === 'A' ? 'du joueur' : 'adverse'}`} value={value ?? appearances[side]} onChange={e => { setAppearance(side, e.target.value); onChange?.(e.target.value); }}>
        <option value="male">Masculine</option>
        <option value="female">Féminine</option>
      </select>
    </label>
  );
}

export function RetroStatus({ compact = false }) {
  const assets = useRetroAssets();
  const { settings, setSettings } = useContext(SoundContext);
  const controls = <div className="retro-sound-controls">
    <button className="retro-sound-toggle" onClick={() => setSettings(current => ({ ...current, enabled: !current.enabled }))} aria-pressed={settings.enabled}>
      {settings.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{settings.enabled ? 'Bruitages activés' : 'Bruitages coupés'}
    </button>
    <label className="retro-volume">Volume <input type="range" min="0" max="100" step="5" value={Math.round(settings.volume * 100)}
      aria-label="Volume des bruitages" onChange={e => setSettings(current => ({ ...current, volume: Number(e.target.value) / 100 }))} />
      <span>{Math.round(settings.volume * 100)} %</span>
    </label>
  </div>;
  if (compact) return <details className="sound-settings"><summary aria-label="Réglages du son">{settings.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}<span>Son</span></summary>{controls}</details>;
  return assets ? <div className="retro-status"><span>Client Retro local · 12 classes · 24 apparences</span>
    {controls}
  </div> : null;
}
