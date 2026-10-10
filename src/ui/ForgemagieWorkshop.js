import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Anvil, FlaskConical, Gem, History, Sparkles } from 'lucide-react';
import { EQUIPMENT_SLOTS, ITEMS, rolledEffects } from '../engine/equipment';
import { RUNES, POTIONS, FORGE_SOURCES, FM_STATS, OUTCOMES, WEIGHT_LAW, createForgedItem, naturalBounds,
  extraWeight, forgeRestriction, forgeChances, forgeAttempt, runeWeight, lawScore } from '../engine/forgemagie';
import { matchingForge, validateForgedItem, convertedWeaponRows } from '../engine/forgedItems';
import OBSERVATIONS from '../engine/forgemagieObservations.json';
import CALIBRATION from '../engine/forgemagieCalibration.json';
import EquipmentIcon from './EquipmentIcon';
import ForgeRuneGrid, { forgeStatLabel as label } from './ForgeRuneGrid';
import '../styles/forgemagie.css';

const signed = n => `${n > 0 ? '+' : ''}${n}`;
const percent = n => `${(n * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
const decimal = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const triple = counts => ['SC', 'SN', 'EC'].map(k => decimal(counts[k])).join(' / ');
const deltaText = deltas => Object.entries(deltas).map(([s, n]) => `${signed(n)} ${label(s)}`).join(' · ') || 'Jets inchangés';
const outcomeLabel = entry => entry.neutralized ? 'Neutre sans effet'
  : entry.outcome === 'EC' && !Object.keys(entry.deltas).length && entry.puitsBefore === entry.puitsAfter
    ? 'Échec sans perte' : OUTCOMES[entry.outcome];
const observedStats = snapshot => Object.fromEntries(Object.entries(FM_STATS).map(([s, d]) => [s, (snapshot?.[d.effect] || 0) - (snapshot?.[d.negativeEffect] || 0)]));
const GUARANTEED_KEY = 'dofus-lite-forge-guaranteed-v1';

function StartingValue({ value, min, max, disabled, name, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const valid = text.trim() !== '' && Number.isInteger(Number(text)) && Number(text) >= min && Number(text) <= max;
  const commit = () => { if (valid) onCommit(Number(text)); else setText(String(value)); };
  return <input type="number" aria-label={name} aria-invalid={text !== '' && !valid} min={min} max={max} step={1} disabled={disabled}
    value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />;
}

export default function ForgemagieWorkshop({ loadout, change, initialSlot, saveError }) {
  const root = useRef(null);
  const equipped = EQUIPMENT_SLOTS.filter(s => ITEMS[loadout.slots[s.id]]);
  const [chosenSlot, setChosenSlot] = useState(initialSlot);
  const slot = equipped.find(s => s.id === chosenSlot) || equipped.find(s => !forgeRestriction(ITEMS[loadout.slots[s.id]])) || equipped[0];
  const item = ITEMS[loadout.slots[slot?.id]];
  const [seed] = useState(() => window.crypto.getRandomValues(new Uint32Array(1))[0]);
  const [kind, setKind] = useState('rune');
  const [runeChoices, setRuneChoices] = useState({});
  const [extraRunes, setExtraRunes] = useState({});
  const [potionId, setPotionId] = useState(1345);
  const [batch, setBatch] = useState(10);
  const [remaining, setRemaining] = useState(0);
  const [stopOnSuccess, setStopOnSuccess] = useState(true);
  const [guaranteedSuccess, setGuaranteedSuccess] = useState(() => {
    try { return localStorage.getItem(GUARANTEED_KEY) === 'true'; } catch { return false; }
  });
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState(null);
  const restriction = forgeRestriction(item);
  const state = useMemo(() => item && !restriction ? matchingForge(item, loadout, slot.id)
    || createForgedItem(item, rolledEffects(item, loadout, slot.id), seed) : null, [item, restriction, loadout, slot, seed]);
  const bounds = item ? naturalBounds(item) : {};
  const last = state?.history.at(-1);
  const presentStats = [...new Set([...Object.keys(bounds), ...Object.keys(state?.stats || {}).filter(s => state.stats[s])])];
  const paletteKey = `${slot?.id}:${item?.id}`;
  const extras = (extraRunes[paletteKey] || []).filter(s => !presentStats.includes(s));
  const visibleStats = [...presentStats, ...extras];
  const selectedRune = RUNES.find(r => r.supported && r.id === runeChoices[paletteKey] && visibleStats.includes(r.stat))
    || RUNES.find(r => r.supported && r.stat === visibleStats[0]);
  const stat = selectedRune?.stat;
  const reagent = kind === 'potion' ? POTIONS.find(p => p.id === potionId) : selectedRune;
  // Always show the normal estimate; the selected mode is applied when fusing.
  const chances = state ? forgeChances(item, state, reagent) : null;
  const observation = [...OBSERVATIONS.attempts].reverse().find(a => a.template === item?.id && a.after_stats);
  const rememberRune = rune => {
    setRuneChoices(current => ({ ...current, [paletteKey]: rune.id }));
    // Keep an exotic's runes available even if that bonus drops back to zero.
    if (!bounds[rune.stat]) setExtraRunes(current => (current[paletteKey] || []).includes(rune.stat) ? current
      : { ...current, [paletteKey]: [...(current[paletteKey] || []), rune.stat] });
  };
  const selectRune = rune => {
    setRemaining(0); setKind('rune'); rememberRune(rune);
  };
  const toggleExtra = s => {
    setRemaining(0);
    setExtraRunes(current => ({ ...current, [paletteKey]: (current[paletteKey] || []).includes(s)
      ? current[paletteKey].filter(value => value !== s) : [...(current[paletteKey] || []), s] }));
  };
  const store = next => {
    change(current => current.slots[slot.id] !== item.id ? current
      : { ...current, forgedItems: { ...current.forgedItems, [slot.id]: next } });
  };
  const fuse = () => {
    if (!chances?.allowed) return;
    if (kind === 'rune') rememberRune(selectedRune);
    // Pure functional update: two rapid clicks consume two successive RNG states.
    change(current => {
      if (current.slots[slot.id] !== item.id) return current;
      const before = matchingForge(item, current, slot.id) || createForgedItem(item, rolledEffects(item, current, slot.id), seed);
      if (!forgeChances(item, before, reagent, { guaranteedSuccess }).allowed) return current;
      return { ...current, forgedItems: { ...current.forgedItems, [slot.id]: forgeAttempt(item, before, reagent, { guaranteedSuccess }) } };
    });
    setNotice(''); setUndo(null);
  };
  useEffect(() => {
    if (!remaining) return undefined;
    const timer = setTimeout(() => {
      if (!root.current?.offsetParent || !chances?.allowed || (stopOnSuccess && !guaranteedSuccess && last?.outcome === 'SC')) { setRemaining(0); return; }
      fuse(); setRemaining(n => Math.max(0, n - 1));
    }, 230);
    return () => clearTimeout(timer);
    // Each saved result schedules the next single fusion; never a hidden loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, loadout, chances?.allowed, stopOnSuccess, last?.outcome, guaranteedSuccess]);
  const exportJournal = () => {
    const blob = new Blob([JSON.stringify({ version: 1, item: { id: item.id, name: item.name }, forge: state,
      probabilitiesAreEstimates: state.history.some(entry => entry.chances?.estimated), historyLimit: 100 }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `forgemagie-${item.id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restart = () => {
    setRemaining(0); setUndo(state);
    store(createForgedItem(item, rolledEffects(item, { ...loadout, forgedItems: {} }, slot.id), seed));
    setNotice('Nouvel essai au jet naturel. Le précédent jet peut être restauré.');
  };

  return <section ref={root} className="fm-workshop" aria-label="Atelier de forgemagie">
    <header className="fm-heading"><div><span className="eyebrow">AMÉLIORE TON STUFF</span><h3><Anvil size={23} /> Atelier de forgemagie</h3>
      <p>Choisis un objet, une rune, puis fusionne. Les jets obtenus s’appliquent à ton stuff.</p></div>
      <span className="fm-mode">Maître niv. 100 · Runes libres</span></header>
    <p className="fm-disclosure">{guaranteedSuccess ? 'Mode garanti actif : les fusions autorisées réussissent sans perte. Les plafonds restent appliqués.'
      : 'Simulation Retro : poids documentés, chances et pertes reconstituées. Les pourcentages affichés sont des estimations.'}</p>
    {!equipped.length ? <p className="fm-empty">Équipe un objet dans l’onglet Équipements pour commencer.</p> : <>
      <div className="fm-equipped" aria-label="Objets à forgemager">{equipped.map(s => {
        const it = ITEMS[loadout.slots[s.id]];
        return <button type="button" key={s.id} aria-pressed={slot?.id === s.id} data-forge-slot={s.id} className={slot?.id === s.id ? 'selected' : ''}
          onClick={() => { setChosenSlot(s.id); setKind('rune'); setRemaining(0); setNotice(''); setUndo(null); }}>
          <EquipmentIcon item={it} /><span>{s.name}<small>{it.name}</small></span>{matchingForge(it, loadout, s.id) ? <b>FM</b> : null}</button>;
      })}</div>
      {restriction ? <p className="fm-empty">{restriction}</p> : <>
        <div className="fm-workspace">
          <section className="fm-item-panel" aria-label="Jet de l’objet">
            <div className="fm-item-title"><EquipmentIcon item={item} /><div><h4>{item.name}</h4><span>Niveau {item.level} · {slot.name}</span></div></div>
            <div className="fm-stats-scroll" role="region" aria-label="Caractéristiques de l’objet" tabIndex={0}>
            <table className="fm-stats"><thead><tr><th>Caractéristique</th><th>Jet</th><th>Naturel</th><th>Écart</th></tr></thead><tbody>
              {presentStats.map(s => <tr key={s} className={stat === s && kind === 'rune' ? 'selected' : ''} data-forge-stat={s}>
                <th><button type="button" onClick={() => selectRune(RUNES.find(r => r.stat === s && r.supported))}>{label(s)}</button></th>
                <td><b>{state.stats[s] || 0}</b>{(state.stats[s] || 0) > Math.max(0, bounds[s]?.max || 0) ? <small className="fm-over">{bounds[s]?.max > 0 ? 'over' : 'exo'}</small> : null}</td>
                <td>{bounds[s] ? `${bounds[s].min}–${bounds[s].max}` : '—'}</td>
                <td className={last?.deltas[s] > 0 ? 'fm-gain' : last?.deltas[s] < 0 ? 'fm-loss' : ''}>{last?.deltas[s] ? signed(last.deltas[s]) : '—'}</td>
              </tr>)}
            </tbody></table>
            {item.weapon ? <div className="fm-weapon-lines">{convertedWeaponRows(item, state).filter(([id]) => id >= 91 && id <= 100).map(([id, min, max], i) =>
              <p key={i}>{id <= 95 ? 'Vol de vie' : 'Dégâts'} {['eau', 'terre', 'air', 'feu', 'neutre'][(id - 91) % 5]} : <b>{min}–{Math.max(min, max)}</b></p>)}</div> : null}
            </div>
            <div className="fm-meters"><div><span>Puits disponible</span><strong data-forge-puits>{state.puits}</strong><small>Réserve du simulateur</small></div>
              <div><span>Poids over / exo</span><strong>{extraWeight(item, state.stats).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}<small> / 101</small></strong></div></div>
            <p className="fm-save-hint">Jet conservé dans ce brouillon. Utilise <b>Mes stuffs</b> pour enregistrer ou mettre à jour ta variante. Les réglages de jets naturels ne le remplacent pas.</p>
          </section>
          <section className="fm-fusion-panel" aria-label="Fusion de rune">
            <div className="fm-reagent-tabs"><button type="button" className={kind === 'rune' ? 'selected' : ''} onClick={() => { setKind('rune'); setRemaining(0); }}><Gem size={16} /> Runes</button>
              <button type="button" className={kind === 'potion' ? 'selected' : ''} onClick={() => { setKind('potion'); setRemaining(0); }}><FlaskConical size={16} /> Élément d’arme</button></div>
            {kind === 'rune' ? <>
              <ForgeRuneGrid key={paletteKey} bounds={bounds} suggested={presentStats} extras={extras} selected={selectedRune}
                onSelect={selectRune} onToggleExtra={toggleExtra} />
              {selectedRune ? <div className="fm-selected-rune" aria-live="polite"><EquipmentIcon item={selectedRune} /><div><strong>{selectedRune.name}</strong>
                <span>+{selectedRune.power} {label(stat)} · Poids {runeWeight(selectedRune)}</span></div></div> : null}
            </> : <div className="fm-potion-options fm-rune-scroll" role="region" aria-label="Potions de forgemagie" tabIndex={0}>
              <label className="fm-field">Potion de forgemagie<select aria-label="Potion de forgemagie" value={potionId} onChange={e => { setPotionId(Number(e.target.value)); setRemaining(0); }}>
                {POTIONS.map(p => <option key={p.id} value={p.id}>{p.name} · {p.ratio} %</option>)}
              </select></label>
              <p className="fm-potion-note">Convertit toutes les lignes de dégâts directs neutres en {reagent.element}. Les vols de vie restent inchangés. Conversion irréversible.</p>
              <p className="fm-disclosure">Conversion et chances reprises de l’émulateur Ancestra : pas encore vérifiées dans tes captures. Un échec réduit les bonus positifs selon ce modèle.</p>
            </div>}
            <label className={`fm-guaranteed-mode${guaranteedSuccess ? ' selected' : ''}`}>
              <input type="checkbox" aria-label="Succès critique garanti" checked={guaranteedSuccess} onChange={e => {
                const enabled = e.target.checked; setRemaining(0); setGuaranteedSuccess(enabled);
                try { localStorage.setItem(GUARANTEED_KEY, String(enabled)); } catch { /* The checkbox still works without persistence. */ }
              }} />
              <span><strong>Succès critique garanti · 100 %</strong><small>Sans perte. Puits et plafonds conservés.</small></span>
            </label>
            {chances.allowed ? <div className="fm-chances"><h4>Chances normales estimées</h4><div className="fm-probability-bar" aria-hidden="true">
              {['SC', 'SN', 'EC'].map(outcome => <span key={outcome} className={outcome.toLowerCase()} style={{ flex: chances[outcome] }} />)}</div>
              <dl>{['SC', 'SN', 'EC'].map(o => <div key={o}><dt title={{ SC: 'Gain sans perte.', SN: 'Gain compensé par le puits ou des pertes. Sans compensation suffisante, aucun effet.', EC: 'Aucun gain. Le puits et les jets sont exposés ; une ligne lourde peut être épargnée.' }[o]}>{o === 'SN' ? 'Neutre' : OUTCOMES[o]}</dt><dd>{percent(chances[o])}</dd></div>)}</dl>
              {chances.factors ? <p className="fm-stake" title="Poids en jeu : celui de la rune sur une ligne naturelle, celui de toute la ligne après la rune pour un over ou un exo.">
                Poids en jeu <strong>{decimal(chances.factors.stake)}</strong> · score {WEIGHT_LAW.K}/{decimal(chances.factors.stake)} − {WEIGHT_LAW.M} = {decimal(lawScore(chances.factors.stake))}
                {chances.mode === 'normal' && chances.factors.score < lawScore(chances.factors.stake) - 1e-6 ? ` · plafonné à ${decimal(chances.factors.score)} (ligne naturelle)` : ''}</p> : null}
            </div> : null}
            {!chances.allowed ? <p className="fm-blocked" role="status">{chances.reason}</p> : null}
            <div className="fm-actions"><button type="button" className="btn primary fm-fuse" disabled={!chances.allowed || remaining > 0} onClick={fuse}><Sparkles size={17} /> Fusionner</button>
              {remaining > 0 ? <button type="button" className="btn fm-stop" onClick={() => setRemaining(0)}>Arrêter · {remaining} restant{remaining > 1 ? 's' : ''}</button>
                : <button type="button" className="btn fm-batch" disabled={!chances.allowed} onClick={() => { fuse(); setRemaining(batch - 1); }}>Fusionner ×{batch}</button>}</div>
            <div className="fm-repeat-options"><label>Série<select aria-label="Nombre de fusions" value={batch} disabled={remaining > 0} onChange={e => setBatch(Number(e.target.value))}><option value={10}>10 runes</option><option value={50}>50 runes</option><option value={100}>100 runes</option></select></label>
              <label><input type="checkbox" aria-label="Arrêter au succès critique" checked={stopOnSuccess && !guaranteedSuccess} disabled={guaranteedSuccess} onChange={e => setStopOnSuccess(e.target.checked)} /> Arrêter au critique</label></div>
          </section>
        </div>
        <div className={`fm-result ${last?.outcome?.toLowerCase() || ''}`} role="status" aria-live="polite"><strong>{last ? `${outcomeLabel(last)} · ${last.reagent}` : 'Prêt à fusionner'}</strong>
              <p>{last ? deltaText(last.deltas) : 'Choisis ta rune. Chaque essai est enregistré dans le journal.'}</p>
              {last && <small>Puits {last.puitsBefore} → {last.puitsAfter} · {state.attempts} tentative{state.attempts > 1 ? 's' : ''}{last.chances?.guaranteedSuccess ? ' · Mode garanti' : ''}</small>}</div>
        {saveError ? <p role="alert" className="fm-loss">La sauvegarde du navigateur a échoué. Exporte le journal avant de fermer.</p> : null}
        {notice ? <p role="status" className="fm-notice">{notice} {undo ? <button className="btn" onClick={() => { store(undo); setUndo(null); setNotice('Jet précédent restauré.'); }}>Annuler</button> : null}</p> : null}
        <details className="fm-details"><summary>Jet de départ et remise à zéro</summary>
          <p>Ces réglages servent à préparer une simulation. Le puits d’une capture n’est pas connu ; reprendre un jet observé démarre avec un puits supposé de 0.</p>
          <div className="fm-initial-stats">{Object.entries(bounds).map(([s, b]) => <label key={s}>{label(s)}<StartingValue name={`Jet initial ${label(s)}`} min={b.min} max={b.max} disabled={state.attempts > 0 || remaining > 0} value={state.stats[s] || 0} onCommit={n => {
            const next = { ...state, stats: { ...state.stats, [s]: n }, origin: 'manual' };
            if (!validateForgedItem(item, next)) store(next);
          }} /></label>)}<label>Puits initial<StartingValue name="Puits initial" min={0} max={1000} value={state.puits} disabled={state.attempts > 0 || remaining > 0} onCommit={n => {
            store({ ...state, puits: n, origin: 'manual' });
          }} /></label></div>
          <div className="fm-actions"><button className="btn" disabled={remaining > 0} onClick={restart}>Recommencer au jet naturel</button>
            {observation ? <button className="btn" disabled={remaining > 0} onClick={() => {
              const next = { ...createForgedItem(item, rolledEffects(item, { ...loadout, forgedItems: {} }, slot.id), seed), stats: observedStats(observation.after_stats), origin: 'observed-with-unknown-puits' };
              const error = validateForgedItem(item, next);
              if (error) { setNotice(error); return; }
              setUndo(state); store(next); setNotice('Dernier jet capturé chargé. Puits inconnu : la simulation démarre à 0.');
            }}>Reprendre le dernier jet capturé</button> : null}</div>
        </details>
        <details className="fm-details fm-journal" open><summary><History size={16} /> Journal · {state.attempts} tentatives</summary>
          <div className="fm-journal-tools"><p>{Object.entries(state.consumption).map(([id, n]) => `${n} × ${[...RUNES, ...POTIONS].find(r => r.id === Number(id))?.name || id}`).join(' · ') || 'Aucune rune utilisée.'}</p>
            <button type="button" className="btn" onClick={exportJournal}>Exporter le journal</button></div>
          {state.history.length ? <div className="fm-table-scroll"><table><thead><tr><th>Essai</th><th>Rune / potion</th><th>Résultat</th><th>Variations</th><th>Puits</th></tr></thead><tbody>
            {[...state.history].reverse().map(e => <tr key={e.attempt}><td>{e.attempt}</td><td>{e.reagent}</td><td>{outcomeLabel(e)}{e.chances?.guaranteedSuccess ? ' · garanti' : ''}</td><td>{deltaText(e.deltas)}</td><td>{e.puitsBefore} → {e.puitsAfter}</td></tr>)}
          </tbody></table></div> : null}
          {state.attempts > 100 ? <p>Les 100 derniers essais sont détaillés. Le compteur de runes couvre toute la simulation.</p> : null}
        </details>
      </>}
    </>}
    <details className="fm-details fm-evidence"><summary>Règles, sources et tes captures</summary>
      <p>Les puissances viennent des fichiers du client. Les poids Retro, le puits et les plafonds viennent des guides cités. Le choix des pertes est une reconstitution locale.</p>
      <p>Les chances suivent une seule loi : <strong>score = {WEIGHT_LAW.K} / poids en jeu − {WEIGHT_LAW.M}</strong>. Le poids en jeu est celui de la rune sur une ligne naturelle, et celui de toute la ligne après la rune pour un over ou un exo. Le partage reprend le devblog Ankama de mai 2009 : SC égal au score entre 1 et 66 %, neutre jusqu’à 50 %, réduit seulement pour les tentatives très faciles ou très difficiles. Sur une ligne naturelle, le plafond du devblog s’applique aussi (66 %, moins près du maximum ou sur un objet complexe).</p>
      <p>Constantes ajustées sur {CALIBRATION.attemptsFitted} de tes {CALIBRATION.attemptsObserved} tentatives capturées (intervalle à 95 % : {decimal(CALIBRATION.fit.ci95.K[0])}–{decimal(CALIBRATION.fit.ci95.K[1])} pour {WEIGHT_LAW.K}, {decimal(CALIBRATION.fit.ci95.M[0])}–{decimal(CALIBRATION.fit.ci95.M[1])} pour {WEIGHT_LAW.M}). Seuls un Gelano et un Blopanneau ont été mesurés : les autres objets sont extrapolés.</p>
      <div className="fm-table-scroll"><table><thead><tr><th>Situation capturée</th><th>Essais</th><th>Observé SC / N / EC</th><th>Prévu par la loi</th></tr></thead><tbody>{CALIBRATION.conditions.filter(c => c.fitted).map(c => <tr key={c.condition}><td>{c.condition.replace(/^(.*?) · Rune /, '$1 · ').replace(' · natural', ' · naturel').replace(' · X=', ' · poids ')}</td><td>{c.n}</td><td>{triple(c.observed)}</td><td>{triple(c.expected)}</td></tr>)}</tbody></table></div>
      <p>En cas de succès neutre ou d’échec, les overs et exos des autres lignes sont exposés avant le puits. Si tu continues la même ligne, le puits passe avant son over ou son exo. Un succès critique conserve tous les bonus et le puits.</p>
      <p>Un PA, PM ou autre bonus exotique est plus fragile qu’un bonus naturel de même poids. Il peut toutefois être épargné. La priorité est documentée ; sa probabilité exacte reste estimée dans ce simulateur. Un résultat neutre sans compensation suffisante ne modifie ni les jets ni le puits.</p>
      <p>Lecture des messages serveur : sans message, succès critique ; « une caractéristique a baissé », succès neutre ; échec avec baisse de puissance, échec non couvert par le puits ; échec simple, puits suffisant ou neutre que rien ne pouvait payer. Le puits n’est pas transmis : il est réestimé à partir des pertes visibles. Les demandes sortantes ne sont pas décodées.</p>
      <p>Variantes non simulées : {RUNES.filter(r => !r.supported).map(r => r.name).join(', ')}. Signature, progression des métiers, brisage et économie des runes ne sont pas simulés.</p>
      <ul>{FORGE_SOURCES.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
    </details>
  </section>;
}
