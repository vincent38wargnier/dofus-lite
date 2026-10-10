import React, { useMemo, useRef, useState } from 'react';
import { Copy, Download, Upload, Sparkles } from 'lucide-react';
import { buildContentPrompt, packageSpecDocument } from '../content/packagePrompt';
import { packageExample } from '../content/contentPackage';
import { writeContentZip } from '../content/zip';
import { importContentFile } from './contentPackageImport';
import { useCreations } from './CreationsContext';

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CreationPackageTools({ tab, onImported }) {
  const { commit } = useCreations();
  const type = tab === 'characters' ? 'class' : 'dungeon';
  const [themes, setThemes] = useState({});
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
      const result = await importContentFile(file, commit);
      setReport({ name: result.entry.name, warnings: result.warnings });
      setNotice(`« ${result.entry.name} » importé et sauvegardé. La création est prête à tester.`);
      onImported(result.tab, result.entry.id);
    } catch (error) { setReport({ errors: error.message.split('\n') }); setNotice('Import refusé : corrigez les erreurs ci-dessous. Vos créations existantes sont conservées.'); }
    finally { setBusy(false); }
  };
  return <section className="creator-package creator-card" aria-label="Créer avec une IA et importer un ZIP" data-package-panel>
    <div className="creator-section-heading"><div><h3><Sparkles size={19} /> Créer avec une IA</h3>
      <p>Décrivez votre thème, copiez le prompt complet, puis importez le ZIP produit par votre IA.</p></div>
      <span className="creator-count">{type === 'class' ? 'Classe · 10 sorts max.' : 'Donjon · 8 ennemis max.'}</span></div>
    <div className="creator-package-workflow">
      <label className="field">1. Ce que je veux créer<textarea rows="3" value={theme} onChange={event => { setThemes(previous => ({ ...previous, [type]: event.target.value })); setNotice(''); }}
        placeholder={type === 'class' ? 'Une classe Jedi : sabre, poussée de Force, mobilité… Précisez les sorts et les faiblesses.' : 'Un donjon Game of Thrones : un roi, deux gardes, un dragon… Précisez les rôles et les sorts de chaque monstre.'} /></label>
      <div className="creator-package-actions"><button type="button" className="btn primary" onClick={copy}><Copy size={17} />2. Copier le prompt IA</button>
        <button type="button" className="btn" disabled={busy} onClick={() => picker.current.click()}><Upload size={17} />{busy ? 'Vérification…' : '3. Importer un ZIP'}</button>
        <input ref={picker} type="file" accept=".zip,application/zip" aria-label="Importer une classe ou un donjon ZIP" onChange={importFile} hidden />
      </div>
    </div>
    <p className="muted small">Règles, schéma JSON, visuels, références du jeu et exemple inclus dans le prompt. Images facultatives. Les plafonds sont contrôlés ; l’équilibre se vérifie ensuite en combat.</p>
    <div className="creator-package-downloads">
      <button type="button" className="btn subtle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Masquer le prompt' : 'Voir le prompt complet'}</button>
      <button type="button" className="btn subtle" onClick={() => download(`prompt-${type}.txt`, prompt, 'text/plain;charset=utf-8')}><Download size={15} />Prompt .txt</button>
      <button type="button" className="btn subtle" onClick={() => download('dofus-lite-content-spec.json', JSON.stringify(packageSpecDocument(), null, 2), 'application/json')}><Download size={15} />Spécification et références</button>
      <button type="button" className="btn subtle" onClick={() => download(`exemple-${type}.zip`, writeContentZip(new Map([['content.json', JSON.stringify(packageExample(type), null, 2)]])), 'application/zip')}><Download size={15} />Exemple ZIP jouable</button>
    </div>
    {expanded && <label className="field creator-package-preview">Prompt prêt à copier · {prompt.length.toLocaleString('fr')} caractères<textarea ref={preview} readOnly rows="12" value={prompt} onFocus={event => event.target.select()} /></label>}
    {notice && <p role="status" className={report?.errors ? 'creator-warning' : 'creator-spell-save-notice'}>{notice}</p>}
    {report?.errors && <ul className="creator-package-errors" role="alert">{report.errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
    {report?.warnings?.length > 0 && <details className="creator-package-report"><summary>{report.name} · {report.warnings.length} points à vérifier en combat</summary>
      <ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
  </section>;
}
