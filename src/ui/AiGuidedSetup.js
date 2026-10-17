import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Copy, Download, Search, Shield, Sparkles, Swords, Scale, Workflow, X } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import { AI_STARTERS, buildAiPrompt, parseAiResponse } from '../bots/aiAuthoring';
import { aiBehaviorExample, aiFighterReference } from '../bots/aiFighterReference';
import { DEFAULT_WEIGHTS } from '../bots/utilityBrain';
import TUNED from '../bots/cortexWeights.json';
import { maisonWeightsFor } from '../bots/maison';
import { RetroPortrait } from './RetroAssets';
import { useWorlds, WorldFilter } from './WorldsContext';
import { characterMatchesWorld } from './worldCatalogue';

export const aiFighterMatchesWorld = (worlds, fighter) => !worlds || (fighter.loadout
  ? characterMatchesWorld(worlds, { ...fighter, id: fighter.id.replace(/^(profile|creation):/, '') })
  : worlds.matches('classes', fighter.classId, worlds.selected));

export function AiFighterPortrait({ fighter }) {
  return <span className="ai-fighter-portrait" aria-hidden="true"><RetroPortrait classId={fighter.classId} artworkId={fighter.loadout?.artworkId} appearance={fighter.loadout?.profile?.sex === 1 ? 'female' : 'male'} fallback={CLASSES[fighter.classId]?.emoji || '♟'}/></span>;
}

export function AiFighterStep({ choices, fighter, snapshot, error, onChoose, onNext }) {
  const worlds = useWorlds();
  const [query, setQuery] = useState('');
  const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = choices.filter(c => aiFighterMatchesWorld(worlds, c) && fold(`${c.name} ${CLASSES[c.classId]?.name}`).includes(fold(query)));
  return <section className="ai-guided-panel" aria-label="Choisir mon combattant">
    <header className="ai-step-heading"><span className="ai-eyebrow">01 / LE COMBATTANT</span><h2>Qui allez-vous rendre imbattable ?</h2><p>Votre IA suivra vos priorités. Choisissez le personnage dont elle devra tirer le meilleur.</p></header>
    <div className="ai-fighter-picker">
      <div><WorldFilter /><label className="ai-search"><Search size={17}/><input aria-label="Rechercher un combattant" placeholder="Un personnage, une classe…" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="ai-fighter-collection">{['Mes personnages', 'Mes créations', 'Classes du jeu'].map(group => {
          const list = filtered.filter(c => c.group === group);
          return list.length ? <section key={group}><h3>{group}{group === 'Classes du jeu' && <small>Base niveau 100</small>}</h3><div className="ai-fighter-grid">{list.map(c => <button type="button" key={c.id} aria-pressed={fighter.id === c.id} onClick={() => onChoose(c.id)}><AiFighterPortrait fighter={c}/><span><strong>{c.name}</strong><small>{c.loadout ? `Niveau ${c.loadout.level || 100} · équipement conservé` : CLASSES[c.classId]?.role}</small></span>{fighter.id === c.id && <Check size={16}/>}</button>)}</div></section> : null;
        })}{!filtered.length && <p>Aucun combattant ne correspond à cette recherche.</p>}</div>
      </div>
      <aside className="ai-fighter-selected"><AiFighterPortrait fighter={fighter}/><span className="ai-eyebrow">VOTRE COMBATTANT</span><h3>{fighter.name}</h3><p>{fighter.loadout ? 'Ses sorts, son équipement et ses caractéristiques sont utilisés dans les essais.' : 'Un personnage de référence niveau 100, prêt à tester.'}</p>
        {snapshot && <div className="ai-fighter-numbers"><span><b>{snapshot.maxHp}</b>PV</span><span><b>{snapshot.pa}</b>PA</span><span><b>{snapshot.pm}</b>PM</span><span><b>{snapshot.spells.length}</b>sorts / arme</span></div>}
        {error && <p className="ai-error" role="alert">{error}</p>}
        <button type="button" className="ai-button accent" disabled={!snapshot} onClick={onNext}>Créer sa stratégie <ArrowRight size={16}/></button>
        <small>Vous pourrez changer de combattant et comparer les résultats.</small>
      </aside>
    </div>
  </section>;
}

const QUICK_WEIGHTS = [
  { key: 'damage', label: 'Infliger des dégâts', detail: 'Faire peser les dégâts utiles dans le choix d’une action.', max: 5 },
  { key: 'threat', label: 'Éviter les risques', detail: 'Préférer les cases moins exposées aux attaques.', max: 5 },
  { key: 'heal', label: 'Prendre soin du groupe', detail: 'Valoriser les soins quand le grimoire le permet.', max: 5 },
  { key: 'rangeBand', label: 'Garder la bonne distance', detail: 'Se placer selon la portée de ses propres sorts.', max: 4 },
];
const ICONS = { balance: Scale, attack: Swords, shield: Shield };
export function AiStrategyStep({ draft, builtin, fighter, opponent, onPreset, onGraph, onDuplicate, onAssistant, onAdvanced, onNext }) {
  const primary = draft.graph?.nodes.find(n => n.config?.kind === 'auto' && (n.type === 'plan' || n.config?.stage === 'profile'));
  const weights = { ...DEFAULT_WEIGHTS, ...TUNED, ...(primary?.config.base === 'cortex' ? {} : maisonWeightsFor(fighter.classId, opponent?.classId || 'IOP')), ...primary?.config.weights };
  const tune = (key, value) => onGraph({ ...draft.graph, nodes: draft.graph.nodes.map(n => n.id === primary.id ? { ...n, config: { ...n.config, weights: { ...n.config.weights, [key]: value } } } : n) });
  // Changing a starter must never discard a hand-built or imported program.
  const starterEditable = !!draft.starter;
  return <section className="ai-guided-panel" aria-label="Construire ma stratégie">
    <header className="ai-step-heading"><span className="ai-eyebrow">02 / VOTRE STRATÉGIE</span><h2>Une idée peut faire la différence.</h2><p>Commencez avec une stratégie qui joue déjà. Ajustez-la, puis mettez-la à l’épreuve.</p></header>
    {builtin ? <div className="ai-reference-callout"><Shield size={28}/><div><h3>Vous explorez {draft.name}</h3><p>Créez votre version pour essayer vos propres idées.</p></div><button type="button" className="ai-button accent" onClick={onDuplicate}>Créer ma version <ArrowRight size={16}/></button></div> : null}
    {starterEditable && !builtin && <div className="ai-starter-grid" role="group" aria-label="Style de départ">{AI_STARTERS.map(p => { const Icon = ICONS[p.icon]; return <button type="button" key={p.id} aria-pressed={draft.starter === p.id} onClick={() => onPreset(p.id)}><Icon size={23}/><strong>{p.name}</strong><span>{p.detail}</span>{draft.starter === p.id && <Check size={16}/>}</button>; })}</div>}
    <div className="ai-strategy-columns"><section className="ai-simple-priorities"><h3>Qu’est-ce qui compte pour vous ?</h3><p>Ces réglages changent les décisions de votre IA, pas la puissance du personnage.</p>
      {primary ? <fieldset disabled={builtin}>{QUICK_WEIGHTS.map(w => <label key={w.key}><span><strong>{w.label}</strong><output>{Number(weights[w.key] || 0).toFixed(1)}</output></span><input type="range" min="0" max={w.max} step="0.1" aria-label={w.label} value={Math.min(w.max, weights[w.key] || 0)} onChange={e => tune(w.key, Number(e.target.value))}/><small>{w.detail}</small></label>)}</fieldset> : <div className="ai-rule-note">Cette IA possède sa propre logique. Ouvrez l’éditeur pour modifier ses règles sans les remplacer.</div>}
      <button type="button" className="ai-text-button" onClick={onAdvanced}><Workflow size={16}/> Ouvrir les blocs et le code <ArrowRight size={15}/></button>
    </section><aside className="ai-assistant-card"><span className="ai-assistant-icon"><Sparkles size={25}/></span><span className="ai-eyebrow">UNE IDÉE PLUS PRÉCISE ?</span><h3>Coachez votre IA<br/>avec ChatGPT.</h3><p>« Garder mes distances avec mon Crâ », « mieux combiner mes sorts »… Le prompt inclut le vrai grimoire de <b>{fighter.name}</b> et les règles du jeu.</p><ol><li>Décrivez votre idée.</li><li>Copiez le prompt dans ChatGPT.</li><li>Importez sa stratégie ici.</li></ol><button type="button" className="ai-button accent" onClick={onAssistant}><Sparkles size={16}/> Préparer mon prompt</button><small>Facultatif : tout reste modifiable à la main.</small></aside></div>
    <footer className="ai-guided-footer"><span>Une hypothèse, un test, une meilleure version.</span><button type="button" className="ai-button accent" onClick={onNext}>Passer au défi <Swords size={16}/></button></footer>
  </section>;
}

export function AiPromptDialog({ fighter, snapshot, draft, report, onGoal, onImport, onClose }) {
  const dialog = useRef(null), promptInput = useRef(null);
  const [goal, setGoal] = useState(draft.promptBriefs?.[fighter.id] || ''), [response, setResponse] = useState(''), [error, setError] = useState(''), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal ? dialog.current.showModal() : dialog.current?.setAttribute('open', ''); return () => previous?.focus?.(); }, []);
  const reference = useMemo(() => snapshot ? aiFighterReference(snapshot) : null, [snapshot]);
  const example = aiBehaviorExample(snapshot);
  const changeGoal = value => { setGoal(value); setCopied(false); onGoal?.(value); };
  const prompt = useMemo(() => snapshot ? buildAiPrompt({ fighter, snapshot, reference, goal, graph:draft.graph, name:draft.name, report }) : '', [fighter, snapshot, reference, goal, draft, report]);
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); setCopyError(false); } catch { setCopyError(true); setCopied(false); } };
  const savePrompt = () => { const url = URL.createObjectURL(new Blob([prompt], { type:'text/plain;charset=utf-8' })), a = document.createElement('a'); a.href=url; a.download='prompt-mon-ia.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const keepFocus = e => {
    if (e.key !== 'Tab') return;
    const fields = [...dialog.current.querySelectorAll('button:not(:disabled),input,select,textarea,summary,[tabindex="0"]')].filter(el => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility()));
    const first=fields[0],last=fields.at(-1);
    if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first?.focus(); }
  };
  const accept = () => { try { const parsed = parseAiResponse(response); const missing = parsed.graph.nodes.filter(n => n.config?.kind === 'spell' && !snapshot.spells.some(s => s.key === n.config.spellKey)); if(missing.length) throw new Error(`Sort absent de ce combattant : ${missing[0].config.spellKey}. Demandez une correction avec les clés du prompt.`); onImport(parsed); } catch(e) { setError(e.message); } };
  return createPortal(<dialog ref={dialog} className="ai-prompt-dialog" aria-label="Créer une stratégie avec ChatGPT" onKeyDown={keepFocus} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <header><div><span className="ai-eyebrow">VOTRE IDÉE → UNE STRATÉGIE JOUABLE</span><h2><Sparkles size={23}/> Votre coach de stratégie</h2><p>{fighter.name} · {snapshot?.spells.length || 0} sorts et arme · {report ? 'dernier test inclus' : 'règles du moteur incluses'}</p></div><button type="button" aria-label="Fermer le prompt" className="ai-icon-button" onClick={onClose}><X size={22}/></button></header>
    <div className="ai-prompt-content"><section><h3><span>1</span> Comment votre IA doit-elle jouer ?</h3><p id="ai-brief-help">Décrivez votre plan avec vos mots. Plus vos priorités et vos exceptions sont précises, plus la stratégie pourra vous ressembler.</p>
      <ul className="ai-brief-guide"><li><b>Au départ</b> — invoquer, se renforcer ou attaquer ?</li><li><b>Pendant le combat</b> — qui viser, quelle distance garder, qui aider ?</li><li><b>En danger</b> — à quel seuil soigner ou reculer ?</li><li><b>Si c’est impossible</b> — quelle autre action privilégier ?</li></ul>
      <label className="ai-field">Mon idée<textarea autoFocus aria-describedby="ai-brief-help" rows="5" maxLength={3000} value={goal} onChange={e=>changeGoal(e.target.value)} placeholder={example}/></label>
      <details className="ai-brief-example"><summary>Un exemple pour {fighter.name}</summary><p>{example}</p><button type="button" className="ai-button" onClick={()=>changeGoal(goal ? `${goal}\n\n${example}`.slice(0,3000) : example)}>{goal ? 'Ajouter cet exemple' : 'Utiliser cet exemple'}</button></details>
      <h3><span>2</span> Votre personnage est déjà dans le prompt</h3>
      <div className="ai-prompt-context" aria-label="Informations incluses dans le prompt"><strong>{fighter.name} · niveau {snapshot?.level}</strong><ul><li>{reference?.spells.length || 0} sorts et arme : valeurs, critiques, cibles, zones et relances.</li><li>Caractéristiques et bonus de votre équipement, FM comprise.</li>{!!reference?.summons.length && <li>{reference.summons.length} invocations : PV, PA/PM, résistances et leurs propres sorts.</li>}<li>Règles du combat, blocs disponibles et stratégie actuelle.{report ? ' Dernier test inclus.' : ''}</li></ul><small>Le grimoire de ce personnage aux grades joués ; pas le catalogue des douze classes.</small></div>
      <p>Copiez le prompt dans ChatGPT ou votre assistant préféré. Vous pouvez continuer la discussion pour préciser votre plan avant de récupérer le JSON final.</p>
      <div className="ai-prompt-buttons"><button type="button" className="ai-button accent" disabled={!prompt} onClick={copy}><Copy size={16}/>{copied ? 'Prompt copié' : 'Copier le prompt'}</button><button type="button" className="ai-button" disabled={!prompt} onClick={savePrompt}><Download size={16}/> Fichier texte</button></div>
      <details open={copyError || undefined}><summary>Lire le prompt complet</summary><textarea ref={promptInput} aria-label="Prompt complet" readOnly value={prompt} onFocus={e=>e.target.select()} rows="8"/></details>{copyError && <p role="status">Copie automatique indisponible. Sélectionnez le prompt ci-dessus ou téléchargez le fichier texte.</p>}
    </section><section className="ai-prompt-return"><h3><span>3</span> Ramenez votre stratégie</h3><p>ChatGPT écrit les <b>blocs de décision en JSON</b>. Le jeu les transforme en code pour le combat.</p><p>Collez uniquement le JSON final. Il sera vérifié et ouvert comme <b>une nouvelle IA</b>, prête à tester. Votre version actuelle est conservée.</p><label className="ai-field">Réponse de ChatGPT<textarea rows="12" maxLength={250000} placeholder={'{ "format": "koliseum-visual-ai", … }'} value={response} onChange={e=>{setResponse(e.target.value);setError('');}} spellCheck={false}/></label>{error && <p className="ai-error" role="alert">{error}</p>}<button type="button" className="ai-button accent" disabled={!response.trim() || !snapshot} onClick={accept}><Check size={16}/> Vérifier et créer mon IA</button><small>Les blocs expriment les conditions disponibles et les priorités de Maison. Pour une logique entièrement libre, utilisez l’éditeur JavaScript avancé. Les invocations jouent avec leur propre IA.</small><small>Un JSON valide ne prouve pas qu’une IA est forte. Le prochain défi vous dira ce qu’elle vaut.</small></section></div>
  </dialog>, document.body);
}
