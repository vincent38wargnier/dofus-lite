import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code2, Download, Copy, Check, Upload, X, FolderCode, Terminal } from 'lucide-react';
import { AI_STORAGE, AI_TEST_COMMANDS, buildCodingPrompt, downloadAiCodingProject } from '../bots/aiCodingProject';
import { aiBehaviorExample } from '../bots/aiFighterReference';

export default function AiCodeDialog({ draft, code, fighter, snapshot, onGoal, onImport, onClose }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null), [copied, setCopied] = useState(false);
  const goal = draft.promptBriefs?.[fighter.id] || '';
  const prompt = buildCodingPrompt({ name: draft.name, fighter, goal });
  useEffect(() => {
    const previous = document.activeElement;
    if (dialog.current?.showModal) dialog.current.showModal(); else dialog.current?.setAttribute('open', '');
    return () => previous?.focus?.();
  }, []);
  const keepFocus = e => {
    if (e.key !== 'Tab') return;
    const fields = [...dialog.current.querySelectorAll('button:not(:disabled),textarea,summary')].filter(el => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility()));
    const first = fields[0], last = fields.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  const download = async () => {
    setBusy(true); setNotice(null);
    try {
      await downloadAiCodingProject({ name: draft.name, code, fighter, goal, graph: draft.graph, origin: window.location.origin });
      setNotice({ ok: true, text: 'ZIP préparé. Décompressez-le, puis ouvrez ce dossier dans votre éditeur.' });
    } catch (error) { setNotice({ ok: false, text: error.message }); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); }
    catch { setNotice({ ok: false, text: 'Copie indisponible. Ouvrez « Lire le prompt » pour le sélectionner, ou utilisez PROMPT.md dans le ZIP.' }); }
  };
  return createPortal(<dialog ref={dialog} className="ai-prompt-dialog ai-code-dialog" aria-label="Code et fichiers de mon IA" onKeyDown={keepFocus} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><div><span className="ai-eyebrow">CLAUDE CODE · VS CODE · VOTRE ÉDITEUR</span><h2><FolderCode size={24}/> Votre IA, dans votre éditeur</h2><p>{draft.name} · {fighter.name} · niveau {snapshot?.level}</p></div><button type="button" autoFocus aria-label="Fermer les fichiers IA" className="ai-icon-button" onClick={onClose}><X size={22}/></button></header>
    <div className="ai-code-project-content">
      <div className="ai-code-storage"><Code2 size={20}/><p>Votre IA est actuellement <b>enregistrée dans ce navigateur</b>. Téléchargez son projet pour obtenir de vrais fichiers, à ouvrir dans l’éditeur de votre choix.</p></div>
      <div className="ai-code-project-grid"><section>
        <h3><span>1</span> Décrivez le comportement</h3><p>Le même brief accompagne votre personnage et tous ses sorts, y compris les détails de ses invocations.</p>
        <label className="ai-field">Mon plan de jeu<textarea rows="4" maxLength={3000} placeholder={aiBehaviorExample(snapshot)} value={goal} onChange={e => { onGoal(e.target.value); setCopied(false); }}/></label>
        <h3><span>2</span> Ouvrez le projet</h3><p>Décompressez le ZIP. Ouvrez le dossier dans Claude Code ou votre éditeur et utilisez <code>PROMPT.md</code> comme consigne.</p>
        <div className="ai-code-file-list"><div><Code2 size={17}/><span><b>bot.js</b><small>Le code à modifier.</small></span></div><div><FolderCode size={17}/><span><b>fighter.json + références</b><small>Votre personnage, ses sorts et les sources lisibles du moteur.</small></span></div><div><Terminal size={17}/><span><b>test.cjs + moteur inclus</b><small>Node.js 20+ · fonctionne hors ligne, sans npm.</small></span></div></div>
        <div className="ai-prompt-buttons"><button type="button" className="ai-button accent" disabled={busy || !snapshot || !code} onClick={download}><Download size={16}/>{busy ? 'Préparation du ZIP…' : 'Télécharger le projet'}</button><button type="button" className="ai-button" onClick={copy}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Prompt copié' : 'Copier la consigne'}</button></div>
        <details className="ai-code-details"><summary>Lire le prompt pour l’éditeur</summary><textarea aria-label="Prompt pour l’éditeur" rows="9" readOnly value={prompt}/></details>
      </section><section className="ai-code-test-panel">
        <h3><span>3</span> Testez avant de jouer</h3><p>Depuis le dossier extrait, lancez ces commandes. Votre assistant de code peut aussi les exécuter.</p>
        <div className="ai-code-commands">{AI_TEST_COMMANDS.map(test => <article key={test.name}><strong>{test.name}</strong><p>{test.detail}</p><pre><code>{test.command}</code></pre></article>)}</div>
        <p className="ai-code-hint">Les rapports donnent les erreurs, victoires, dégâts et tours. Un code valide n’est pas forcément une IA forte : comparez plusieurs essais.</p>
        <h3><span>4</span> Retrouvez-la dans le jeu</h3><p>Importez le <code>bot.js</code> modifié, testez puis enregistrez la nouvelle IA. Votre version précédente reste disponible.</p>
        <button type="button" className="ai-button" onClick={onImport}><Upload size={16}/> Importer mon code modifié</button><small>Les fichiers et le navigateur ne se synchronisent pas automatiquement.</small>
      </section></div>
      {notice && <p className={notice.ok ? 'ai-code-success' : 'ai-error'} role={notice.ok ? 'status' : 'alert'}>{notice.text}</p>}
      <details className="ai-code-details"><summary>Où sont les fichiers et les sauvegardes ?</summary><p>Le ZIP se trouve dans le dossier choisi pour vos téléchargements. Après extraction, <code>bot.js</code> est votre fichier éditable.</p><p>Dans le jeu à <code>{window.location.origin}</code>, les IA sont dans <code>localStorage[{JSON.stringify(AI_STORAGE.saved)}]</code> et les brouillons dans <code>{AI_STORAGE.drafts}</code>. Le dépôt ne contient pas automatiquement vos IA personnelles.</p><p>Les sources du jeu sont dans <code>src/bots/</code> ; le stockage est géré par <code>src/ui/botsStore.js</code>. Le ZIP fournit aussi les sources de Maison et les fonctions de test. Les modifier dans le kit ne modifie pas le moteur du jeu.</p></details>
    </div>
  </dialog>, document.body);
}
