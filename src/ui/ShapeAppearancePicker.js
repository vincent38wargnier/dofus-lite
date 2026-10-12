import React from 'react';
import { Check, Palette, Sparkles } from 'lucide-react';
import { CUSTOM_COLORS } from '../visuals/customShapes';
import '../styles/customAppearance.css';

export default function ShapeAppearancePicker({ shapes, value, onChange, image, label = 'Apparence personnalisée' }) {
  return <section className="shape-picker" aria-label={label} style={{ '--appearance-color': value.color }}>
    <div className="shape-picker-heading"><Sparkles size={17} /><strong>Forme & couleur</strong><span>Création originale</span></div>
    <div className="shape-options" role="group" aria-label="Forme du visuel">{shapes.map(shape => <button type="button" key={shape.id}
      aria-label={`Forme ${shape.name}`} aria-pressed={value.shape === shape.id} onClick={() => onChange({ ...value, shape: shape.id })}>
      <span className="shape-option-art"><img src={image(shape.id, value.color)} alt="" draggable={false} /></span>
      <span className="shape-option-name">{shape.name}</span><span className="shape-option-detail">{shape.detail}</span>
      {value.shape === shape.id && <span className="shape-selected"><Check size={13} strokeWidth={2.5} /></span>}
    </button>)}</div>
    <div className="shape-palette" role="group" aria-label="Couleur du visuel"><span className="shape-palette-label"><Palette size={15} /> Teinte <span>{CUSTOM_COLORS.find(color => color.value === value.color.toLowerCase())?.name || value.color.toUpperCase()}</span></span>
      {CUSTOM_COLORS.map(color => <button type="button" key={color.value} style={{ '--swatch': color.value }} aria-label={`Couleur ${color.name}`}
        title={color.name} aria-pressed={value.color.toLowerCase() === color.value} onClick={() => onChange({ ...value, color: color.value })} />)}
      <label className="shape-custom-color" title="Choisir une autre couleur"><input type="color" aria-label="Couleur personnalisée" value={value.color}
        onChange={event => onChange({ ...value, color: event.target.value })} /><span>Autre</span></label>
    </div>
  </section>;
}
