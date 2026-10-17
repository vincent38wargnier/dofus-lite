import { PLATFORM } from '../platform/config';
import { neutralPackageExample } from '../platform/authoringPrompt';
import React, { useMemo, useRef, useState } from 'react';
import { Copy, Download, Upload, Sparkles } from 'lucide-react';
import { buildContentPrompt, packageSpecDocument } from '../content/packagePrompt';
import { packageExample } from '../content/contentPackage';
import { writeContentZip } from '../content/zip';
import { importWorkshopFile, atelierCounts } from './atelierArchive';
import { useCreations } from './CreationsContext';
import { useCustomEquipment } from './CustomEquipmentContext';
import { MAX_SPELL_SCORE, MAX_KIT_SCORE } from '../engine/spellBalance';
import { MAX_ITEM_SCORE, MAX_EQUIPMENT_SCORE } from '../engine/equipmentBalance';

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CreationPackageTools({ tab, onImported, compact = false, themes: savedThemes, onThemesChange }) {
  const { commit } = useCreations();
  const equipment = useCustomEquipment();
  const type = tab === 'characters' ? 'class' : 'dungeon';
  const [localThemes, setLocalThemes] = useState({});
  const themes = savedThemes || localThemes;
  const setThemes = onThemesChange || setLocalThemes;
  const theme = themes[type] || '';
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef(null), picker = useRef(null);
  const prompt = useMemo(() => buildContentPrompt({ type, theme }), [type, theme]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('Prompt complet copié. Collez-le dans votre IA : votre demande est tout en haut.');
    } catch (_) {
      setExpanded(true); setNotice('La copie automatique est indisponible. Le prompt est sélectionné ci-dessous : utilisez Copier ou téléchargez le fichier texte.');
      requestAnimationFrame(() => { preview.current?.focus(); preview.current?.select(); });
    }
  };
  const importFile = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setReport(null); setNotice('Vérification du JSON, des règles et des images…');
    try {
      const result = await importWorkshopFile(file, { commitCreations: commit, importEquipment: equipment?.importItems });
      const nextTab = ['characters', 'dungeons', 'equipment'].find(key => result[key].length);
      const entry = result[nextTab][0];
      setReport({ name: entry.name, warnings: result.warnings });
      setNotice(`« ${entry.name} » importé et sauvegardé. ${atelierCounts(result)}.`);
      onImported(nextTab, entry.id);
    } catch (error) { setReport({ errors: error.message.split('\n') }); setNotice('Import refusé : corrigez les erreurs ci-dessous. Vos créations existantes sont conservées.'); }
    finally { setBusy(false); }
  };
  return <section className="creator-package creator-card" aria-label="Créer avec une IA et importer un ZIP" data-package-panel>
    {!compact && <div className="creator-section-heading"><div><h3><Sparkles size={19} /> Créer avec une IA</h3>
      <p>Décrivez votre thème, copiez le prompt complet, puis importez le ZIP produit par votre IA.</p></div>
      <span className="creator-count">{type === 'class' ? 'Classe · 10 sorts max.' : 'Donjon · 8 ennemis max.'}</span></div>}
    {compact && <span className="creator-count">{type === 'class' ? 'Classe · 10 sorts max.' : 'Donjon · 8 ennemis max.'}</span>}
    <div className="creator-package-workflow">
      <label className="field">1. Ce que je veux créer<textarea rows="3" value={theme} onChange={event => { setThemes(previous => ({ ...previous, [type]: event.target.value })); setNotice(''); }}
        placeholder={type === 'class' ? 'Une classe de gardien des étoiles : lumière, protection, mobilité… Précisez les sorts et les faiblesses.' : 'Un donjon original : un roi de cristal, deux sentinelles, un dragon… Précisez les rôles et les sorts de chaque monstre.'} /></label>
      <div className="creator-package-actions"><button type="button" className="btn primary" onClick={copy}><Copy size={17} />2. Copier le prompt IA</button>
        <button type="button" className="btn" disabled={busy} onClick={() => picker.current.click()}><Upload size={17} />{busy ? 'Vérification…' : '3. Importer un ZIP'}</button>
        <input ref={picker} type="file" accept=".zip,application/zip" aria-label="Importer une classe ou un donjon ZIP" onChange={importFile} hidden />
      </div>
    </div>
    <details className="creator-package-resources" open={!compact}><summary>Règles & fichiers utiles</summary>
    <p className="muted small">Le prompt inclut les règles des sorts et des équipements : {MAX_SPELL_SCORE} points par sort, {MAX_KIT_SCORE} par grimoire ; {MAX_ITEM_SCORE} par objet, {MAX_EQUIPMENT_SCORE} par stuff avec des créations, hors artefacts. Le budget des objets dépend de leur niveau requis et de leur famille.</p>
    <p className="muted small">Le prompt IA crée une classe ou un donjon avec ses images. Pour partager aussi des équipements ou plusieurs créations, utilisez « Exporter » en haut de l’Atelier. L’équilibre se vérifie ensuite en combat.</p>
    <div className="creator-package-downloads">
      <button type="button" className="btn subtle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Masquer le prompt' : 'Voir le prompt complet'}</button>
      <button type="button" className="btn subtle" onClick={() => download(`prompt-${type}.txt`, prompt, 'text/plain;charset=utf-8')}><Download size={15} />Prompt .txt</button>
      <button type="button" className="btn subtle" onClick={() => download('dofus-lite-content-spec.json', JSON.stringify(packageSpecDocument(), null, 2), 'application/json')}><Download size={15} />Spécification et références</button>
      {!PLATFORM && <><a className="btn subtle" href="/templates/custom-class-authoring-kit.zip" download><Download size={15} />Kit de création complet</a>
      <a className="btn subtle" href="/templates/ai-design/index.html" target="_blank" rel="noreferrer"><Sparkles size={15} />Prompts & gabarits visuels</a>
      <a className="btn subtle" href="/templates/ai-design/spell-fx/index.html" target="_blank" rel="noreferrer"><Sparkles size={15} />Animations de sorts</a></>}
      <button type="button" className="btn subtle" onClick={() => download(`exemple-${type}.zip`, writeContentZip(new Map([[PLATFORM ? 'atelier.json' : 'content.json', JSON.stringify(PLATFORM ? neutralPackageExample(type) : packageExample(type), null, 2)]])), 'application/zip')}><Download size={15} />Exemple ZIP jouable</button>
    </div><p className="muted small">Le kit contient aussi les guides des cartes, animations et objets. Les personnages et icônes de sorts sont importables ; les décors de carte, images d’équipement et nouvelles animations de sorts restent des designs préparatoires.</p></details>
    {expanded && <label className="field creator-package-preview">Prompt prêt à copier · {prompt.length.toLocaleString('fr')} caractères<textarea ref={preview} readOnly rows="12" value={prompt} onFocus={event => event.target.select()} /></label>}
    {notice && <p role="status" className={report?.errors ? 'creator-warning' : 'creator-spell-save-notice'}>{notice}</p>}
    {report?.errors && <ul className="creator-package-errors" role="alert">{report.errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
    {report?.warnings?.length > 0 && <details className="creator-package-report"><summary>{report.name} · {report.warnings.length} points à vérifier en combat</summary>
      <ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
  </section>;
}
