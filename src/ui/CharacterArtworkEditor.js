import React, { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Upload } from 'lucide-react';
import { ARTWORK_TEMPLATE_BASE, CHARACTER_ARTWORK_SPEC, importCharacterArtwork, useCharacterArtwork } from './characterArtwork';
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
    <h3>Apparence de votre classe</h3><p>Une silhouette et votre couleur pour reconnaître votre création au premier regard.</p>
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
    {mode === 'images' && <ImportedArtworkEditor artworkId={shape ? null : artworkId} name={name}
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
  const mounted = useRef(false);
  const latestChange = useRef(onChange); latestChange.current = onChange;
  const input = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = async files => {
    if (!files.length) return;
    setBusy(true); setError('');
    try {
      const id = await importCharacterArtwork(files, name);
      if (mounted.current) latestChange.current(id);
    } catch (problem) { if (mounted.current) setError(problem.message || 'Impossible de lire ces images.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const previewDirection = { suffix: ['NW', 'NE'].includes(direction) ? 'L' : 'R', mirror: ['SW', 'NE'].includes(direction) };
  return <details className="creator-artwork" open>
    <summary><ImagePlus size={20} /><strong>Images du personnage</strong><span>{artwork ? 'Apparence personnalisée' : 'Vos PNG · gabarits et import'}</span></summary>
    <div className="creator-artwork-content">
      <p>Créez votre apparence avec <strong>3 PNG obligatoires</strong> : portrait, face et dos. Ajoutez les 6 planches d’animation quand vous le souhaitez.</p>
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
            <td>{file.frames * 256} × 256</td><td>{file.frames}</td><td>{artwork?.images[file.name] ? '✓ Importé' : file.required ? 'Obligatoire' : 'Facultatif'}</td></tr>)}
        </tbody></table></div>
      </div>
      <p className="muted small">Dessinez la tenue complète, coiffe, cape et compagnon compris. Les statistiques de votre équipement s’appliquent en combat. Sans planche d’animation, le personnage utilise sa pose de repos.</p>
      <p className="muted small">PNG transparents · 2 Mio par fichier, 12 Mio au total. Sélectionnez toutes les images ensemble : chaque import remplace l’apparence. Conservez vos fichiers PNG pour les réutiliser sur un autre navigateur.</p>
    </div>
  </details>;
}
