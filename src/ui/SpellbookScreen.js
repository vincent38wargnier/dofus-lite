import React, { useEffect, useState } from 'react';
import { CLASSES, CLASS_IDS, SPELL_LIBRARY, spellAtGrade } from '../engine/classes';
import { RETRO_BASE, RetroMovie, RetroSpellEffect, RetroSpellIcon, resolveAnimation, useRetroAssets, useSoundScene } from './RetroAssets';
import { castAnimation } from './retroAnimation';

const LABELS = {
  damage: 'Dégâts', lifeSteal: 'Vol de vie', heal: 'Soin', poison: 'Poison',
  buffPa: 'Bonus PA', buffPm: 'Bonus PM', removePa: 'Retrait PA', removePm: 'Retrait PM',
  stealPa: 'Vol PA', stealPm: 'Vol PM', armor: 'Armure', buffPower: 'Puissance',
  buffDamage: 'Dommages', buffStat: 'Bonus', debuffStat: 'Malus', stealStat: 'Vol',
  buffCrit: 'Coups critiques', buffVitality: 'Vitalité', buffRange: 'Portée', debuffRange: 'Malus portée',
  resistBuff: 'Résistance', resistDebuff: 'Vulnérabilité', summon: 'Invocation',
  push: 'Poussée', pull: 'Attirance', teleport: 'Téléportation', swap: 'Échange',
  state: 'État', removeState: 'Retrait état', spellBoost: 'Charge du sort',
  percentLifeDamage: 'Dégâts en % de vie', selfDamage: 'Dégâts au lanceur',
  erosion: 'Érosion', fixedLifeSteal: 'Vol de vie fixe', fixedHeal: 'Soin fixe',
  invisibility: 'Invisibilité', reveal: 'Détection', weaponMastery: 'Maîtrise d’arme',
  carry: 'Porter', throw: 'Lancer', fear: 'Peur', rollback: 'Retour aux positions initiales',
  spellReflection: 'Renvoi de sort', damageReflection: 'Renvoi de dommages',
  ecaflipLuck: 'Chance d’Ecaflip', sacrifice: 'Sacrifice', minRolls: 'Jets minimisés', maxRolls: 'Jets maximisés',
  skipTurn: 'Tour passé', dodgeMelee: 'Esquive au contact', apPoison: 'Poison par PA utilisés', damageOnHit: 'Perte de vie par coup reçu',
  staticSummon: 'Invocation statique', double: 'Double', lifeTransfer: 'Transfert de vie', revive: 'Résurrection',
  delayedSpell: 'Sort différé', outOfCombat: 'Hors combat', cosmetic: 'Apparence', kill: 'Mort',
  resistAllBuff: 'Résistances élémentaires', punishment: 'Châtiment', punitionDamage: 'Punition',
  trap: 'Piège', glyph: 'Glyphe', refundPa: 'PA rendus au lanceur',
};

function Effects({ effects }) {
  return <table className="spell-effects"><thead><tr><th>Effet</th><th>Valeur</th><th>Zone</th><th>Durée</th><th>Chance</th></tr></thead>
    <tbody>{effects.map((e, i) => <tr key={i} className={e.kind === 'ignore' || e.kind.startsWith('unknown') ? 'muted' : ''}>
      <td>{LABELS[e.kind] || (e.kind === 'ignore' ? 'Non simulé' : e.kind)} {e.element || e.stat || ''} <small>#{e.id}</small></td>
      <td>{e.kind === 'state' || e.kind === 'removeState' ? e.p3 : e.kind === 'spellBoost' ? e.p3 : `${e.min ?? '—'}${e.max !== e.min ? `–${e.max}` : ''}`}</td>
      <td>{e.zone}</td><td>{e.duration ? `${e.duration} tours` : 'Immédiat'}</td><td>{e.chance || 100}%</td>
    </tr>)}</tbody></table>;
}

export default function SpellbookScreen() {
  const assets = useRetroAssets();
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState(null);
  const [classId, setClassId] = useState('IOP');
  const [query, setQuery] = useState('');
  const [id, setId] = useState(141);
  const [grade, setGrade] = useState(5);
  const [preview, setPreview] = useState(0);
  useSoundScene(`${classId}-${id}-${grade}-${query}`);
  useEffect(() => {
    let active = true;
    fetch(RETRO_BASE + 'spell-catalogue.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { if (active) setCatalogue(data); }).catch(() => { if (active) setError('Le catalogue local doit être importé avec yarn import:spells.'); });
    return () => { active = false; };
  }, []);
  if (error) return <div className="panel">{error}</div>;
  if (!catalogue) return <div className="panel">Chargement du grimoire…</div>;
  const ids = classId === 'ALL' ? null : classId === 'COMMON' ? catalogue.common : catalogue.classes[classId];
  const spells = catalogue.spells.filter(s => (!ids || ids.includes(s.id)) && `${s.name} ${s.id}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  const spell = spells.find(s => s.id === id) || spells[0];
  const level = spell?.grades.find(g => g.grade === grade) || spell?.grades[spell.grades.length - 1];
  const playable = SPELL_LIBRARY.spells[spell?.id] && level ? spellAtGrade(spell.id, level.grade) : null;
  const info = assets?.spells[spell?.id];
  const spellClass = CLASS_IDS.find(c => catalogue.classes[c].includes(spell?.id)) || 'IOP';
  const actorId = assets?.classes[spellClass]?.male || '80';
  const actor = assets?.actors[actorId];
  const animation = resolveAnimation(actor, preview ? castAnimation({ spellId: spell?.id }, assets) : 'static');
  return <div className="spellbook">
    <div className="panel spellbook-heading"><div><h2>Grimoire des sorts</h2><p className="muted">{catalogue.spells.length.toLocaleString('fr')} sorts · tous les grades disponibles · animations du client local</p></div>
      <label className="field">Classe<select aria-label="Classe du grimoire" value={classId} onChange={e => { setClassId(e.target.value); setPreview(0); }}>
        {CLASS_IDS.map(c => <option key={c} value={c}>{CLASSES[c].name}</option>)}<option value="COMMON">Sorts communs / parchemins</option><option value="ALL">Tous les sorts et monstres</option>
      </select></label>
      <label className="field">Recherche<input type="text" placeholder="Nom ou numéro du sort" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    <p className="muted small">282 sorts de joueur · 1 692 grades · <a href="/dofus-local/spell-audit.json" target="_blank" rel="noreferrer">Audit de chaque sort</a>. Sélection et ordre dans la préparation avant le combat.</p>
    <div className="spellbook-columns"><div className="panel spellbook-list">{spells.map(s => <button key={s.id} className={`spellbook-item${spell?.id === s.id ? ' selected' : ''}`} onClick={() => { setId(s.id); setPreview(0); }}>
      <RetroSpellIcon spell={{ id: s.id, emoji: '✦' }} /><span>{s.name}<small>#{s.id} · {s.grades.length} grades</small></span>
    </button>)}</div>
      <div className="panel spellbook-detail">{spell && level ? <>
        <div className="spellbook-heading"><h2>{spell.name}</h2><label className="field">Grade<select aria-label="Grade du sort" value={level.grade} onChange={e => { setGrade(Number(e.target.value)); setPreview(0); }}>
          {spell.grades.map(g => <option key={g.grade} value={g.grade}>{g.grade}</option>)}
        </select></label></div>
        <p className="spell-status">{playable ? `${playable.unsupportedEffects.length ? 'Partiellement simulé' : 'Disponible en préparation'} · grade ${playable.grade} · niveau ${level.requiredLevel}` : 'Consultable — mécanique non disponible en combat'}{spell.excludedReason ? ` · ${spell.excludedReason}` : ''}</p>
        <p>{spell.description}</p>
        {spell.auditNotes?.length > 0 && <div className="spell-audit-notes"><strong>Limites vérifiées lors de l’audit</strong><ul>{spell.auditNotes.map(note => <li key={note}>{note}</li>)}</ul></div>}
        <div className="spell-facts"><span><b>{level.pa}</b> PA</span><span><b>{level.rangeMin}–{level.rangeMax}</b> portée</span><span><b>{level.maxPerTurn || '∞'}</b> / tour</span><span><b>{level.maxPerTarget || '∞'}</b> / cible</span><span><b>{level.cooldown}</b> tours de relance</span></div>
        <p className="muted small">{level.lineOnly ? 'En ligne · ' : ''}{level.needsLos ? 'Ligne de vue requise' : 'Sans ligne de vue'} · {level.adjustableRange ? 'Portée modifiable' : 'Portée fixe'} · Niveau requis {level.requiredLevel}</p>
        {actor && <><div className="spell-preview-stage">
          <RetroMovie url={actor.url} animation={animation} restart={preview} scriptAccess className="spell-preview-caster" />
          {assets.actors['90'] && <RetroMovie url={assets.actors['90'].url} animation="staticR" style={{ transform: 'scaleX(-1)' }} scriptAccess className="spell-preview-target" />}
          {preview > 0 && info?.effect && <RetroSpellEffect key={`${spell.id}-${level.grade}-${preview}`} url={info.effect} grade={level.grade}
            type={info.type} fps={info.fps} exportFrames={info.exportFrames} duration={info.duration}
            from={{ x: 80, y: 160 }} to={{ x: 310, y: 160 }} scale={.8} />}
        </div><button className="btn" onClick={() => setPreview(n => n + 1)}>Voir l’animation originale</button></>}
        <h3>Effets normaux</h3><Effects effects={level.effects} />
        {level.critEffects.length > 0 && <><h3>Coup critique · 1/{level.critRate} avant bonus</h3><Effects effects={level.critEffects} /></>}
        <p className="muted small">Échec critique : {level.failRate ? `1/${level.failRate}` : 'aucun'}{level.endsTurnOnFailure ? ' · termine le tour' : ''}. Valeurs des six grades importées du client Retro. Cibles et comportements serveur reconstitués séparément ; aucune certification du serveur officiel. Le catalogue conserve les effets hors combat.</p>
      </> : <p>Aucun sort trouvé.</p>}</div>
    </div>
  </div>;
}
