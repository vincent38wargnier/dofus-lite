import React from 'react';
import { MAPS } from '../engine/maps';
import { KANOJEDO_MAP_ID, POUTCH_ID, POUTCH_GRADES, getMonster } from '../engine/monsters';
import { MapPreview } from './MapPicker';
import { RetroPortrait, useRetroAssets } from './RetroAssets';

export default function KanojedoSetup({ grade, onGradeChange }) {
  const assets = useRetroAssets();
  const monster = getMonster(POUTCH_ID, grade);
  return <div className="match-options kanojedo-options">
    <section className="setup-map"><h3>Kanojedo d’Amakna · [0;0]</h3>
      <MapPreview map={MAPS[KANOJEDO_MAP_ID]} artwork={assets?.imagesReady && assets.maps[KANOJEDO_MAP_ID]} />
      <p>Entraînez vos enchaînements sur un Poutch, avec votre équipement et vos sorts.</p>
    </section>
    <section className="setup-opponent"><h3>Votre cible d’entraînement</h3>
      <div className="opponent-preview"><RetroPortrait monsterId={POUTCH_ID} fallback="🎯" />
        <div><h2>{monster.name}</h2><p>Niveau {monster.level}</p><span>{monster.baseHp.toLocaleString('fr-FR')} PV · 0 PA · 0 PM</span></div>
      </div>
      <label className="field">Niveau du Poutch<select aria-label="Niveau du Poutch" value={grade} onChange={e => onGradeChange(Number(e.target.value))}>
        {POUTCH_GRADES.map(g => <option key={g.grade} value={g.grade}>Niveau {g.level} · {g.baseHp.toLocaleString('fr-FR')} PV</option>)}
      </select></label>
      <p className="opponent-description">0 % de résistance dans les cinq éléments. Il reste sur place et passe son tour.</p>
      <div className="poutch-spell"><strong>Tuerie · 3 PA</strong><p>Si vous lui donnez assez de PA, il peut lancer Tuerie et tuer tous les autres combattants.</p></div>
    </section>
  </div>;
}
