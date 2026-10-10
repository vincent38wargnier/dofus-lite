import React, { useState } from 'react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { RETRO_BASE, RetroMovie, useRetroAssets } from './RetroAssets';

function animationName(value) {
  const match = value.match(/^(.*)([RLSFB])$/);
  if (!match) return value;
  const name = { static: 'Repos', walk: 'Marche', run: 'Course', hit: 'Impact', die: 'Mort', bonus: 'Bonus' }[match[1]]
    || match[1].replace(/^emoteStatic/, 'Pose ').replace(/^emote/, 'Émote ').replace(/^anim/, 'Sort ');
  return `${name} · ${match[2]}`;
}

export default function RetroLibraryScreen() {
  const assets = useRetroAssets();
  const [classId, setClassId] = useState('IOP');
  const [sex, setSex] = useState('male');
  const [customId, setCustomId] = useState('');
  const [animation, setAnimation] = useState('staticR');
  const [restart, setRestart] = useState(0);
  const [music, setMusic] = useState('');
  if (!assets) return <div className="panel">La bibliothèque du client local n’est pas installée. Lancez l’import indiqué dans le README du projet.</div>;
  const id = customId || assets.classes[classId][sex];
  const actor = assets.actors[id];
  const current = actor.animations.includes(animation) ? animation : actor.animations[0];
  return (
    <div className="retro-library">
      <div className="panel">
        <h2>Les douze classes</h2>
        <div className="retro-class-grid">
          {CLASS_IDS.map(c => (
            <button key={c} className={`retro-class-choice${classId === c && !customId ? ' selected' : ''}`} onClick={() => { setClassId(c); setCustomId(''); }}>
              {assets.imagesReady ? <img src={`${RETRO_BASE}portraits/${assets.classes[c][sex]}.png`} alt="" /> : CLASSES[c].emoji}
              <span>{CLASSES[c].name}</span>
            </button>
          ))}
        </div>
        <p className="muted small">Personnages et animations issus de votre client Retro local.</p>
      </div>
      <div className="panel retro-preview-panel">
        <h2>{customId ? `Créature ${id}` : CLASSES[classId].name}</h2>
        <div className="retro-preview">
          <RetroMovie url={actor.url} animation={current} restart={restart} scriptAccess />
        </div>
        <div className="retro-preview-controls">
          <label className="field">Apparence<select value={sex} onChange={e => { setSex(e.target.value); setCustomId(''); }}><option value="male">Masculine</option><option value="female">Féminine</option></select></label>
          <label className="field">Animation<select value={current} onChange={e => setAnimation(e.target.value)}>{actor.animations.map(a => <option value={a} key={a}>{animationName(a)}</option>)}</select></label>
          <button className="btn" onClick={() => setRestart(n => n + 1)}>Rejouer</button>
          <label className="field">Autres personnages et créatures<select value={customId} onChange={e => setCustomId(e.target.value)}><option value="">Classe sélectionnée</option>{Object.keys(assets.actors).map(a => <option key={a} value={a}>Apparence {a}</option>)}</select></label>
        </div>
        <p className="muted small">{actor.animations.length} animations · {Object.keys(assets.actors).length} apparences disponibles</p>
      </div>
      <div className="panel retro-music-panel">
        <label className="field">Musiques originales<select value={music} onChange={e => setMusic(e.target.value)}><option value="">Choisir une musique</option>{Object.entries(assets.audio?.musics || {}).map(([name, url]) => <option key={name} value={url}>{name.replace('.mp3', '').replaceAll('_', ' ')}</option>)}</select></label>
        {music ? <audio key={music} controls loop src={RETRO_BASE + music} /> : null}
      </div>
    </div>
  );
}
