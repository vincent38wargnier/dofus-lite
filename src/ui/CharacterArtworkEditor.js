import React, { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Upload } from 'lucide-react';
import { ARTWORK_TEMPLATE_BASE, CHARACTER_ARTWORK_SPEC, importCharacterArtwork, importCharacterArtworkStep, useCharacterArtwork } from './characterArtwork';
import WorkshopHelp, { artworkStepPrompt } from './WorkshopHelp';
import CustomCharacterSprite from './CustomCharacterSprite';
import ShapeAppearancePicker from './ShapeAppearancePicker';
import { CHARACTER_SHAPES, characterShapeId, parseCharacterShape, characterShapeImage, DEFAULT_CUSTOM_COLOR } from '../visuals/customShapes';

export default function CharacterArtworkEditor({ artworkId, name, onChange }) {
  const shape = parseCharacterShape(artworkId);
  const [mode, setMode] = useState(shape ? 'shape' : artworkId ? 'images' : 'client');
  const previousShape = useRef(shape || { shape: 'wanderer', color: DEFAULT_CUSTOM_COLOR });
  const previousImages = useRef(!shape && artworkId ? artworkId : null);
  const [pose, setPose] = useState('static');
  const { artwork } = useCharacterArtwork(artworkId);
  const pickShape = appearance => { previousShape.current = appearance; onChange(characterShapeId(appearance.shape, appearance.color)); };
  return <section className="creator-card character-custom-appearance" aria-label="Apparence de la classe">
    <h3>Apparence de {name || 'votre personnage'}</h3><p>Une silhouette et votre couleur pour reconnaître votre création au premier regard.</p>
    <div className="appearance-source" role="group" aria-label="Type d’apparence de la classe">
      <button type="button" className="btn" aria-pressed={mode === 'shape'} onClick={() => { setMode('shape'); pickShape(previousShape.current); }}>Forme personnalisée</button>
      <button type="button" className="btn" aria-pressed={mode === 'images'} onClick={() => { setMode('images'); if (previousImages.current) onChange(previousImages.current); }}>Mes images</button>
      <button type="button" className="btn" aria-pressed={mode === 'client'} onClick={() => { setMode('client'); onChange(null); }}>Visuel Dofus</button>
    </div>
    {mode === 'shape' && <div className="character-shape-layout">
      <ShapeAppearancePicker shapes={CHARACTER_SHAPES} value={shape || previousShape.current} onChange={pickShape}
        image={(id, color) => characterShapeImage(id, color, { pose: 'portrait' })} />
      <div><div className="character-shape-preview">{artwork && <CustomCharacterSprite artwork={artwork} pose={pose} />}<span>Sur le terrain</span></div>
        <label className="field">Aperçu de la silhouette<select value={pose} onChange={event => setPose(event.target.value)}>
          <option value="static">Repos</option><option value="walk">Marche</option><option value="cast">Lancer un sort</option></select></label></div>
    </div>}
    {mode === 'images' && <ImportedArtworkEditor artworkId={artworkId} name={name}
      onChange={id => { previousImages.current = id; onChange(id); }} />}
    {mode === 'client' && <p className="muted small">Le personnage reprend le visuel de la classe de référence choisie ci-dessus.</p>}
  </section>;
}

function ImportedArtworkEditor({ artworkId, name, onChange }) {
  const { artwork, error: readError } = useCharacterArtwork(artworkId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pose, setPose] = useState('static');
  const [direction, setDirection] = useState('SE');
  const [restart, setRestart] = useState(0);
  const [fileName, setFileName] = useState('idle-front.png');
  const [brief, setBrief] = useState('');
  const mounted = useRef(false);
  const latestChange = useRef(onChange); latestChange.current = onChange;
  const input = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = async (files, single = false) => {
    if (!files.length) return;
    setBusy(true); setError('');
    try {
      const id = single ? await importCharacterArtworkStep(artworkId, files[0], fileName, name) : await importCharacterArtwork(files, name);
      if (mounted.current) latestChange.current(id);
    } catch (problem) { if (mounted.current) setError(problem.message || 'Impossible de lire ces images.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const previewDirection = { suffix: ['NW', 'NE'].includes(direction) ? 'L' : 'R', mirror: ['SW', 'NE'].includes(direction) };
  return <details className="creator-artwork" open>
    <summary><ImagePlus size={20} /><strong>Images du personnage</strong><span>{artwork ? 'Apparence personnalisée' : 'Vos PNG · gabarits et import'}</span></summary>
    <div className="creator-artwork-content">
      <p>Commencez par la face, puis le dos et le portrait. Dessinez-les vous-même ou utilisez le prompt de chaque image. Les animations restent facultatives.</p>
      <div className="workshop-image-step">
        <label className="field">Image à préparer<select value={fileName} onChange={e => { setFileName(e.target.value); setError(''); }}>{CHARACTER_ARTWORK_SPEC.files.map(f => <option key={f.name} value={f.name}>{f.label} · {f.frames * 256} × 256{f.required ? '' : ' · facultatif'}</option>)}</select></label>
        <label className="field">À quoi ressemble {name} ?<textarea rows={2} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Un gardien de glace, armure sombre, yeux bleus…" /></label>
        <WorkshopHelp key={fileName} title={`Prompt : ${CHARACTER_ARTWORK_SPEC.files.find(f => f.name === fileName).label}`} manual="Joignez votre image de face approuvée pour garder la même identité. Dessin manuel : utilisez le gabarit ci-dessous et masquez ses guides avant l’export." prompt={artworkStepPrompt({ name, file: fileName, brief })} filename={`prompt-${fileName.replace('.png', '.txt')}`} />
        <div className="workshop-help-actions"><a className="btn" href={`${ARTWORK_TEMPLATE_BASE}/guides/${fileName.replace('.png', '.svg')}`} download>Gabarit de cette image</a>
          <label className={`btn primary workshop-file-button${busy ? ' disabled' : ''}`}>{busy ? 'Vérification…' : `Importer ${fileName}`}<input type="file" accept="image/png,.png" aria-label={`Importer ${fileName}`} disabled={busy} onChange={e => { load(Array.from(e.target.files), true); e.target.value = ''; }} /></label></div>
        <small>Un fichier à la fois. Les autres images sont conservées ; au premier import, les poses manquantes utilisent une silhouette provisoire.</small>
      </div>
      <div className="creator-artwork-actions">
        <a className="btn" href={`${ARTWORK_TEMPLATE_BASE}-kit.zip`} download><Download size={17} />Télécharger les gabarits</a>
        <a className="btn" href={`${ARTWORK_TEMPLATE_BASE}/index.html`} target="_blank" rel="noreferrer">Guide et liste des images</a>
        <button type="button" className="btn primary" disabled={busy} onClick={() => input.current.click()}><Upload size={17} />{busy ? 'Vérification des images…' : 'Importer les PNG'}</button>
        <input ref={input} type="file" accept="image/png,.png" multiple hidden aria-label="Images PNG du personnage" onChange={event => {
          load(Array.from(event.target.files)); event.target.value = '';
        }} />
      </div>
      {(error || readError) && <p className="creator-warning" role="alert">{error || readError}</p>}
      <div className="creator-artwork-layout">
        <div className="creator-artwork-preview-panel">
          <div className="creator-artwork-stage">{artwork ? <CustomCharacterSprite artwork={artwork} pose={pose} direction={previewDirection} restart={restart} />
            : <img src={`${ARTWORK_TEMPLATE_BASE}/guides/idle-front.svg`} alt="Gabarit 256 × 256 : pieds au point 128, 224" />}</div>
          <p className="muted small">{artwork ? `${Object.keys(artwork.images).length} images enregistrées dans ce navigateur.` : 'Une case = 256 × 256 px. Pieds à (128, 224).'}<br />Face ↘ / dos ↖ ; les deux autres directions sont en miroir.</p>
          {artwork && <><div className="creator-artwork-controls"><label className="field">Animation d’aperçu<select value={pose} onChange={event => { setPose(event.target.value); setRestart(value => value + 1); }}>
            <option value="static">Repos</option><option value="walk">Marche</option><option value="cast">Sort / arme</option><option value="hit">Impact reçu</option></select></label>
            <label className="field">Orientation d’aperçu<select value={direction} onChange={event => setDirection(event.target.value)}>
              <option value="SE">Face ↘</option><option value="SW">Face ↙</option><option value="NW">Dos ↖</option><option value="NE">Dos ↗</option></select></label></div>
            <button type="button" className="btn" onClick={() => setRestart(value => value + 1)}>Rejouer l’animation</button></>}
        </div>
        <div className="creator-artwork-file-list"><table><thead><tr><th>Fichier</th><th>Taille</th><th>Images</th><th>Statut</th></tr></thead><tbody>
          {CHARACTER_ARTWORK_SPEC.files.map(file => <tr key={file.name}><td><code>{file.name}</code><small>{file.label}</small></td>
            <td>{file.frames * 256} × 256</td><td>{file.frames}</td><td>{artwork?.images[file.name] ? artwork.builtin ? 'Silhouette' : '✓ Présent' : file.required ? 'À créer' : 'Facultatif'}</td></tr>)}
        </tbody></table></div>
      </div>
      <p className="muted small">Dessinez la tenue complète, coiffe, cape et compagnon compris. Les statistiques de votre équipement s’appliquent en combat. Sans planche d’animation, le personnage utilise sa pose de repos.</p>
      <p className="muted small">PNG transparents · 2 Mio par fichier, 12 Mio au total. « Importer les PNG » remplace le lot entier. Le bouton de l’image choisie ne remplace que ce fichier. L’export ZIP conserve l’apparence complète.</p>
    </div>
  </details>;
}
