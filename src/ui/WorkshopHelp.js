import React, { useState } from 'react';
import { Check, Copy, Download, Sparkles } from 'lucide-react';
import { visualPromptCatalogue } from '../content/visualPrompts';
import '../styles/workshopGuide.css';

export function downloadWorkshopFile(name, value, type = 'text/plain') {
  const url = URL.createObjectURL(value instanceof Blob ? value : new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function artworkStepPrompt({ name, file, brief = '', spell }) {
  const source = visualPromptCatalogue().find(row => spell ? row.category === 'spellIcon' : row.output.endsWith(`/${file}`));
  return `CRÉATION : ${name || 'Mon personnage'}.\nDIRECTION ARTISTIQUE : ${brief || 'Fantasy originale, silhouette lisible, couleurs cohérentes.'}\n${spell ? `SORT : ${spell.name}. ${spell.description}\nRÈGLES À CONSERVER : ${spell.pa} PA, portée ${spell.rangeMin}–${spell.rangeMax}, ${spell.effects.map(e => `${e.kind} ${e.min}–${e.max} ${e.element || ''}, zone ${e.zone}`).join('; ')}.\n` : ''}Produis uniquement cette image. Utilise les autres images déjà approuvées comme références. Ne modifie aucune règle de jeu.\n\n${source?.prompt || ''}`;
}

// Always optional: the manual editor is the primary action. Prompts remain
// editable and downloadable if clipboard access is unavailable (HTTP/LAN).
export default function WorkshopHelp({ title = 'Un coup de main avec l’IA ?', manual, prompt, filename = 'prompt-image.txt', children }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  return <details className="workshop-ai-help">
    <summary><Sparkles size={16} />{title}<small>Facultatif</small></summary>
    <p>{manual}</p>{children}
    <textarea aria-label={`Prompt : ${title}`} readOnly value={prompt} rows={7} onFocus={e => e.target.select()} />
    <div className="workshop-help-actions"><button type="button" className="btn" onClick={async () => {
      try { await navigator.clipboard.writeText(prompt); setCopied(true); setError(''); }
      catch (_) { setError('Sélectionnez le texte ci-dessus, ou téléchargez le prompt.'); }
    }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copié' : 'Copier le prompt'}</button>
      <button type="button" className="btn" onClick={() => downloadWorkshopFile(filename, prompt)}><Download size={15} />Télécharger</button></div>
    {error && <p role="status">{error}</p>}
  </details>;
}

export function WorkshopStepIntro({ number, title, children }) {
  return <div className="workshop-step-intro"><span>{number}</span><div><h3>{title}</h3><p>{children}</p></div></div>;
}
