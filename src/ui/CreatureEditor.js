import { creatureBase } from '../engine/authoringTemplates';
import React, { useState } from 'react';
import { ArrowLeft, Palette, BookOpen, SlidersHorizontal } from 'lucide-react';
import { monsterGrades } from '../engine/monsters';
import { resolveCustomMonster, validCustomMonster, customMonsterBase } from '../engine/customMonsters';
import CharacterArtworkEditor from './CharacterArtworkEditor';
import CustomSpellPicker from './CustomSpellPicker';
import { RetroPortrait } from './RetroAssets';
import { WorkshopStepIntro } from './WorkshopHelp';
import { MONSTER_CATALOGUE, fold } from './creationCatalogue';
import { useWorlds, WorldFilter } from './WorldsContext';

export default function CreatureEditor({ monster, onChange, onClose }) {
  const worlds = useWorlds();
  const [step, setStep] = useState('identity');
  const [name, setName] = useState(monster.name);
  const [modelsOpen, setModelsOpen] = useState(false), [query, setQuery] = useState('');
  const patch = data => onChange({ ...monster, ...data });
  const tuning = data => patch({ tuning: { ...monster.tuning, ...data } });
  const reference = customMonsterBase(monster);
  const resolved = validCustomMonster(monster) ? resolveCustomMonster(monster) : null;
  const hp = Math.round(reference.baseHp * monster.tuning.hpPercent / 100);
  return <section className="creator-card workshop-creature-editor" aria-label="Créateur de créature">
    <button type="button" className="btn" onClick={onClose}><ArrowLeft size={15} />Revenir au groupe</button>
    <div className="workshop-creature-heading"><RetroPortrait artworkId={monster.artworkId} monsterId={monster.reference.monsterId} /><div><h3>{monster.name}</h3><p>{hp} PV · {resolved?.basePa ?? reference.basePa + monster.tuning.paBonus} PA · {resolved?.basePm ?? reference.basePm + monster.tuning.pmBonus} PM</p></div></div>
    <nav className="studio-editor-tabs" aria-label="Étapes de la créature">{[['identity', 'Identité', SlidersHorizontal], ['spells', 'Sorts', BookOpen], ['appearance', 'Apparence', Palette]].map(([id, label, Icon], i) => <button type="button" key={id} aria-pressed={step === id} onClick={() => setStep(id)}><Icon size={16} />{i + 1}. {label}</button>)}</nav>
    {step === 'identity' && <>
      <WorkshopStepIntro number="1" title="Donnez-lui un rôle">Une faiblesse claire rend votre créature intéressante à affronter. Tout est modifiable, sans fichier ni IA.</WorkshopStepIntro>
      <label className="field">Nom de la créature<input type="text" value={name} maxLength={80} onChange={e => { setName(e.target.value); if (e.target.value.trim()) patch({ name: e.target.value }); }} onBlur={() => { if (!name.trim()) setName(monster.name); }} /></label>
      <label className="field">Son rôle<textarea rows={2} value={monster.role || ''} maxLength={500} onChange={e => patch({ role: e.target.value })} /></label>
      <label className="field">Comment la battre<textarea rows={2} value={monster.counterplay || ''} maxLength={500} onChange={e => patch({ counterplay: e.target.value })} /></label>
      <fieldset className="workshop-power"><legend>Résistance et puissance</legend>
        <label className="field">Gabarit de puissance<select aria-label="Gabarit de puissance" value={`${monster.reference.monsterId}:${monster.reference.grade}`} onChange={e => { const [monsterId, grade] = e.target.value.split(':').map(Number); patch(monster.base ? { base: creatureBase(monsterId === 181 ? 'boss' : monsterId === 106 ? 'guard' : 'archer'), reference: { monsterId, grade } } : { reference: { monsterId, grade } }); }}>
          {![54,106,181].includes(monster.reference.monsterId) || monster.reference.grade !== 1 ? <option value={`${monster.reference.monsterId}:${monster.reference.grade}`}>Gabarit actuel · {reference.baseHp} PV de base</option> : null}
          <option value="54:1">Léger · 200 PV de base</option><option value="106:1">Solide · 300 PV de base</option><option value="181:1">Boss · 1 600 PV de base</option>
        </select><small>Repères de caractéristiques ; vos sorts et votre apparence restent les mêmes.</small></label>
        <label className="field">Vie : {hp} PV<input aria-label="Vie de la créature" type="range" min="25" max="150" value={monster.tuning.hpPercent} onChange={e => tuning({ hpPercent: Number(e.target.value) })} /></label>
        <label className="field">Caractéristiques : {monster.tuning.statsPercent} %<input aria-label="Puissance de la créature" type="range" min="25" max="150" value={monster.tuning.statsPercent} onChange={e => tuning({ statsPercent: Number(e.target.value) })} /></label>
        <div className="workshop-help-actions">{[['paBonus', 'Actions (PA)', reference.basePa], ['pmBonus', 'Déplacement (PM)', reference.basePm]].map(([key, label, base]) => <label key={key} className="field">{label}<select value={monster.tuning[key]} onChange={e => tuning({ [key]: Number(e.target.value) })}>{[-2,-1,0,1,2].map(n => <option key={n} value={n}>{Math.max(0, Math.min(key === 'pmBonus' ? 8 : 20, base + n))}</option>)}</select></label>)}</div>
        <details open={modelsOpen}><summary onClick={e=>{e.preventDefault();setModelsOpen(!modelsOpen);}}>Autres gabarits de caractéristiques</summary>{modelsOpen&&<>
          <p className="muted small">Pour un boss plus puissant ou une créature particulière, reprenez les caractéristiques d’un autre monstre. Votre nom, vos images et vos sorts restent personnels.</p>
          <WorldFilter />
          <label className="field">Rechercher un gabarit<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Dragon, gardien…"/></label>
          <label className="field">Gabarit du bestiaire<select value={`${monster.reference.monsterId}:${monster.reference.grade}`} onChange={e=>{const [monsterId,grade]=e.target.value.split(':').map(Number);patch({reference:{monsterId,grade}});}}>
            <option value={`${monster.reference.monsterId}:${monster.reference.grade}`}>{reference.name} · niveau {reference.level} · {reference.baseHp} PV</option>
            {MONSTER_CATALOGUE.filter(m=>(!worlds || worlds.matches('monsters', m.id, worlds.selected)) && fold(m.name).includes(fold(query))).map(m=><optgroup key={m.id} label={m.name}>{monsterGrades(m.id).map(g=><option key={g.grade} value={`${m.id}:${g.grade}`}>Niv. {g.level} · {g.baseHp} PV · {g.basePa} PA · {g.basePm} PM</option>)}</optgroup>)}
          </select></label></>}</details>
      </fieldset>
    </>}
    {step === 'spells' && <><WorkshopStepIntro number="2" title="Choisissez ses actions">Deux sorts suffisent pour commencer. Créez une attaque, puis un soin, une protection ou un ralentissement.</WorkshopStepIntro><CustomSpellPicker ownerType="monster" loadout={{ level: 200, spells: { custom: monster.spells } }} change={fn => patch({ spells: fn({ level: 200, spells: { custom: monster.spells } }).spells.custom })} /></>}
    {step === 'appearance' && <><WorkshopStepIntro number="3" title="Donnez-lui une silhouette">Choisissez une forme et une couleur, dessinez vos PNG ou générez une image à la fois.</WorkshopStepIntro><CharacterArtworkEditor artworkId={monster.artworkId} name={monster.name} onChange={artworkId => patch({ artworkId })} /></>}
    <div className="workshop-step-footer"><small>Sauvegarde automatique dans cette salle.</small><button type="button" className="btn primary" onClick={() => step === 'appearance' ? onClose() : setStep(step === 'identity' ? 'spells' : 'appearance')}>{step === 'appearance' ? 'Terminer la créature' : 'Étape suivante →'}</button></div>
  </section>;
}
