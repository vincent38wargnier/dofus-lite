import React, { useEffect, useMemo, useState } from 'react';
import { Backpack, Check, Copy, Plus, Save, Scale, Search, Trash2, Wand2, Palette, Swords, SlidersHorizontal } from 'lucide-react';
import { ITEMS } from '../engine/equipment';
import { MAX_EQUIPMENT_SCORE, EQUIPMENT_CENSUS, EQUIPMENT_FAMILIES, EQUIPMENT_STAT_RULES, equipmentFamily, equipmentStats } from '../engine/equipmentBalance';
import { newCustomEquipment, newEquipmentId, customEquipmentItem, validateCustomEquipment, fitEquipmentBudget } from '../engine/customEquipment';
import { useCustomEquipment } from './CustomEquipmentContext';
import EquipmentIcon from './EquipmentIcon';
import ShapeAppearancePicker from './ShapeAppearancePicker';
import { AtelierExportButton } from './AtelierTransfer';
import { defaultEquipmentAppearance, EQUIPMENT_SHAPES, equipmentShapeImage } from '../visuals/customShapes';
import '../styles/equipmentWorkshop.css';

const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MODELS = Object.values(ITEMS).filter(item => item.type !== 23 && equipmentFamily(item) && !item.ethereal
  && item.level <= 200 && !/BI=|PK>|PJ|PX/.test(item.condition || '') && !/Annobus|Jarbo/i.test(item.name))
  .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'fr'));
const LINE_TYPES = [[96, 'Dégâts eau'], [97, 'Dégâts terre'], [98, 'Dégâts air'], [99, 'Dégâts feu'], [100, 'Dégâts neutres'],
  [91, 'Vol de vie eau'], [92, 'Vol de vie terre'], [93, 'Vol de vie air'], [94, 'Vol de vie feu'], [95, 'Vol de vie neutre'],
  [108, 'Soins à la cible'], [101, 'Retrait PA'], [84, 'Vol de PA']];
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function EquipmentBudgetCard({ result }) {
  const b = result.balance;
  return <aside className={`equipment-budget-card${result.valid ? '' : ' over-budget'}`} aria-label="Budget de l’équipement">
    <div className="equipment-budget-heading"><Scale size={21} /><span>Budget de l’objet</span></div>
    <div className="equipment-budget-score"><strong>{b?.score ?? '—'}</strong><span>/ 100</span></div>
    <div className="equipment-budget-meter" role="meter" aria-label="Points de l’objet" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, b?.score || 0)}><i style={{ width: `${Math.min(100, b?.score || 0)}%` }} /></div>
    <p className="equipment-budget-verdict">{result.valid ? <><Check size={16} /> Dans le budget</> : 'À ajuster avant d’enregistrer'}</p>
    {b && <><dl className="equipment-budget-breakdown"><div><dt>Caractéristiques</dt><dd>{b.passiveScore} / 100</dd></div>
      {result.item?.weapon && <div><dt>Frappe de l’arme</dt><dd>{b.attackScore} / 100</dd></div>}
      <div><dt>Puissance combinée</dt><dd>{b.totalScore} / 100</dd></div></dl>
      <p>Le score retient le budget le plus sollicité. Chaque bonus a aussi son propre plafond.</p>
      <details><summary>Détail des contributions</summary><ul className="equipment-budget-contributions">{b.contributions.map(row => <li key={row.stat}><span>{row.label} × {row.value}</span><b>{Math.round(row.points * 10) / 10}</b></li>)}
        {b.synergy > 0 && <li><span>Cumul PA / PM</span><b>{b.synergy}</b></li>}{b.attack > 0 && <li><span>Profil de frappe</span><b>{Math.round(b.attack)}</b></li>}</ul><p>Poids bruts, avant normalisation par famille et niveau.</p></details>
      <details className="equipment-budget-references"><summary>Comparer aux objets Dofus</summary><p>{b.limits.sample} références pour ce niveau et cette famille.</p>{b.comparisons.map(ref => <div key={ref.id}><EquipmentIcon item={ITEMS[ref.id]} /><span>{ref.name}<small>Niv. {ref.level}</small></span><b>{ref.score}</b></div>)}</details>
      <p className="equipment-budget-note">Repères de puissance combinée. Les objets Dofus d’origine peuvent dépasser le budget de création.</p></>}
    <details className="equipment-budget-method"><summary>Comment ce budget est calculé</summary><p>{EQUIPMENT_CENSUS.items.toLocaleString('fr-FR')} objets analysés, {EQUIPMENT_CENSUS.references.toLocaleString('fr-FR')} références retenues, hors Dofus. Le niveau requis et la famille déterminent la puissance disponible. Budget du stuff complet : {MAX_EQUIPMENT_SCORE.toLocaleString('fr-FR')} points.</p></details>
    <a href="/dofus-local/equipment-balance-audit.json" target="_blank" rel="noreferrer">Consulter l’analyse complète ↗</a>
  </aside>;
}

export default function EquipmentWorkshop({ onEquip, onClose, initialReferenceId, embedded = false, importedEquipment }) {
  const library = useCustomEquipment();
  const [draft, setDraft] = useState(() => newCustomEquipment(MODELS.some(item => item.id === initialReferenceId) ? initialReferenceId : 7143));
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [bonus, setBonus] = useState('vitalite');
  const [view, setView] = useState('bonus');
  useEffect(() => {
    if (importedEquipment) { setDraft(JSON.parse(JSON.stringify(importedEquipment))); setEditingId(importedEquipment.id); setMessage(''); setError(''); setLibraryQuery(''); }
  }, [importedEquipment]);
  const activeView = view === 'weapon' && !draft.weapon ? 'bonus' : view;
  const result = useMemo(() => validateCustomEquipment(draft), [draft]);
  const family = equipmentFamily(ITEMS[draft.referenceId]);
  const models = useMemo(() => MODELS.filter(item => family.types.includes(item.type) && fold(item.name).includes(fold(query))), [family, query]);
  const saved = (library?.items || []).filter(item => fold(item.name).includes(fold(libraryQuery)));
  const patch = changes => { setDraft(previous => ({ ...previous, ...changes })); setMessage(''); setError(''); };
  const stat = (key, value) => patch({ stats: { ...draft.stats, [key]: num(value) } });
  const pickModel = item => {
    const next = newCustomEquipment(item.id);
    patch({ ...next, appearance: draft.appearance, weapon: next.weapon, id: draft.id, name: draft.name, level: Math.max(draft.level, item.type === 97 ? 60 : 1) });
    setQuery('');
  };
  const save = equip => {
    if (!result.valid || !library) return;
    try {
      const next = { ...draft, id: newEquipmentId(), name: draft.name.trim() };
      library.save(next, editingId);
      setDraft(next); setEditingId(next.id); setMessage('Équipement enregistré. Disponible dans Équipement → Mes équipements.'); setError('');
      if (equip) onEquip?.(next);
    } catch (e) { setError(e.message || 'Sauvegarde impossible.'); }
  };
  return <section className="equipment-workshop" aria-label="Créateur d’équipements">
    {!embedded && <header className="equipment-workshop-heading"><div><span className="eyebrow"><Backpack size={17} /> MES ÉQUIPEMENTS</span><h2>Une pièce à votre image</h2><p>Choisissez une apparence, composez les bonus et gardez un budget cohérent avec Retro.</p></div>
      {onClose && <button type="button" className="btn" onClick={onClose}>← Retour au stuff</button>}</header>}
    {library?.error && <p className="creator-warning" role="alert">{library.error}</p>}
    <div className="equipment-workshop-layout"><aside className="equipment-design-library"><div className="equipment-design-library-title"><button type="button" className="btn primary" aria-label="Nouvel équipement" onClick={() => { setDraft(newCustomEquipment(draft.referenceId)); setEditingId(null); setMessage(''); setError(''); setView('bonus'); }}><Plus size={16} />Nouvel équipement</button></div>
      <label className="equipment-design-search"><Search size={16} /><input type="search" aria-label="Rechercher mes équipements" placeholder="Rechercher…" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} /></label>
      <div className="equipment-design-saved">{saved.map(item => <button type="button" className={`equipment-design-saved-card${editingId === item.id ? ' selected' : ''}`} key={item.id} onClick={() => { setDraft(JSON.parse(JSON.stringify(item))); setEditingId(item.id); setMessage(''); setError(''); setQuery(''); }}>
        <EquipmentIcon item={customEquipmentItem(item)} /><span><strong>{item.name}</strong><small>Niv. {item.level} · {equipmentFamily(ITEMS[item.referenceId])?.name}</small></span></button>)}
        {!saved.length && <p>Vos créations apparaîtront ici et dans Équipement → Mes équipements.</p>}</div>
      {editingId && <><button type="button" className="btn" onClick={() => { patch({ id: newEquipmentId(), name: `${draft.name.slice(0, 70)} — copie` }); setEditingId(null); }}><Copy size={15} /> Dupliquer</button>
        <button type="button" className="btn subtle" onClick={() => { try { library.remove(editingId); setEditingId(null); setMessage('Retiré de la bibliothèque. Les exemplaires équipés sont conservés.'); } catch (e) { setError(e.message); } }}><Trash2 size={15} /> Retirer de la bibliothèque</button></>}
      <details className="equipment-design-help"><summary>À propos des versions</summary><p>Modifier une création produit une nouvelle version. Vos profils et replays conservent l’exemplaire déjà équipé.</p></details>
    </aside>
    <form className="equipment-designer" onBlur={event => {
      if (event.target.type === 'number' && event.target.value !== '') event.target.value = String(num(event.target.value));
    }} onSubmit={event => { event.preventDefault(); save(false); }}>
      <div className="equipment-design-identity"><EquipmentIcon item={result.item || ITEMS[draft.referenceId]} /><label className="field">Nom de l’équipement<input required maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} /></label></div>
      <div className="equipment-design-fields"><label className="field">Famille<select value={family.id} onChange={event => {
        const target = EQUIPMENT_FAMILIES.find(value => value.id === event.target.value); pickModel(MODELS.find(item => target.types.includes(item.type)));
      }}>{EQUIPMENT_FAMILIES.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="field">Niveau requis<input type="number" min={family.id === 'mount' ? 60 : 1} max={200} required value={draft.level} onChange={event => patch({ level: num(event.target.value) })} /></label></div>
      <nav className="studio-editor-tabs" aria-label="Rubriques de l’équipement">
        {[['bonus', 'Bonus', SlidersHorizontal], ['appearance', 'Apparence', Palette], ...(draft.weapon ? [['weapon', 'Arme', Swords]] : [])].map(([id, label, Icon]) =>
          <button type="button" key={id} aria-pressed={activeView === id} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}
      </nav>
      <div hidden={activeView !== 'appearance'}>
      <div className="appearance-source" role="group" aria-label="Type de visuel de l’équipement">
        <button type="button" className="btn" aria-pressed={!!draft.appearance} onClick={() => { if (!draft.appearance) patch({ appearance: defaultEquipmentAppearance() }); }}>Forme personnalisée</button>
        <button type="button" className="btn" aria-pressed={!draft.appearance} onClick={() => patch({ appearance: null })}>Visuel Dofus</button>
      </div>
      {draft.appearance && <ShapeAppearancePicker shapes={EQUIPMENT_SHAPES} value={draft.appearance} onChange={appearance => patch({ appearance })}
        image={(shape, color) => equipmentShapeImage(ITEMS[draft.referenceId].type, { shape, color })} />}
      <details className="equipment-design-model"><summary>{!draft.appearance && <EquipmentIcon item={ITEMS[draft.referenceId]} />}<span>{draft.appearance ? 'Référence des règles' : 'Apparence'} : {ITEMS[draft.referenceId].name}<small>{draft.appearance ? 'Options du modèle de référence' : 'Changer le modèle'}</small></span></summary>
        <input type="search" aria-label="Rechercher une apparence" placeholder="Rechercher une apparence…" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="equipment-design-models">{models.map(item => <button type="button" className={draft.referenceId === item.id ? 'selected' : ''} key={item.id} onClick={() => pickModel(item)}><EquipmentIcon item={item} /><span>{item.name}<small>Niv. {item.level}</small></span></button>)}</div>
        <p>{draft.appearance ? 'La forme choisie sert d’icône dans le stuff et la barre d’armes. Elle n’ajoute pas d’accessoire au personnage.' : 'Les coiffes, capes et familiers reprennent aussi ce visuel en combat.'} Aucun bonus de panoplie n’est copié.</p>
      </details>
      </div>
      <div hidden={activeView !== 'bonus'}>
      <div className="equipment-design-section-heading"><h3>Caractéristiques</h3><button type="button" className="btn" onClick={() => patch({ stats: equipmentStats(ITEMS[draft.referenceId]) })}>Copier les bonus du modèle</button></div>
      <p className="equipment-design-caption">Jets fixes. Chaque bonus consomme le budget ; les malus ne donnent aucun crédit.</p>
      {result.item?.condition && <p className="equipment-design-caption">Condition du modèle conservée : {result.item.condition}.</p>}
      <div className="equipment-design-stat-list">{Object.entries(draft.stats).map(([key, value]) => <div className="equipment-design-stat" key={key}>
        <label htmlFor={`design-stat-${key}`}>{EQUIPMENT_STAT_RULES[key].label}<small>Plafond : {result.balance?.limits.statLimits[key] ?? '—'}</small></label>
        <input id={`design-stat-${key}`} type="number" step={1} value={value} aria-label={EQUIPMENT_STAT_RULES[key].label} onChange={event => stat(key, event.target.value)} />
        <button type="button" className="btn" aria-label={`Retirer ${EQUIPMENT_STAT_RULES[key].label}`} onClick={() => patch({ stats: Object.fromEntries(Object.entries(draft.stats).filter(([name]) => name !== key)) })}><Trash2 size={15} /></button></div>)}</div>
      <div className="equipment-design-add"><label className="field">Ajouter un bonus<select value={bonus} onChange={event => setBonus(event.target.value)}>{Object.entries(EQUIPMENT_STAT_RULES).filter(([key]) => draft.stats[key] === undefined || key === bonus).map(([key, rule]) => <option key={key} value={key}>{rule.label}</option>)}</select></label>
        <button type="button" className="btn" disabled={draft.stats[bonus] !== undefined} onClick={() => { stat(bonus, Math.min(result.balance?.limits.statLimits[bonus] || 1, bonus === 'vitalite' ? 100 : 1)); }}><Plus size={16} /> Ajouter</button></div>
      </div>
      {draft.weapon && <section hidden={activeView !== 'weapon'} className="equipment-design-weapon"><h3>Frappe de l’arme</h3><p>Zone, animation et prise à une ou deux mains : celles du modèle. Le bonus critique s’ajoute à chaque ligne.</p>
        <div className="equipment-design-fields">{[['pa', 'Coût en PA', 2, 7], ['critRate', 'Critique : 1 sur… (0 = aucun)', 0, 100], ['critBonus', 'Bonus critique par ligne', 0, 20]].map(([key, label, min, max]) => <label className="field" key={key}>{label}<input type="number" min={min} max={max} value={draft.weapon[key]} onChange={event => patch({ weapon: { ...draft.weapon, [key]: num(event.target.value) } })} /></label>)}
          {[0, 1].map(index => <label className="field" key={index}>Portée {index ? 'maximale' : 'minimale'}<input type="number" min={1} max={10} value={draft.weapon.range[index]} onChange={event => patch({ weapon: { ...draft.weapon, range: draft.weapon.range.map((n, i) => i === index ? num(event.target.value) : n) } })} /></label>)}</div>
        <div className="equipment-design-lines">{draft.weapon.lines.map((line, index) => <div key={index}><label className="field">Ligne {index + 1}<select value={line.id} onChange={event => patch({ weapon: { ...draft.weapon, lines: draft.weapon.lines.map((row, i) => i === index ? { ...row, id: num(event.target.value) } : row) } })}>{LINE_TYPES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {['min', 'max'].map(key => <label className="field" key={key}>{key === 'min' ? 'Min.' : 'Max.'}<input type="number" aria-label={`${key} ligne ${index + 1}`} min={1} max={80} value={line[key]} onChange={event => patch({ weapon: { ...draft.weapon, lines: draft.weapon.lines.map((row, i) => i === index ? { ...row, [key]: num(event.target.value) } : row) } })} /></label>)}
          <button type="button" className="btn" aria-label={`Retirer la ligne ${index + 1}`} onClick={() => patch({ weapon: { ...draft.weapon, lines: draft.weapon.lines.filter((_, i) => i !== index) } })}><Trash2 size={15} /></button></div>)}</div>
        <button type="button" className="btn" disabled={draft.weapon.lines.length >= 4} onClick={() => patch({ weapon: { ...draft.weapon, lines: [...draft.weapon.lines, { id: 100, min: 1, max: 2 }] } })}><Plus size={15} /> Ajouter une ligne ({draft.weapon.lines.length}/4)</button>
      </section>}
      {!result.valid && <div className="equipment-design-errors" role="alert"><strong>Pour enregistrer cet équipement</strong><ul>{result.errors.map((text, index) => <li key={index}>{text}</li>)}</ul>
        <button type="button" className="btn" onClick={() => patch(fitEquipmentBudget(draft))}><Wand2 size={16} /> Réduire les valeurs au budget</button></div>}
      <div className="equipment-design-actions"><button className="btn primary" type="submit" disabled={!result.valid || !library || library.blocked}><Save size={16} /> Enregistrer l’équipement</button>
        <AtelierExportButton selection={{ equipment: [draft] }} name={draft.name} label="Exporter cet équipement" />
        {onEquip && <button type="button" className="btn" disabled={!result.valid || !library || library.blocked} onClick={() => save(true)}>Enregistrer et équiper</button>}</div>
      {message && <p className="equipment-design-success" role="status">{message}</p>}{error && <p className="creator-warning" role="alert">{error}</p>}
      <p className="equipment-design-caption">Sauvegarde locale. Réglages dans cet atelier ; pas de forgemagie sur les créations. Ce budget estime la puissance et ne remplace pas les essais en combat.</p>
    </form><EquipmentBudgetCard result={result} /></div>
  </section>;
}
